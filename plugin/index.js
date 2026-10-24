/**
 * dsh-phoneharness — host 半。
 *
 * 让手机上的 APK 远程控制本机这台 DeepSeek Harness：
 *   1. 自己开一个对外 HTTP/SSE 端口（DSH 自带的 webServer 只监听 127.0.0.1，手机连不上）；
 *   2. 一次性配对码换取长期设备令牌，之后手机用 Bearer 令牌调 /v1/*；
 *   3. 把 DSH 的会话事件投影成手机时间线，通过 SSE 推给手机；
 *   4. 把 DSH 的审批请求转发到手机，手机点「允许一次 / 拒绝」后回灌给 DSH；
 *   5. 在回环 webServer 上挂 /dsh-phone/api，给侧栏面板显示配对码、地址、设备列表。
 *
 * 所有 DSH 服务都通过 ctx.get(...) 拿，任何一项缺失都降级而不是崩。
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { DeviceStore, PairingCode } from './lib/store.js'
import { ApprovalBridge } from './lib/approvals.js'
import { QuestionBridge } from './lib/questions.js'
import { HarnessRuntime, dataRoot } from './lib/runtime.js'
import { HarnessConfig } from './lib/harness.js'
import { PhoneServer } from './lib/server.js'
import { sendError, sendJson } from './lib/http.js'
import { UpdateChecker, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS } from './lib/update.js'
import { Identity } from './lib/identity.js'

const VERSION = '0.5.21'
/** 开源仓库地址（占位：换仓库时只改这一行，面板与文档都跟着走）。 */
const REPO_URL = 'https://github.com/DongLiKVK/dsh-phoneharness'
const CONTROL = '/dsh-phone/api'
const DEFAULT_PORT = 8737
const DEFAULT_TTL = 10 * 60 * 1000
/** 运行期重绑的巡检间隔：Tailscale 网卡后起时，靠它把 100.x 补绑上（见 rebindTick）。 */
const REBIND_MS = 15000
/** 插件自带一份 APK，面板上直接给下载链接，省得手机再去找文件。 */
const APK_FILE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'assets', 'dsh-phone.apk')

function readConfig(config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const port = Number(settings.port)
  return {
    enabled: settings.enabled !== false,
    port: Number.isSafeInteger(port) && port >= 0 && port <= 65535 ? port : DEFAULT_PORT,
    bind: typeof settings.bind === 'string' && settings.bind ? settings.bind : '0.0.0.0',
    pairingTtlMs: Number.isFinite(Number(settings.pairingTtlMs)) && Number(settings.pairingTtlMs) >= 60000
      ? Number(settings.pairingTtlMs)
      : DEFAULT_TTL,
    model: typeof settings.model === 'string' ? settings.model : '',
    permission: typeof settings.permission === 'string' ? settings.permission : '',
    agentPreset: typeof settings.agentPreset === 'string' ? settings.agentPreset : '',
    // 手机偏好的工作区（宿主没有「切换当前工作区」的服务，所以由本插件自己记）。
    workspace: typeof settings.workspace === 'string' ? settings.workspace : '',
  approvalTimeoutMs: Number.isFinite(Number(settings.approvalTimeoutMs)) && Number(settings.approvalTimeoutMs) >= 5000
    ? Number(settings.approvalTimeoutMs)
    : 120000,
    // 自动更新检测：默认开，6 小时查一次；updateFeed 可选，指向任意返回 {"version":"x.y.z"} 的地址。
    updateAuto: settings.updateAuto !== false,
    updateIntervalMs: Number.isFinite(Number(settings.updateIntervalMs)) && Number(settings.updateIntervalMs) >= MIN_INTERVAL_MS
      ? Number(settings.updateIntervalMs)
      : DEFAULT_INTERVAL_MS,
    updateFeed: typeof settings.updateFeed === 'string' ? settings.updateFeed.trim() : '',
  }
}

/**
 * 一块网卡属于哪一类，决定面板上给它的说明与推荐度。
 *
 *   tailscale  <TAILSCALE_IP>/10，跨网可达（手机在外网也能连）
 *   lan        真·局域网（以太网 / Wi-Fi），同一网络才可达
 *   virtual    虚拟网卡（OPPO 互联、VMware、Docker、WSL、tap/tun 等），一般不是手机入口
 *   other      其余（公网地址、未知网段）
 *
 * 只做启发式判断：名字命中虚拟网卡关键字、或地址段像容器网段，就算 virtual。
 */
const VIRTUAL_IFACE = /(virtio|vmware|virtualbox|vethernet|hyper-v|docker|br-|wsl|tap|tun|utun|wireguard|zerotier|hamachi|vgate|devicespace|hyper|ppp|loopback)/i

function interfaceKind(name, address) {
  const ip = String(address || '')
  if (/^127\./.test(ip)) return 'loopback'
  if (isTailscale(ip)) return 'tailscale'
  const iface = String(name || '')
  if (VIRTUAL_IFACE.test(iface)) return 'virtual'
  if (isPrivate(ip)) return 'lan'
  return 'other'
}

/** 本机的对外地址，给手机上填；每项带 kind，面板据此标注用途。 */
function lanAddresses() {
  const result = []
  const interfaces = os.networkInterfaces()
  for (const [name, list] of Object.entries(interfaces)) {
    for (const entry of list || []) {
      if (!entry || entry.internal) continue
      if (entry.family !== 'IPv4' && entry.family !== 4) continue
      result.push({ name, address: entry.address, kind: interfaceKind(name, entry.address) })
    }
  }
  return result
}

/**
 * 插件自带 APK 的元信息（大小、md5、构建时间，以及 build.sh 写的同名 .json 里的版本号）。
 *
 * /status 每 5 秒被面板轮询一次，800KB 的 APK 不能每次都算 md5：按 mtime+size 缓存。
 */
let apkMemo = null

/** 下载时用的文件名：dsh-phone-<versionName>.apk；读不到版本就退回通用名。 */
function apkDownloadName(file) {
  const meta = apkMeta(file)
  const name = meta && meta.versionName ? String(meta.versionName).trim() : ''
  return name ? 'dsh-phone-' + name + '.apk' : 'dsh-phone.apk'
}

function apkMeta(file) {
  try {
    const stat = fs.statSync(file)
    if (apkMemo && apkMemo.mtimeMs === stat.mtimeMs && apkMemo.size === stat.size) return apkMemo.meta
    const md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')
    let side = {}
    try { side = JSON.parse(fs.readFileSync(file + '.json', 'utf8')) } catch { side = {} }
    const meta = {
      name: side.versionName ? 'dsh-phone-' + side.versionName + '.apk' : 'dsh-phone.apk',
      size: stat.size,
      md5,
      builtAt: new Date(stat.mtimeMs).toISOString(),
      versionName: side.versionName || '',
      versionCode: side.versionCode || null,
    }
    apkMemo = { mtimeMs: stat.mtimeMs, size: stat.size, meta }
    return meta
  } catch {
    return null
  }
}

/** <TAILSCALE_IP>/10 —— Tailscale 用的 CGNAT 段。 */
function isTailscale(address) {
  const parts = String(address).split('.')
  if (parts.length !== 4) return false
  const first = Number(parts[0])
  const second = Number(parts[1])
  return first === 100 && second >= 64 && second <= 127
}

/** RFC1918 私网地址。 */
function isPrivate(address) {
  const parts = String(address).split('.')
  if (parts.length !== 4) return false
  const a = Number(parts[0])
  const b = Number(parts[1])
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/**
 * bind 支持多个地址：逗号或空格分隔，另认三个别名。
 *
 * loopback  -> 127.0.0.1
 * tailscale -> 本机所有 <TAILSCALE_IP>/10 的地址
 * lan       -> 本机所有 RFC1918 私网地址
 *
 * 例：'loopback,tailscale' 只服务本机与同一 tailnet，netstat 不再出现 0.0.0.0。
 */
function resolveBind(value) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : '0.0.0.0'
  const tokens = raw.split(/[,\s]+/).filter(Boolean)
  const out = []
  const push = (address) => { if (address && !out.includes(address)) out.push(address) }
  const entries = () => {
    const list = []
    const interfaces = os.networkInterfaces()
    for (const [name, group] of Object.entries(interfaces)) {
      for (const entry of group || []) {
        if (!entry || entry.internal) continue
        if (entry.family !== 'IPv4' && entry.family !== 4) continue
        list.push({ name, address: entry.address })
      }
    }
    return list
  }
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (lower === 'loopback' || lower === 'local') push('127.0.0.1')
    else if (lower === 'tailscale') { for (const entry of entries()) if (isTailscale(entry.address)) push(entry.address) }
    else if (lower === 'lan') { for (const entry of entries()) if (isPrivate(entry.address)) push(entry.address) }
    else push(token)
  }
  return out.length ? out : ['0.0.0.0']
}

function machineName() {
  try { return os.hostname() } catch { return 'dsh-host' }
}

export function apply(ctx, config) {
  const settings = readConfig(config)
  if (!settings.enabled) return

  const root = dataRoot()
  try { fs.mkdirSync(root, { recursive: true }) } catch { /* 目录问题后面会暴露 */ }

  const devices = new DeviceStore(path.join(root, 'devices.json'))
  const pairing = new PairingCode(settings.pairingTtlMs)
  const endpointFile = path.join(root, 'endpoint.json')

  // 自动更新检测：查 npm / GitHub / 自定义 feed，结果缓存在 update.json 里给面板读。
  const updater = new UpdateChecker({
    current: VERSION,
    pkg: 'dsh-phoneharness',
    repo: REPO_URL,
    feed: settings.updateFeed,
    file: path.join(root, 'update.json'),
    auto: settings.updateAuto,
    intervalMs: settings.updateIntervalMs,
    logger: ctx.logger,
  })

  // 手机抽屉底部账号栏：头像与用户 ID 都取自电脑端登录的账号，取不到就退到系统用户名。
  const identity = new Identity({
    ctx,
    file: path.join(root, 'identity.json'),
    version: VERSION,
    logger: ctx.logger,
  })

  const runtime = new HarnessRuntime(ctx, {
    readDefaults: () => ({ model: settings.model, permission: settings.permission, agentPreset: settings.agentPreset }),
  })
  runtime.wire()

  // 用户主机的 harness 配置（契约 §1）：模式 / 工作区 / 权限 / 默认模型的读写通道。
  // readDefaults 读的就是下面这块 settings，writeDefaults 就地改它 —— 手机切完，
  // 下一次 GET /v1/harness 与新建会话立刻用新值；落盘由 HarnessConfig 自己走宿主
  // settings / configEditor / agentDefaultModel（写后读回确认，没落到 profile 就如实标 false）。
  const harnessConfig = new HarnessConfig(ctx, {
    runtime,
    readDefaults: () => ({
      model: settings.model,
      permission: settings.permission,
      agentPreset: settings.agentPreset,
      workspace: settings.workspace,
    }),
    writeDefaults: (patch) => {
      if (!patch || typeof patch !== 'object') return
      if (typeof patch.model === 'string') settings.model = patch.model
      if (typeof patch.permission === 'string') settings.permission = patch.permission
      if (typeof patch.agentPreset === 'string') settings.agentPreset = patch.agentPreset
      if (typeof patch.workspace === 'string') settings.workspace = patch.workspace
    },
  })

  // 审批：注册 approval/request waterfall 监听者。只有手机在线时才接管，
  // 没手机时 next() 让位给桌面浏览器 UI，两边不打架。
  const approvals = new ApprovalBridge(ctx, {
    hasPhone: () => server.clients.size > 0,
    timeoutMs: settings.approvalTimeoutMs,
    onNotice: (notice) => runtime.emit({ type: 'approval', ...notice }),
  })

  // 模型反问（ask_user_question）：同一套骨架，挂 user-questions/request waterfall。
  // 只有手机在线才接管；超时/abort 一律 next() 让位给浏览器 UI。
  const questions = new QuestionBridge(ctx, {
    hasPhone: () => server.clients.size > 0,
    timeoutMs: settings.approvalTimeoutMs,
    onNotice: (notice) => runtime.emit({ type: 'question', ...notice }),
  })

  const binds = resolveBind(settings.bind)
  // tailscale/lan 解析不出地址时（Tailscale 没登录、网卡刚断），退到私网地址，避免手机彻底连不上。
  if (binds.length === 1 && binds[0] === "127.0.0.1" && /tailscale|lan/i.test(settings.bind)) {
    const fallback = lanAddresses().map((entry) => entry.address).filter((address) => isPrivate(address))
    binds.push(...(fallback.length ? fallback : ["0.0.0.0"]))
    ctx.logger?.warn?.("dsh-phoneharness: %s 解析不到地址，退回 %s", settings.bind, binds.join(", "))
  }

  const server = new PhoneServer({
    runtime,
    harness: harnessConfig,
    approvals,
    questions,
    devices,
    pairing,
    identity,
    options: {
      port: settings.port,
      bind: settings.bind,
      binds,
      name: machineName(),
      version: VERSION,
      apkPath: APK_FILE,
      // 手机端 /apk/meta 用的元数据工厂（版本号 + md5 + 构建时间）。
      apkMeta: () => apkMeta(APK_FILE),
    },
  })

  ctx.effect(() => {
    let stopped = false
    let watcher = null
    const startedAt = new Date().toISOString()

    const writeEndpoint = () => {
      if (!server.port) return
      try {
        fs.writeFileSync(endpointFile, JSON.stringify({
          version: 1,
          host: settings.bind,
          binds,
          port: server.port,
          name: machineName(),
          lan: lanAddresses(),
          pid: process.pid,
          startedAt,
          updatedAt: new Date().toISOString(),
        }, null, 2), { mode: 0o600 })
      } catch { /* 写不了就不写 */ }
    }

    /**
     * 运行期重绑。
     *
     * 宿主启动那一刻 tailscaled 往往还没把 100.x 配到网卡上，resolveBind 算出来的
     * binds 就永久少了 tailnet 地址 —— 手机登录之后按 100.x 仍然连不上电脑。
     * 这里每 15 秒重算一次「期望地址」，只补还没监听的那几条；0.0.0.0 兜底不参与
     * 补绑，免得把收窄过的监听面又放开。
     */
    const rebindTick = async () => {
      if (stopped || !server.port) return
      const wanted = resolveBind(settings.bind)
        .filter((address) => address !== '0.0.0.0' && address !== '::')
      const missing = wanted.filter((address) => !server.bound.has(address))
      if (!missing.length) return
      const result = await server.rebind(missing)
      if (result.failed.length) {
        // 最常见的失败是 EADDRINUSE：这条地址已被别的进程占着（比如 netsh portproxy 转发）。
        ctx.logger?.warn?.('dsh-phoneharness: 补绑 %s 失败：%s', result.failed.map((item) => item.address).join(', '), String(result.failed[0].error || ''))
      }
      if (!result.added.length) return
      for (const address of result.added) if (!binds.includes(address)) binds.push(address)
      writeEndpoint()
      ctx.logger?.info?.('dsh-phoneharness: 补绑 %s（新地址上线）', result.added.join(', '))
    }

    approvals.start()
    questions.start()
    void server.start().then((port) => {
      if (stopped) return
      if (!port) {
        ctx.logger?.warn?.('dsh-phoneharness: 端口 %s 打开失败：%s', String(settings.port), String(server.lastError || 'unknown'))
        return
      }
      writeEndpoint()
      ctx.logger?.info?.('dsh-phoneharness: 监听 %s :%s（配对码 %s）', binds.join(', '), String(port), pairing.code)
      void rebindTick().catch(() => {})
      // 定时器要 unref，否则会拖住宿主进程不退出。
      watcher = setInterval(() => { void rebindTick().catch(() => {}) }, REBIND_MS)
      watcher.unref?.()
    })
    return () => {
      stopped = true
      if (watcher) clearInterval(watcher)
      void questions.close()
      void approvals.close()
      void server.stop()
      runtime.close()
      try { fs.rmSync(endpointFile, { force: true }) } catch { /* 忽略 */ }
    }
  }, 'dsh-phoneharness: phone server')

  // 自动更新检测的定时器：宿主启动 8 秒后查一次，之后每 intervalMs 一次；关掉开关就停。
  ctx.effect(() => {
    updater.start({ delayMs: 8000 })
    return () => updater.stop()
  }, 'dsh-phoneharness: update check')

  // 侧栏面板用的回环控制 API。手机不走这里。
  ctx.effect(() => {
    let dispose = null
    ctx.inject(['webServer'], (scope) => {
      dispose = scope.webServer.register({
        kind: 'prefix',
        path: CONTROL,
        handler: (req, res) => {
          void (async () => {
            try {
              const url = new URL(req.url || '/', 'http://localhost')
              const route = url.pathname.slice(CONTROL.length) || '/status'
              const method = String(req.method || 'GET').toUpperCase()

              if (method === 'GET' && (route === '/status' || route === '/')) {
                let user = null
                try { user = await identity.current({}) } catch { user = null }
                sendJson(res, 200, {
                  ok: true,
                  version: VERSION,
                  user,
                  running: server.port > 0,
                  port: server.port,
                  bind: settings.bind,
                  binds,
                  error: server.lastError,
                  pairing: {
                    code: pairing.valid ? pairing.code : null,
                    expiresAt: pairing.expiresAt,
                  },
                  lan: lanAddresses().map((entry) => ({
                    ...entry,
                    // 这条地址此刻是否真的在监听：bind 收窄后，没进 binds 的地址是连不上的。
                    listening: binds.includes('0.0.0.0') || binds.includes('::') || binds.includes(entry.address),
                  })),
                  devices: devices.list(),
                  streamClients: server.clients.size,
                  lastSelections: runtime.lastSelections || null,
                  approvals: {
                    available: approvals.available,
                    stats: approvals.stats,
                    pending: approvals.listPending().map((entry) => ({
                      eventId: entry.eventId,
                      sessionId: entry.sessionId,
                      toolName: entry.toolName,
                      status: entry.status,
                    })),
                  },
                  // 模型反问（ask_user_question）的桥状态，形状与 approvals 对称。
                  questions: {
                    available: questions.available,
                    stats: questions.stats,
                    pending: questions.listPending().map((entry) => ({
                      eventId: entry.eventId,
                      sessionId: entry.sessionId,
                      status: entry.status,
                      createdAt: entry.createdAt,
                    })),
                  },
                  apk: fs.existsSync(APK_FILE) ? '/apk' : null,
                  apkMeta: apkMeta(APK_FILE),
                  // 更新检测的只读快照：面板每 5 秒轮询 /status 就能拿到，不打网络。
                  update: updater.snapshot(),
                  repo: REPO_URL,
                  dataRoot: root,
                })
                return
              }
              if (method === 'GET' && (route === '/apk/meta' || route === '/apk/info')) {
                // 面板与手机都靠这条判断「包是不是新的」，不下载整个 APK。
                const meta = apkMeta(APK_FILE)
                if (!meta) {
                  sendError(res, 404, 'no_apk', '插件包里没有带 APK')
                  return
                }
                sendJson(res, 200, { ok: true, version: VERSION, repo: REPO_URL, apk: meta })
                return
              }
              if (method === 'GET' && (route === '/apk' || route === '/download')) {
                // 面板上的「下载 APK」也走这里，直接转发给手机端口那台静态文件。
                sendFile(res, APK_FILE)
                return
              }
              if (method === 'POST' && route === '/pairing') {
                pairing.rotate()
                sendJson(res, 200, { ok: true, code: pairing.code, expiresAt: pairing.expiresAt })
                return
              }
              if (method === 'GET' && (route === '/update' || route === '/update/status')) {
                sendJson(res, 200, { ok: true, version: VERSION, update: updater.snapshot() })
                return
              }
              if (method === 'POST' && (route === '/update/check' || route === '/update')) {
                // 强制复查：面板上点「立即检查」走这里，绕过 6 小时缓存。
                const snapshot = await updater.check(true)
                sendJson(res, 200, { ok: true, version: VERSION, update: snapshot })
                return
              }
              if (method === 'POST' && route === '/update/auto') {
                const body = await readSmallJson(req)
                const snapshot = updater.setAuto(body.auto !== false)
                if (snapshot.auto) updater.start({ delayMs: 800 })
                else updater.stop()
                sendJson(res, 200, { ok: true, version: VERSION, update: snapshot })
                return
              }
              if (method === 'POST' && route === '/devices/revoke') {
                const body = await readSmallJson(req)
                sendJson(res, 200, { ok: devices.revoke(String(body.id || '')) })
                return
              }
              sendError(res, 404, 'not_found', '没有这个接口：' + method + ' ' + route)
            } catch (error) {
              sendError(res, 500, 'internal', String((error && error.message) || error))
            }
          })()
        },
      })
    })
    return () => { try { dispose?.() } catch { /* 忽略 */ } }
  }, 'dsh-phoneharness: control API')
}

/** 把插件自带的 APK 回给浏览器（面板下载按钮）。 */
function sendFile(res, file) {
  let stat = null
  try { stat = fs.statSync(file) } catch { stat = null }
  if (!stat || !stat.isFile()) {
    sendError(res, 404, 'no_apk', '插件包里没有带 APK')
    return
  }
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': String(stat.size),
    // 下载下来的文件名带上 APK 版本，否则手机里堆着一堆 dsh-phone.apk 分不清谁是谁。
    'Content-Disposition': 'attachment; filename="' + apkDownloadName(file) + '"',
    'Cache-Control': 'no-store',
  })
  const stream = fs.createReadStream(file)
  stream.on('error', () => { try { res.destroy() } catch { /* 忽略 */ } })
  stream.pipe(res)
}

async function readSmallJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 65536) break
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}
