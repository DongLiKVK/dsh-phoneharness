import fs from 'node:fs'
import http from 'node:http'

import { applyCors, readJson, sendError, sendJson, sendNotModified } from './http.js'

/**
 * 对外给手机用的 HTTP/SSE 服务。
 *
 * 为什么不用 DSH 的 webServer：实测它只 bind 127.0.0.1，手机连不上。
 * 这里自己 createServer，绑 config.bind（默认 0.0.0.0）。
 */

const HEARTBEAT_MS = 20000
const MAX_STREAM_CLIENTS = 8
/**
 * 带图片的消息体上限。
 *
 * 图片在线上是 base64 塞进 JSON 的，体积约为原图 4/3；DSH 自己单图上限 20MB、
 * 单条消息合计 200MB，手机端会先压到 ~1600px/q85（几百 KB），这里给 40MB 足够。
 */
const MAX_MESSAGE_BYTES = 40 << 20

/** 手机端「深度思考」开关能选到的档位；只在 catalog 里广告，不做强校验。 */
const REASONING_VALUES = ['high', 'max']
/**
 * 手机传上来的思考强度（reasoning）。
 *
 * 这里只做浅校验：字符串、去空白后 1..16 字符；其余一律当成「没传」，让 DSH 用模型默认档。
 * 真正认不认这档由 DSH 判断（runtime 里会走 llm.resolveCallConfig），不支持时回 400
 * bad_reasoning / bad_model，而不是把整条消息打死在网关层。
 */
function reasoningOf(body) {
  const raw = body && body.reasoning
  if (typeof raw !== 'string') return ''
  const value = raw.trim()
  if (!value || value.length > 16) return ''
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return ''
  return value
}

/**
 * 弱 ETag：把一串稳定描述压成短哈希。
 *
 * 不引 crypto 是因为这里只需要「变了没有」，不需要抗碰撞强度；位数够用就好。
 */
function weakEtag(seed) {
  const text = String(seed == null ? '' : seed)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return 'W/"' + text.length.toString(16) + '-' + hash.toString(16) + '"'
}

/** 请求带的 If-None-Match 是否命中（按弱比较，允许逗号列表）。 */
function etagHit(req, etag) {
  const raw = req.headers['if-none-match']
  if (typeof raw !== 'string' || !raw.trim()) return false
  const mine = String(etag).replace(/^W\//, '')
  return raw.split(',').some((one) => one.trim().replace(/^W\//, '') === mine)
}

function bearer(req) {
  const raw = String(req.headers.authorization || '')
  // 线上真实令牌是 64 位 hex。这里放宽到任意可见 ASCII 短串，只为让自测桩能用
  // 固定令牌（devtoken）跑通整条链路；真正的鉴权仍是 devices.find 的精确比对。
  const match = /^Bearer\s+([A-Za-z0-9_-]{4,128})$/.exec(raw.trim())
  return match ? match[1] : null
}

/**
 * 把内部异常翻成手机能看懂的一句中文 + 合适的 HTTP 状态。
 *
 * 最要紧的一条是模型不支持图片：DSH 会抛 session/attachment-invalid 且
 * reason=MODEL_DOES_NOT_SUPPORT_IMAGES，直接透出去用户只会看到一串英文。
 */
function describe(error) {
  const message = String((error && error.message) || error || 'unknown')
  const reason = String((error && error.reason) || (error && error.details && error.details.reason) || '')
  const code = String((error && error.code) || '')
  if (reason === 'MODEL_DOES_NOT_SUPPORT_IMAGES' || /does not support image input/i.test(message)) {
    return [400, 'model_no_image', '当前模型不支持图片输入，请先换一个多模态模型再发图']
  }
  if (reason === 'INVALID_IMAGE_BASE64' || reason === 'IMAGE_TYPE_MISMATCH' || reason === 'IMAGE_TOO_LARGE' || reason === 'INVALID_IMAGE') {
    return [400, 'bad_image', '这张图处理不了（格式、大小或编码不对），换一张试试']
  }
  if (code === 'body_too_large') return [413, 'body_too_large', '消息太大了，图片先压缩一下再发']
  if (code === 'bad_json') return [400, 'bad_json', '请求体不是合法 JSON']
  if (code === 'not_found') return [404, 'not_found', message]
  if (code === 'bad_request') return [400, 'bad_request', message]
  if (code === 'session/not-found' || code === 'not_found_session') return [404, 'session_not_found', '这个会话不存在了']
  if (code === 'session_not_found') return [404, 'session_not_found', message]
  // 兜底：底层直接抛 "session \"x\" not found" / "no such session" 的情况。
  if (/no such session/i.test(message) || /^session ".*" not found$/.test(message)) {
    return [404, 'session_not_found', '这个会话不存在了']
  }
  if (code === 'bad_title') return [400, 'bad_title', message]
  if (code === 'title_unavailable') return [503, 'title_unavailable', message]
  if (code === 'rename_failed') return [500, 'rename_failed', message]
  if (code === 'archive_unavailable') return [503, 'archive_unavailable', message]
  if (code === 'archive_failed') return [500, 'archive_failed', message]
  if (code === 'pin_unavailable') return [503, 'pin_unavailable', message]
  if (code === 'pin_failed') return [500, 'pin_failed', message]
  if (code === 'subagent_session') return [400, 'subagent_session', message]
  if (code === 'service_unavailable') return [503, 'service_unavailable', message]
  if (code === 'bad_reasoning') return [400, 'bad_reasoning', message]
  if (code === 'bad_answer') return [400, 'bad_answer', message]
  if (code === 'question_not_pending') return [400, 'question_not_pending', message]
  if (code === 'bad_model') return [400, 'bad_model', message]
  if (code === 'bad_route') return [400, 'bad_route', message]
  if (code === 'bad_base_url') return [400, 'bad_base_url', message]
  if (code === 'bad_env') return [400, 'bad_env', message]
  if (code === 'bad_models') return [400, 'bad_models', message]
  if (code === 'custom_exists') return [409, 'custom_exists', message]
  if (code === 'unknown_custom') return [404, 'unknown_custom', message]
  if (code === 'config_unavailable') return [503, 'config_unavailable', message]
  if (code === 'default_unavailable') return [409, 'default_unavailable', message]
  // 用户主机的 harness 配置（契约 §1.2 / §1.3 的错误表，只加不删）。
  if (code === 'bad_path') return [400, 'bad_path', message]
  if (code === 'bad_name') return [400, 'bad_name', message]
  if (code === 'bad_workspace') return [400, 'bad_workspace', message]
  if (code === 'unknown_preset') return [400, 'unknown_preset', message]
  if (code === 'unknown_model') return [400, 'unknown_model', message]
  if (code === 'unknown_permission') return [400, 'unknown_permission', message]
  if (code === 'forbidden') return [403, 'forbidden', message]
  if (code === 'exists') return [409, 'exists', message]
  return [500, 'internal', message]
}

function sseWrite(res, event, data) {
  if (res.writableEnded) return
  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    res.write('event: ' + event + '\n')
    if (data && typeof data === 'object' && Number.isFinite(data.seq)) res.write('id: ' + String(data.seq) + '\n')
    res.write('data: ' + payload + '\n\n')
  } catch { /* 客户端刚断 */ }
}

export class PhoneServer {
  constructor({ runtime, harness, approvals, questions, devices, pairing, identity, options }) {
    this.runtime = runtime
    this.harness = harness || null
    this.approvals = approvals
    this.questions = questions
    this.devices = devices
    this.pairing = pairing
    this.identity = identity
    this.options = options
    this.clients = new Set()
    this.server = null
    this.servers = []
    this.port = 0
    this.lastError = null
    this.unsubscribe = null
  }

  /** 一个地址一个 server，共用同一个 handle；任一绑上就算起来了。 */
  async start() {
    const configured = Array.isArray(this.options.binds) ? this.options.binds : []
    const binds = (configured.length ? configured : [String(this.options.bind || '0.0.0.0')])
      .filter((entry) => typeof entry === 'string' && entry.trim())
    this.servers = []
    for (const bind of binds) {
      const server = http.createServer((req, res) => {
        void this.handle(req, res).catch((error) => {
          try { sendError(res, ...describe(error)) } catch { /* 已断开 */ }
        })
      })
      server.headersTimeout = 30000
      server.requestTimeout = 60000
      const ok = await new Promise((resolve) => {
        const done = (value) => resolve(value)
        server.once('error', (error) => {
          this.lastError = bind + ' ' + String((error && error.message) || error)
          try { server.close() } catch { /* 没起来 */ }
          done(false)
        })
        server.listen(this.port || this.options.port, bind, () => {
          this.port = server.address().port
          done(true)
        })
      })
      if (ok) this.servers.push(server)
    }
    this.server = this.servers[0] || null
    if (!this.port) return null
    this.unsubscribe = this.runtime.subscribe((payload) => this.broadcast(payload))
    const heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (client.res.writableEnded) { this.clients.delete(client); continue }
        try { client.res.write(': ping\n\n') } catch { this.clients.delete(client) }
      }
    }, HEARTBEAT_MS)
    heartbeat.unref?.()
    this.heartbeat = heartbeat
    return this.port
  }

  broadcast(payload) {
    if (!this.clients.size) return
    if (payload.type === 'item') {
      const body = { item: payload.item, sessionId: payload.sessionId }
      for (const client of this.clients) {
        if (client.sessionId && client.sessionId !== payload.sessionId) continue
        sseWrite(client.res, 'item', body)
      }
      return
    }
    if (payload.type === 'status' || payload.type === 'done') {
      for (const client of this.clients) {
        if (client.sessionId && client.sessionId !== payload.sessionId) continue
        sseWrite(client.res, payload.type, payload)
      }
      return
    }
    if (payload.type === 'approval') {
      for (const client of this.clients) {
        if (client.sessionId && client.sessionId !== payload.sessionId) continue
        sseWrite(client.res, 'approval', payload)
      }
      return
    }
    // 模型反问（ask_user_question）：payload 与 GET /v1/questions 的一行同构。
    if (payload.type === 'question') {
      for (const client of this.clients) {
        if (client.sessionId && client.sessionId !== payload.sessionId) continue
        sseWrite(client.res, 'question', payload)
      }
    }
  }

  async handle(req, res) {
    applyCors(res)
    const url = new URL(req.url || '/', 'http://localhost')
    const method = String(req.method || 'GET').toUpperCase()
    const path = url.pathname

    if (method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (!path.startsWith('/v1/')) {
      if (path === '/' || path === '/health') {
        sendJson(res, 200, { ok: true, name: this.options.name, version: this.options.version, needsPair: !this.devices.list().length })
        return
      }
      // 手机端「检查更新」只问元数据（版本号 + md5），不下载整包；同样不用配对。
      if ((path === '/apk/meta' || path === '/apk/info') && method === 'GET') {
        const meta = typeof this.options.apkMeta === 'function' ? this.options.apkMeta() : null
        if (!meta) {
          sendError(res, 404, 'no_apk', '插件包里没有带 APK')
          return
        }
        sendJson(res, 200, { ok: true, version: this.options.version, apk: meta })
        return
      }
      // 手机浏览器直接打开 http://<电脑IP>:8737/apk 就能下安装包，不用先配对。
      if ((path === '/apk' || path === '/dsh-phone.apk') && method === 'GET') {
        this.sendApk(req, res)
        return
      }
      sendError(res, 404, 'not_found', '没有这个接口')
      return
    }

    const route = path.slice(4)

    if (route === 'ping' && method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        name: this.options.name,
        version: this.options.version,
        needsPair: !this.devices.list().length,
        time: new Date().toISOString(),
        probe: 'hmr-1',
      })
      return
    }

    if (route === 'pair' && method === 'POST') {
      const body = await readJson(req, 1 << 16).catch(() => ({}))
      if (!this.pairing.consume(body.code)) {
        sendError(res, 401, 'bad_code', '配对码不正确或已过期，请在电脑上看一眼新码')
        return
      }
      const device = this.devices.add(body.device)
      sendJson(res, 200, {
        token: device.token,
        deviceId: device.id,
        server: { name: this.options.name, version: this.options.version },
      })
      return
    }

    // 以下全部需要令牌
    const token = bearer(req)
    const device = token ? this.devices.find(token) : null
    if (!device) {
      sendError(res, 401, 'unauthorized', '请先在手机上配对')
      return
    }
    this.devices.touch(device)

    if (route === 'catalog' && method === 'GET') {
      const catalog = await this.runtime.catalog()
      // 「深度思考」开关：手机端只据此画档位选择器，选完仍由 DSH 自己校验。
      catalog.reasoning = { supported: true, values: REASONING_VALUES.slice() }
      sendJson(res, 200, catalog)
      return
    }

    /* ------------------------------------------------------------ */
    /* 身份：电脑端 harness 登录的账号（含头像），抽屉底部账号栏用       */
    /* ------------------------------------------------------------ */

    if (route === 'me' && method === 'GET') {
      let user = null
      try {
        user = this.identity ? await this.identity.current({ force: url.searchParams.get('fresh') === '1' }) : null
      } catch { user = null }
      sendJson(res, 200, {
        ok: true,
        user: user || { id: '', name: '', contact: null, avatarUrl: null, source: 'none' },
        host: { name: this.options.name, version: this.options.version },
      })
      return
    }

    // 头像字节：平台 CDN 的 URL 由 host 代取，手机只认这个带令牌的接口。
    if (route === 'me/avatar' && method === 'GET') {
      let got = null
      try { got = this.identity ? await this.identity.avatar() : null } catch { got = null }
      if (!got || !got.bytes || !got.bytes.length) {
        sendError(res, 404, 'no_avatar', '这台电脑上的账号还没有头像')
        return
      }
      res.writeHead(200, {
        'Content-Type': String(got.type || 'image/png'),
        'Content-Length': String(got.bytes.length),
        'Cache-Control': 'private, max-age=3600',
      })
      res.end(got.bytes)
      return
    }

    /* ------------------------------------------------------------ */
    /* 模型可选配置：App 新版走这四条，旧版仍用 /v1/catalog，互不影响   */
    /* ------------------------------------------------------------ */

    if (route === 'models' && method === 'GET') {
      sendJson(res, 200, await this.runtime.models())
      return
    }

    if (route === 'models/default' && method === 'POST') {
      const body = await readJson(req, 1 << 16)
      sendJson(res, 200, await this.runtime.setDefaultModel(body))
      return
    }

    if (route === 'models/custom' && method === 'POST') {
      const body = await readJson(req, 1 << 16)
      sendJson(res, 200, await this.runtime.addCustomModel(body))
      return
    }

    if (method === 'DELETE' && route.startsWith('models/custom/')) {
      let name = route.slice('models/custom/'.length)
      try { name = decodeURIComponent(name) } catch { /* 保持原样 */ }
      sendJson(res, 200, await this.runtime.removeCustomModel(name))
      return
    }

    /* ------------------------------------------------------------ */
    /* 用户主机的 harness 配置：模式 / 工作区 / 权限 / 默认模型        */
    /* 契约 §1：GET /v1/harness、POST /v1/harness/config、            */
    /*          GET /v1/harness/dirs、POST /v1/harness/dirs（新建）   */
    /* ------------------------------------------------------------ */

    if (route.startsWith('harness') && !this.harness) {
      sendError(res, 503, 'config_unavailable', '这台电脑上的 harness 配置通道没有起来')
      return
    }

    if (route === 'harness' && method === 'GET') {
      sendJson(res, 200, await this.harness.state())
      return
    }

    if (route === 'harness/config' && method === 'POST') {
      const body = await readJson(req, 1 << 16)
      sendJson(res, 200, await this.harness.configure(body))
      return
    }

    if (route === 'harness/dirs' && method === 'GET') {
      sendJson(res, 200, await this.harness.listDirs({
        path: url.searchParams.get('path'),
        showHidden: url.searchParams.get('showHidden'),
      }))
      return
    }

    if (route === 'harness/dirs' && method === 'POST') {
      const body = await readJson(req, 1 << 16)
      sendJson(res, 201, await this.harness.createDir(body))
      return
    }

    if (route === 'sessions' && method === 'GET') {
      // ?archived=1 是「归档箱」：只列归档的（对齐官方 App 的归档入口）；
      // ?includeArchived=1 才是「全都要」。
      const archivedOnly = url.searchParams.get('archived') === '1'
      const includeArchived = url.searchParams.get('includeArchived') === '1'
      const rows = await this.runtime.listSessions({ archivedOnly, includeArchived })
      // 列表也会被 App 每进一次前台拉一遍：内容没变就 304，省流量也省渲染。
      const etag = weakEtag(rows.map((row) => [
        row.id, row.updatedAt, row.pinned ? 1 : 0, row.archived ? 1 : 0,
        row.status, row.itemCount, row.title,
      ].join(':')).join('|'))
      if (etagHit(req, etag)) { sendNotModified(res, etag); return }
      sendJson(res, 200, { sessions: rows }, { ETag: etag })
      return
    }

    if (route === 'sessions' && method === 'POST') {
      const body = await readJson(req, MAX_MESSAGE_BYTES)
      const result = await this.runtime.createSession({
        cwd: body.cwd,
        text: body.text,
        requestId: body.requestId,
        model: body.model,
        permission: body.permission,
        reasoning: reasoningOf(body),
        agentPreset: body.agentPreset,
        images: Array.isArray(body.images) ? body.images : [],
      })
      sendJson(res, 200, result)
      return
    }

    if (route === 'stream' && method === 'GET') {
      await this.openStream(req, res, url)
      return
    }

    // 手机重连后补拉还没处理的审批（SSE 可能错过一帧，这里兜底）。
    if (route === 'approvals' && method === 'GET') {
      const sessionId = url.searchParams.get('session') || ''
      const pending = this.approvals.listPending(sessionId || undefined).map((entry) => ({
        eventId: entry.eventId,
        sessionId: entry.sessionId,
        toolName: entry.toolName,
        callId: entry.callId || null,
        reason: entry.reason,
        createdAt: entry.createdAt,
        actions: entry.actions,
      }))
      sendJson(res, 200, { approvals: pending })
      return
    }

    // 手机重连后补拉还没回答的模型反问（SSE 可能错过一帧，这里兜底）。
    // 行形状与 SSE 'question' 事件完全一致，Android 端一份解析即可。
    if (route === 'questions' && method === 'GET') {
      const sessionId = url.searchParams.get('session') || ''
      const rows = this.questions ? this.questions.listPending(sessionId || undefined) : []
      sendJson(res, 200, { questions: rows })
      return
    }

    const parts = route.split('/')
    if (parts[0] === 'sessions' && parts.length >= 2) {
      const sessionId = decodeURIComponent(parts[1])
      const action = parts[2] || ''

      if (!action && method === 'GET') {
        const full = await this.runtime.sessionDetail(sessionId)
        const head = full.items.length ? full.items[full.items.length - 1] : null
        const etag = weakEtag([
          full.id, full.seq, full.items.length,
          head ? head.id : '', head ? String(head.text || '').length : 0,
          full.title, full.status, full.pinned ? 1 : 0, full.archived ? 1 : 0,
        ].join('|'))
        if (etagHit(req, etag)) { sendNotModified(res, etag); return }

        // ?since=N：App 本地已经有 N 之前的内容，只回新增的条目。
        // 末尾那一条可能还在长（同一个 id 文本变长），单独带一份 head 让 App 覆盖。
        const rawSince = url.searchParams.get('since')
        const since = rawSince == null || rawSince === '' ? NaN : Number(rawSince)
        if (Number.isFinite(since) && since > 0 && since <= full.seq) {
          const rows = full.items.filter((item) => Number(item && item.seq) > since)
          sendJson(res, 200, {
            id: full.id, title: full.title, cwd: full.cwd, status: full.status,
            seq: full.seq, delta: true, items: rows, head,
            pinned: full.pinned, archived: full.archived,
          }, { ETag: etag })
          return
        }

        // ?tail=N：第一次打开（本地没缓存）只取尾巴，3445 条不必整包拖到手机上。
        // truncated=true 告诉 App「更早的还在电脑上」，往上翻时再来要全量。
        const rawTail = url.searchParams.get('tail')
        const tail = rawTail == null || rawTail === '' ? NaN : Number(rawTail)
        if (Number.isFinite(tail) && tail > 0 && full.items.length > tail) {
          const cut = Math.max(20, Math.min(2000, Math.floor(tail)))
          sendJson(res, 200, {
            ...full, items: full.items.slice(-cut), truncated: true, total: full.items.length,
          }, { ETag: etag })
          return
        }

        sendJson(res, 200, full, { ETag: etag })
        return
      }
      if (action === 'messages' && method === 'POST') {
        const body = await readJson(req, MAX_MESSAGE_BYTES)
        const text = String(body.text || '')
        const images = Array.isArray(body.images) ? body.images : []
        if (!text.trim() && !images.length) {
          sendError(res, 400, 'bad_request', '消息不能为空')
          return
        }
        if (!body.requestId) {
          sendError(res, 400, 'bad_request', '缺少 requestId')
          return
        }
        const result = await this.runtime.prompt(sessionId, text, String(body.requestId), {
          model: body.model,
          permission: body.permission,
          reasoning: reasoningOf(body),
        }, undefined, images)
        sendJson(res, 200, result)
        return
      }
      // 手机显示会话里的图片：走 Bearer 令牌，host 侧校验这张图确实属于这个会话。
      if (action === 'image' && method === 'GET') {
        const attachmentId = decodeURIComponent(parts.slice(3).join('/'))
        this.sendImage(res, sessionId, attachmentId)
        return
      }
      if (action === 'interrupt' && method === 'POST') {
        const result = this.runtime.interrupt(sessionId)
        this.approvals.expireSession(sessionId)
        this.questions?.expireSession(sessionId)
        sendJson(res, 200, result)
        return
      }
      // 改名：body {title} → {ok:true,title,seq}
      if (action === 'rename' && method === 'POST') {
        const body = await readJson(req, 1 << 16)
        const result = await this.runtime.renameSession(sessionId, body.title)
        sendJson(res, 200, { ok: true, title: result.title, seq: result.seq })
        return
      }
      // 归档：body {} → {ok:true}；归档后默认不再出现在 GET /v1/sessions。
      if (action === 'archive' && method === 'POST') {
        await this.runtime.archiveSession(sessionId)
        sendJson(res, 200, { ok: true })
        return
      }
      if (action === 'unarchive' && method === 'POST') {
        await this.runtime.unarchiveSession(sessionId)
        sendJson(res, 200, { ok: true })
        return
      }
      // 置顶：body {pinned:true|false} → {ok:true,pinned}
      if (action === 'pin' && method === 'POST') {
        const body = await readJson(req, 1 << 16)
        const result = await this.runtime.pinSession(sessionId, body.pinned !== false)
        sendJson(res, 200, { ok: true, pinned: result.pinned })
        return
      }
      // 回答模型反问：body {eventId, answers:[{id,selected:[...],custom?}]} → {ok:true}
      if (action === 'question' && method === 'POST') {
        const body = await readJson(req, 1 << 20)
        const eventId = String(body.eventId || '')
        if (!eventId) {
          sendError(res, 400, 'bad_request', '需要 eventId')
          return
        }
        if (!this.questions) {
          sendError(res, 503, 'question_unavailable', '这个实例没有挂载模型反问答桥')
          return
        }
        const result = this.questions.submit(sessionId, eventId, body.answers)
        sendJson(res, 200, { ok: true, delivered: result.delivered })
        return
      }
      if (action === 'answer' && method === 'POST') {
        const body = await readJson(req, 1 << 16)
        const eventId = String(body.eventId || '')
        const decision = String(body.action || '')
        if (!eventId || (decision !== 'allow-once' && decision !== 'reject')) {
          sendError(res, 400, 'bad_request', '需要 eventId 与 action（allow-once | reject）')
          return
        }
        const outcome = this.approvals.decide(eventId, decision)
        sendJson(res, 200, { ok: true, outcome })
        return
      }
    }

    sendError(res, 404, 'not_found', '没有这个接口：' + method + ' ' + path)
  }

  /** 把会话里的图片回给手机（原生 ImageView 直接吃字节，不转 base64 省一倍带宽）。 */
  sendImage(res, sessionId, attachmentId) {
    void (async () => {
      try {
        const stored = await this.runtime.readImage(sessionId, attachmentId)
        const body = stored.data
        res.writeHead(200, {
          'Content-Type': stored.mediaType || 'application/octet-stream',
          'Content-Length': String(body.length),
          'Cache-Control': 'private, max-age=86400, immutable',
        })
        res.end(body)
      } catch (error) {
        const code = (error && error.code) || 'internal'
        const status = code === 'not_found' ? 404 : code === 'bad_request' ? 400 : 500
        try { sendError(res, status, code, String((error && error.message) || error)) } catch { /* 已断开 */ }
      }
    })()
  }

  /** 把插件自带的 APK 发给手机浏览器。 */
  sendApk(req, res) {
    const file = this.options.apkPath
    let stat = null
    try { stat = file ? fs.statSync(file) : null } catch { stat = null }
    if (!stat || !stat.isFile()) {
      sendError(res, 404, 'no_apk', '这个插件包里没有带 APK，请用仓库里的 android/bin/dsh-phone.apk')
      return
    }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(stat.size),
      'Content-Disposition': 'attachment; filename="dsh-phone.apk"',
      'Cache-Control': 'no-store',
    })
    const stream = fs.createReadStream(file)
    stream.on('error', () => { try { res.destroy() } catch { /* 忽略 */ } })
    stream.pipe(res)
  }

  async openStream(req, res, url) {
    if (this.clients.size >= MAX_STREAM_CLIENTS) {
      sendError(res, 429, 'too_many_streams', '同时连接的手机太多了')
      return
    }
    const sessionId = url.searchParams.get('session') || null
    const sinceRaw = url.searchParams.get('since')
    const since = sinceRaw === null ? null : Number(sinceRaw)

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(': connected\n\n')

    const client = { res, sessionId }
    this.clients.add(client)
    // 手机连上了：取消「长时间离线」的宽限计时，别把刚开着的问题让位掉。
    try { this.questions?.phoneAttached?.() } catch { /* 忽略 */ }
    // 刚连上就补发还开着的问题（SSE 错过一帧也能显示）。
    // 'pending' 也要补：timed 模式下窗口过了但题目仍可补答（走 userQuestions.answer 续答）。
    try {
      for (const row of (this.questions?.listPending(sessionId || undefined) || [])) {
        if (row.status === 'open' || row.status === 'pending') sseWrite(res, 'question', row)
      }
    } catch { /* 忽略 */ }

    if (Number.isFinite(since) && sessionId) {
      try {
        const timeline = await this.runtime.hydrate(sessionId)
        for (const item of timeline.since(since)) sseWrite(res, 'item', { item, sessionId })
        sseWrite(res, 'status', { sessionId, status: timeline.status, seq: timeline.throughSeq })
      } catch (error) {
        sseWrite(res, 'error', { message: String((error && error.message) || error) })
      }
    }

    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      this.clients.delete(client)
      try { res.end() } catch { /* 忽略 */ }
      // 最后一台手机断了：给 10 秒宽限期（切后台、重连都会用到），超时才让位给浏览器 UI。
      if (!this.clients.size) {
        try { this.questions?.phoneDetached?.(10000) } catch { /* 忽略 */ }
      }
    }
    req.on('close', cleanup)
    req.on('error', cleanup)
    res.on('error', cleanup)
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.unsubscribe?.()
    for (const client of this.clients) {
      try { client.res.end() } catch { /* 忽略 */ }
    }
    this.clients.clear()
    const servers = this.servers.length ? this.servers : (this.server ? [this.server] : [])
    this.servers = []
    this.server = null
    if (!servers.length) return
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))))
  }
}
