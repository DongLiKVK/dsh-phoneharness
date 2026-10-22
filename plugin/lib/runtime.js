import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { Timeline } from './projection.js'
import { ModelRegistry } from './models.js'

/**
 * DSH 内部服务的最小封装。
 *
 * 唯一的硬要求：DSH 的服务必须通过 ctx.get(...) 拿，绝不能 require 内部模块。
 * 一切可选服务（模型目录、权限预设等）缺失时降级而不是崩，因为用户可能装了
 * 精简 profile。
 */

const TITLE_MAX = 80
const INVENTORY_LIMIT = 200
/**
 * 冷会话标题的缓存时长：日志 append-only，标题变了会来标题事件，5 分钟足够安全。
 *
 * 「没有标题」（status fulfilled 但 title 为空）也缓存——否则每次列表都会把这些
 * 会话重新扫一遍日志，而它们恰恰是数量最多的一批（空会话、子代理留下的壳）。
 */
const TITLE_CACHE_TTL = 30 * 60 * 1000
/** 没有标题的结论缓存短一些，别把「新会话刚生成标题」压太久。 */
const TITLE_EMPTY_TTL = 10 * 60 * 1000
/** 一次列表请求里同步解析的冷会话上限；其余交给后台预热。 */
const TITLE_BATCH = 24
/** 后台预热每批几个、批与批之间让出事件循环的毫秒数。 */
const TITLE_PUMP_BATCH = 3
const TITLE_PUMP_DELAY = 120
/** 落盘缓存最多记多少条。 */
const TITLE_STORE_LIMIT = 2000

function safeCurrent(presets, session) {
  try { return presets.current(session) } catch { return null }
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

/** 目录末段：工作区名没拿到时的兜底标签。 */
function basenameOf(dir) {
  const parts = String(dir || '').split(/[\\/]+/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : String(dir || '')
}

function preview(text, max = 120) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  return value.length > max ? value.slice(0, max) + '…' : value
}

/** DSH 认的图片类型（见 @deepseek-ai/dsh-attachment 的 ImageMediaType）。 */
const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * 手机传来的图片 → DSH wire 上的 image part。
 *
 * 线上形状（typert 声明原文）：
 *   { type: 'image', mediaType: ImageMediaType, data: string(base64), name?: string }
 * 落盘由 SessionController.prompt 内部的 attachments.admitPromptContent 完成，
 * 插件这边不需要碰 ctx.attachments。
 */
function promptContent(text, images) {
  const content = []
  const body = String(text == null ? '' : text)
  if (body.trim()) content.push({ type: 'text', text: body })
  const list = Array.isArray(images) ? images : []
  for (const image of list) {
    if (!image || typeof image !== 'object') continue
    const mediaType = String(image.mediaType || '')
    const data = typeof image.data === 'string' ? image.data.trim() : ''
    if (!data || !IMAGE_MEDIA_TYPES.has(mediaType)) continue
    const name = typeof image.name === 'string' && image.name ? image.name.slice(0, 120) : undefined
    content.push(name ? { type: 'image', mediaType, data, name } : { type: 'image', mediaType, data })
  }
  return content
}

export class HarnessRuntime {
  constructor(ctx, options) {
    this.ctx = ctx
    this.options = options
    this.timelines = new Map()
    this.listeners = new Set()
    this.disposed = false
    this.wired = false
    /**
     * 会话标题缓存（冷会话才需要）。
     *
     * header.title 常年为空，真正的标题只存在于会话日志的 session/title 事件里；
     * 活会话的标题由 Timeline 折出来，冷会话则要靠 sessionQuery.readTitleSnapshots
     * 去扫日志。日志 append-only，所以这里缓存，只在 TTL 到期或收到标题事件时刷新。
     */
    this.titleCache = new Map()
    /**
     * 后台预热队列 + 落盘缓存。
     *
     * 实测：128 个冷会话一次性 readTitleSnapshots 会把主线程占满 10~20 秒
     * （本机 406 份会话日志共 540MB，逐个解 zstd），期间连 /health 都回不去，
     * 手机端直接 SocketTimeout，首页显示「连不上」。所以：
     *   1. 同步只解析用户马上要看的前 TITLE_BATCH 条；
     *   2. 其余的进队列，每批几个、批间 await 让出事件循环，慢慢焐热；
     *   3. 标题（包括「确实没有标题」这个结论）落盘到 dataRoot()/titles.json，
     *      重启后第一次列表就是热的。
     */
    this.titleQueue = new Set()
    this.titlePumping = false
    this.titleSaveTimer = null
    this.titlesLoaded = false
    /**
     * 模型可选配置（/v1/models 那一套）。
     *
     * 全部状态都在 ModelRegistry 里：路由清单位于 dataRoot()/custom-models.json，
     * 真正的 llm-pi-ai 配置走 configEditor（拿不到时退回改 profile patch）。
     */
    this.modelRegistry = new ModelRegistry(ctx, {
      readDefaults: () => this.options.readDefaults(),
      configuredModel: () => this.configuredModel(),
      profilePatchPath: options && options.profilePatchPath,
      storePath: (options && options.customModelStore) || path.join(dataRoot(), 'custom-models.json'),
      cacheTtlMs: options && options.modelCacheTtlMs,
      logger: options && options.logger,
    })
  }

  /* ------------------------------------------------------------ */
  /* 事件接线                                                       */
  /* ------------------------------------------------------------ */

  wire() {
    if (this.wired) return
    this.wired = true
    const ctx = this.ctx

    ctx.effect(() => {
      const offCreated = ctx.on('session/created', (session) => this.onSessionEvent(session, null), { global: true })
      const offEvent = ctx.on('session/event', (session, event) => this.onSessionEvent(session, event), { global: true })
      const offDisposed = ctx.on('session/disposed', (session) => this.onDisposed(session), { global: true })
      const offStream = ctx.on('agent/assistant-stream', (payload) => this.onAssistantStream(payload), { global: true })
      return () => {
        offCreated?.()
        offEvent?.()
        offDisposed?.()
        offStream?.()
      }
    }, 'phone-harness: session events')
  }

  timeline(id) {
    let current = this.timelines.get(id)
    if (!current) {
      current = new Timeline(id)
      this.timelines.set(id, current)
    }
    return current
  }

  onSessionEvent(session, event) {
    if (this.disposed) return
    const id = session && session.id
    if (!id) return
    if (!event) {
      // session/created：把已有历史补进来，保证手机第一次打开就能看到上下文。
      void this.hydrate(id).catch(() => undefined)
      return
    }
    try {
      const timeline = this.timeline(id)
      const changed = timeline.apply(event)
      // 标题变了：缓存立刻失效，下一次列表重新读日志（改名后手机马上能看到新名字）。
      if (event.type === 'session/title') this.titleCache.delete(id)
      for (const item of changed) this.emit({ type: 'item', sessionId: id, item })
      if (event.type === 'turn/start' || event.type === 'turn/end') {
        this.emit({ type: 'status', sessionId: id, status: timeline.status, seq: timeline.throughSeq })
      }
      if (event.type === 'turn/end') this.emit({ type: 'done', sessionId: id, reason: (event.data && event.data.reason && event.data.reason.kind) || 'completed' })
    } catch { /* 单条事件解析失败不影响后续 */ }
  }

  onAssistantStream(payload) {
    if (this.disposed) return
    const agent = payload && payload.agent
    const frame = payload && payload.frame
    if (!agent || !frame) return
    const id = agent.id
    const timeline = this.timelines.get(id)
    if (!timeline) return
    if (frame.type === 'start') {
      this.emit({ type: 'status', sessionId: id, status: 'running', seq: timeline.throughSeq })
      return
    }
    if (frame.type !== 'chunk' || !frame.chunk) return
    try {
      const changed = timeline.apply({
        type: 'assistant/chunk',
        seq: timeline.throughSeq,
        time: frame.time || Date.now(),
        data: { turn: frame.turn, step: frame.step, chunk: frame.chunk },
      })
      for (const item of changed) this.emit({ type: 'item', sessionId: id, item })
    } catch { /* 忽略 */ }
  }

  onDisposed(session) {
    const id = session && session.id
    if (!id) return
    this.emit({ type: 'status', sessionId: id, status: 'idle', seq: this.timelines.get(id)?.throughSeq ?? 0 })
  }

  /* ------------------------------------------------------------ */
  /* 历史补齐（冷会话）                                              */
  /* ------------------------------------------------------------ */

  async hydrate(id, signal) {
    const timeline = this.timeline(id)
    if (timeline.throughSeq >= 0) return timeline
    const log = await this.readLog(id, signal)
    for (const event of log.events) timeline.apply(event)
    return timeline
  }

  async readLog(id, signal) {
    signal?.throwIfAborted?.()
    const sessions = this.ctx.get('sessions')
    const live = sessions?.get?.(id)
    if (live) {
      return { session: live.header, inheritedEventCount: 0, events: [...live.snapshotEvents()] }
    }
    const sessionQuery = this.ctx.get('sessionQuery')
    if (!sessionQuery) {
      const error = new Error('DSH 会话服务不可用')
      error.code = 'service_unavailable'
      throw error
    }
    const observation = await sessionQuery.observeSession(id, { projectionMode: 'none' })
    try {
      return {
        session: observation.header,
        inheritedEventCount: observation.inheritedEventCount,
        events: [...observation.events],
      }
    } finally {
      try { observation[Symbol.dispose]() } catch { /* 忽略 */ }
    }
  }

  /* ------------------------------------------------------------ */
  /* 目录                                                          */
  /* ------------------------------------------------------------ */

  /** agent-default-model 服务读出来的 provider/model，形如 "deepseek-account/deepseek-flash"。 */
  configuredModel() {
    const service = this.ctx.get('agentDefaultModel')
    if (!service || typeof service.currentSelection !== 'function') return null
    try {
      const selection = service.currentSelection()
      if (!selection || typeof selection.provider !== 'string' || typeof selection.model !== 'string') return null
      return selection.provider + '/' + selection.model
    } catch {
      return null
    }
  }

  async catalog(signal) {
    const result = { models: [], permissions: [], agentPresets: [], defaults: {}, failures: [] }
    const llm = this.ctx.get('llm')
    if (llm && typeof llm.listProviders === 'function') {
      let providers = []
      try { providers = llm.listProviders() } catch { providers = [] }
      for (const provider of providers) {
        try {
          const models = await llm.listModels(provider.id)
          for (const model of models) {
            result.models.push({
              id: provider.id + '/' + model.id,
              title: model.name || model.id,
              providerName: provider.name || provider.id,
              model: model.id,
              provider: provider.id,
            })
          }
        } catch {
          result.failures.push({ provider: provider.id, message: '模型列表读取失败' })
        }
      }
    }

    const presets = this.ctx.get('permissionPresets')
    if (presets && typeof presets.catalog === 'function') {
      try {
        for (const option of presets.catalog().options) {
          result.permissions.push({ id: option.value, name: option.name, description: option.description })
        }
      } catch { /* 忽略 */ }
    }

    const agentPresets = this.ctx.get('agentPresets')
    if (agentPresets && typeof agentPresets.list === 'function') {
      try {
        for (const preset of await agentPresets.list()) {
          if (preset.broken) continue
          result.agentPresets.push({ id: preset.id, title: preset.title || preset.name || preset.id })
        }
      } catch { /* 忽略 */ }
    }

    // 手机上敲 Windows 路径太痛苦，这里直接把本机最近用过的目录丢过去让用户点。
    result.workspaces = await this.workspaces(signal)

    const config = this.options.readDefaults()
    const firstModel = result.models[0]
    const firstPermission = result.permissions[result.permissions.length - 1]
    result.defaults = {
      // 优先用「这台机器实际配好的默认模型」（profile 里 agent-default-model 那条），
      // 它才是用户真正在用的 provider；catalog 里的第一个往往是没有 key 的那家。
      model: config.model || this.configuredModel() || (firstModel ? firstModel.id : null),
      permission: config.permission || (firstPermission ? firstPermission.id : null),
      agentPreset: config.agentPreset || (result.agentPresets[0] ? result.agentPresets[0].id : null),
    }
    return result
  }

  /* ------------------------------------------------------------ */
  /* 模型可选配置（/v1/models）                                    */
  /* ------------------------------------------------------------ */

  /** GET /v1/models：provider / model / 能力 + 默认选择 + 自定义配置（任何一项缺失都降级）。 */
  async models(signal) {
    return this.modelRegistry.list(signal)
  }

  /** 当前默认选择 {model, reasoning}（POST /v1/models/default 的响应也复用它）。 */
  async defaultModels() {
    return this.modelRegistry.defaultsNow()
  }

  /** POST /v1/models/default：写 profile 里的 agent-default-model。 */
  async setDefaultModel(input) {
    const result = await this.modelRegistry.setDefault(input)
    this.modelRegistry.invalidate()
    return result
  }

  /** POST /v1/models/custom：往 llm-pi-ai 里加一条外部路由。 */
  async addCustomModel(input) {
    const result = await this.modelRegistry.addCustom(input)
    this.modelRegistry.invalidate()
    return result
  }

  /** DELETE /v1/models/custom/{route}。 */
  async removeCustomModel(route) {
    const result = await this.modelRegistry.removeCustom(route)
    this.modelRegistry.invalidate()
    return result
  }

  /** 配置被外部改动（或刚写完）时让 provider / route 缓存失效。 */
  invalidateCatalog() {
    this.modelRegistry.invalidate()
  }

  /** 最近用过的目录：工作区登记表 + 最近会话的 cwd，去重后给手机选。 */
  async workspaces(signal) {
    const seen = new Set()
    const rows = []
    const push = (dir, title) => {
      if (typeof dir !== 'string' || !dir) return
      const key = dir.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      rows.push({ cwd: dir, title: preview(title || dir, TITLE_MAX) })
    }

    const registry = this.ctx.get('workspaceRegistry')
    if (registry && typeof registry.list === 'function') {
      try {
        for (const workspace of await registry.list()) {
          const dir = workspace && (workspace.cwd || workspace.path || workspace.root)
          // 工作区登记表里的条目用的是 title（就是侧栏显示的名字，比如 WhaleRealm / PhoneHarness）；
          // 早先只读了 name，取不到时就会退化成路径，手机端看到的是 C:\Users\... 而不是工作区名。
          const label = workspace && (workspace.title || workspace.name)
          if (typeof dir === 'string') push(dir, label)
        }
      } catch { /* 忽略 */ }
    }

    try {
      for (const header of await this.listSessions(signal)) {
        if (rows.length >= 12) break
        // 没登记成工作区的目录（比如直接开在仓库子目录的会话）用目录末段当名字，
        // 绝不能用会话标题——那会让工作区列表里冒出「未命名会话」这种条目。
        push(header.cwd, basenameOf(header.cwd))
      }
    } catch { /* 忽略 */ }

    return rows.slice(0, 12)
  }

  /* ------------------------------------------------------------ */
  /* 会话清单                                                       */
  /* ------------------------------------------------------------ */

  /**
   * 子代理的内部会话：手机上不该出现，也不该被当成普通会话继续。
   *
   * DSH 的判据（app.asar @deepseek-ai/dsh-api-session-controller/lib/types/agent.js
   * 的 hasApiSessionSubagentOwner）有两条：
   *   1. session.header.origin === 'subagent'；
   *   2. session.header.parentSession 指向一个仍被 agent 注册表认定为子代理的会话。
   * 这两条在 header 上都留有痕迹，所以这里只读 header 判断——绝不为了判断去
   * resolveAgent()，那会把这些内部会话全部激活，反而拖慢列表。
   */
  static isSubagentSession(header) {
    if (!header || typeof header !== 'object') return false
    if (header.origin === 'subagent') return true
    return header.parentSession != null
  }

  /** workspaceRegistry（归档 / 置顶）。缺失时返回 null，调用方降级。 */
  registry() {
    const registry = this.ctx.get('workspaceRegistry')
    return registry && typeof registry.archiveSession === 'function' ? registry : null
  }

  /** 当前归档 / 置顶的会话 id 集合（拿不到就是空集，不影响列表）。 */
  marks() {
    const registry = this.registry()
    const archived = new Set()
    const pinned = new Set()
    if (registry) {
      try {
        for (const id of (registry.archivedSessionIds || [])) archived.add(String(id))
      } catch { /* 忽略 */ }
      try {
        for (const id of (registry.pinnedSessionIds || [])) pinned.add(String(id))
      } catch { /* 忽略 */ }
    }
    return { archived, pinned }
  }

  /**
   * 批量解析会话标题。
   *
   * header.title 常年是空的——真正的标题是日志里的 session/title 事件（模型生成
   * 的自动标题和用户改的名字都走它）。活会话由 Timeline 折出来，冷会话只能扫日志，
   * 所以这里一次性批量问 sessionQuery.readTitleSnapshots（它内部顺序读，别一个个问）。
   * 日志 append-only，结果进 titleCache（TTL 见 TITLE_CACHE_TTL），标题事件到达时失效。
   */
  /**
   * 从 readTitleSnapshots 的一项里取出真正的标题文本。
   *
   * 坑：`value.title` 不是字符串，是 SessionTitleSnapshot
   * `{ title, messageSeqs, source, eventSeq, updatedAt }`
   * （asar: @deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js:7452
   *   `interface SessionTitleSnapshot extends SessionTitleEventData { eventSeq; updatedAt }`
   *  而 readTitleSnapshots 返回 `{ session: SessionHeader, title?: SessionTitleSnapshot }`）。
   * 早期写成 `typeof value.title === 'string'` 于是永远判空 —— 表现就是
   * 「列表里 128 条全是『未命名会话』」，而日志里明明有 session/title 事件。
   */
  static titleText(value) {
    if (!value || typeof value !== 'object') return ''
    const snapshot = value.title
    if (typeof snapshot === 'string') return snapshot.trim()
    if (snapshot && typeof snapshot === 'object' && typeof snapshot.title === 'string') return snapshot.title.trim()
    return ''
  }

  async resolveTitles(headers, signal) {
    this.loadTitleStore()
    const now = Date.now()
    const titles = new Map()
    const pending = []
    for (const header of headers) {
      const timeline = this.timelines.get(header.id)
      if (timeline && timeline.title) {
        titles.set(header.id, timeline.title)
        continue
      }
      const cached = this.titleCache.get(header.id)
      if (cached && now - cached.at < (cached.title ? TITLE_CACHE_TTL : TITLE_EMPTY_TTL)) {
        if (cached.title) titles.set(header.id, cached.title)
        continue
      }
      pending.push(header.id)
    }
    if (!pending.length) return titles

    // 同步只解析用户马上要看的前 TITLE_BATCH 条。headers 已按 updatedAt 降序，
    // 也就是最新的那批先出标题；剩下的进后台队列，绝不阻塞这一次响应。
    const batch = pending.slice(0, TITLE_BATCH)
    for (const id of pending.slice(TITLE_BATCH)) this.titleQueue.add(id)
    this.pumpTitles()

    const sessionQuery = this.ctx.get('sessionQuery')
    if (sessionQuery && typeof sessionQuery.readTitleSnapshots === 'function') {
      try {
        const snapshots = await sessionQuery.readTitleSnapshots(batch, signal)
        snapshots.forEach((result, index) => {
          const id = batch[index]
          if (!result) return
          if (result.status !== 'fulfilled') {
            // 读不出来（日志损坏 / 已删除）：短缓存一下，别每次重试。
            this.titleCache.set(id, { title: '', at: Date.now() })
            return
          }
          const title = HarnessRuntime.titleText(result.value)
          if (title) titles.set(id, title)
          this.titleCache.set(id, { title, at: Date.now() })
        })
        this.saveTitleStoreSoon()
      } catch { /* 版本不支持就退回 header */ }
    }
    this.pruneTitles()
    return titles
  }

  /**
   * 后台把队列里的冷会话一点点焐热。
   *
   * 关键是**批与批之间必须 await 让出事件循环**：readTitleSnapshots 是同步解
   * zstd 的重活，一次塞 128 个会把 HTTP 响应全部卡死（实测 /health 也超时）。
   */
  async pumpTitles() {
    if (this.titlePumping || this.disposed) return
    if (!this.titleQueue.size) return
    this.titlePumping = true
    try {
      while (this.titleQueue.size && !this.disposed) {
        const batch = [...this.titleQueue].slice(0, TITLE_PUMP_BATCH)
        for (const id of batch) this.titleQueue.delete(id)
        const sessionQuery = this.ctx.get('sessionQuery')
        if (!sessionQuery || typeof sessionQuery.readTitleSnapshots !== 'function') break
        try {
          const snapshots = await sessionQuery.readTitleSnapshots(batch, undefined)
          snapshots.forEach((result, index) => {
            const id = batch[index]
            if (!result) return
            if (result.status !== 'fulfilled') {
              this.titleCache.set(id, { title: '', at: Date.now() })
              return
            }
            const title = HarnessRuntime.titleText(result.value)
            this.titleCache.set(id, { title, at: Date.now() })
          })
          this.saveTitleStoreSoon()
        } catch { /* 单批失败不影响后续 */ }
        // 让出事件循环，给 HTTP / SSE 留出时间片。
        await new Promise((resolve) => setTimeout(resolve, TITLE_PUMP_DELAY))
      }
    } finally {
      this.titlePumping = false
    }
  }

  /* ------------------------------------------------------------ */
  /* 标题缓存落盘                                                    */
  /* ------------------------------------------------------------ */

  titleStoreFile() {
    try { return path.join(dataRoot(), 'titles.json') } catch { return null }
  }

  /** 第一次用到时把盘上的缓存读进来（只读一次，坏了就当空）。 */
  loadTitleStore() {
    if (this.titlesLoaded) return
    this.titlesLoaded = true
    const file = this.titleStoreFile()
    if (!file) return
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = JSON.parse(raw)
      const now = Date.now()
      for (const [id, entry] of Object.entries(parsed || {})) {
        if (!entry || typeof entry !== 'object') continue
        const title = typeof entry.title === 'string' ? entry.title : ''
        const at = Number(entry.at)
        if (!Number.isFinite(at)) continue
        if (now - at >= (title ? TITLE_CACHE_TTL : TITLE_EMPTY_TTL)) continue
        this.titleCache.set(String(id), { title, at })
      }
    } catch { /* 没有缓存文件 / 内容坏了都当空 */ }
  }

  /** 攒一下再写盘，别每批都 fsync（写盘失败不影响功能）。 */
  saveTitleStoreSoon() {
    if (this.titleSaveTimer) return
    this.titleSaveTimer = setTimeout(() => {
      this.titleSaveTimer = null
      this.saveTitleStore()
    }, 2000)
    this.titleSaveTimer.unref?.()
  }

  saveTitleStore() {
    const file = this.titleStoreFile()
    if (!file) return
    try {
      const out = {}
      for (const [id, entry] of this.titleCache) {
        if (!entry || !Number.isFinite(entry.at)) continue
        out[id] = { title: entry.title || '', at: entry.at }
      }
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch { /* 落盘失败只是下次重启慢一点 */ }
  }

  /** 缓存别无限长：先按 TTL 清，再按条数砍最旧的。 */
  pruneTitles() {
    const now = Date.now()
    for (const [id, entry] of this.titleCache) {
      const ttl = entry.title ? TITLE_CACHE_TTL : TITLE_EMPTY_TTL
      if (now - entry.at >= ttl) this.titleCache.delete(id)
    }
    if (this.titleCache.size <= TITLE_STORE_LIMIT) return
    const sorted = [...this.titleCache.entries()].sort((left, right) => left[1].at - right[1].at)
    for (const [id] of sorted.slice(0, this.titleCache.size - TITLE_STORE_LIMIT)) this.titleCache.delete(id)
  }

  /** 标题优先级：timeline/日志里的标题 → header.title → 首条用户消息 → 占位。 */
  pickTitle(header, titles) {
    const fromLog = titles && titles.get(header.id)
    const value = fromLog || header.title || header.firstUserMessage || '未命名会话'
    return preview(value, TITLE_MAX)
  }

  async listSessions(options, signal) {
    const opts = options && typeof options === 'object' ? options : {}
    const archivedOnly = opts.archivedOnly === true
    const includeArchived = archivedOnly || opts.includeArchived === true;
    const entries = []
    const sessionQuery = this.ctx.get('sessionQuery')
    if (sessionQuery && typeof sessionQuery.listSessions === 'function') {
      const listed = await sessionQuery.listSessions(signal)
      for (const entry of listed) {
        const header = entry && entry.header ? entry.header : entry
        if (!header || !header.id) continue
        entries.push(header)
      }
    }
    // 刚创建但还没持久化的会话也要能看到。
    for (const id of this.timelines.keys()) {
      if (entries.some((header) => header.id === id)) continue
      const live = this.ctx.get('sessions')?.get?.(id)
      if (live) entries.push(live.header)
    }
    // 子代理内部会话不进手机列表（官方 App 也只列用户自己的对话）。
    const { archived, pinned } = this.marks()
    const visible = entries.filter((header) => {
      if (HarnessRuntime.isSubagentSession(header)) return false
      // DSH 的 workspaceRegistry 只登记「归档」这个集合，会话本身不动——
      // 官方 UI 就是过滤掉归档 id。所以默认也不返回，除非显式要。
      // 归档箱（archivedOnly）反过来：只要归档的。
      if (archivedOnly) return archived.has(header.id)
      if (!includeArchived && archived.has(header.id)) return false
      return true
    })
    const titles = await this.resolveTitles(visible, signal).catch(() => new Map())
    const rows = visible.map((header) => {
      const timeline = this.timelines.get(header.id)
      return {
        id: header.id,
        title: this.pickTitle(header, titles),
        cwd: header.cwd || null,
        updatedAt: Number(header.updatedAt || header.createdAt || 0) || (timeline ? timeline.updatedAt : 0),
        status: timeline ? timeline.status : 'idle',
        lastText: timeline ? timeline.lastText() : '',
        itemCount: timeline ? timeline.items.size : 0,
        pinned: pinned.has(header.id),
        archived: archived.has(header.id),
      }
    })
    // 置顶优先，其余按最近活动排序（对齐官方 App：置顶的会话永远在最上面，
    // 所以 Android 端也把 pinned 的条目单独归到「置顶」分组，避免混进日期分组）。
    rows.sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      return right.updatedAt - left.updatedAt
    })
    return rows.slice(0, INVENTORY_LIMIT)
  }

  async sessionDetail(id, signal) {
    const timeline = await this.hydrate(id, signal)
    const live = this.ctx.get('sessions')?.get?.(id)
    const header = live ? live.header : (await this.readLog(id, signal)).session
    const titles = await this.resolveTitles([{ ...header, id }], signal).catch(() => new Map())
    const { archived, pinned } = this.marks()
    return {
      id,
      title: this.pickTitle({ ...header, id }, titles),
      cwd: header.cwd || null,
      status: timeline.status,
      seq: timeline.throughSeq,
      items: timeline.snapshot(),
      pinned: pinned.has(id),
      archived: archived.has(id),
    }
  }

  /* ------------------------------------------------------------ */
  /* 图片回读                                                        */
  /* ------------------------------------------------------------ */

  /**
   * 把会话里引用到的一张图片读回来给手机显示。
   *
   * 优先走 DSH 官方的 SessionController.attachment RPC（它自己会先在会话日志里
   * 证明这张图确实被这个会话引用过，再把 base64 吐出来）；RPC 不可用时退回
   * AttachmentStore.readImage，但要先从事件里找到完整的 ImageAttachmentRef。
   */
  async readImage(sessionId, attachmentId, signal) {
    const wanted = String(attachmentId || '')
    if (!wanted) {
      const error = new Error('缺少 attachmentId')
      error.code = 'bad_request'
      throw error
    }
    const controller = this.ctx.get('sessionController')
    if (controller && typeof controller.attachment === 'function') {
      try {
        const value = await controller.attachment({ sessionId, attachmentId: wanted })
        if (value && value.attachment && typeof value.data === 'string') {
          return {
            mediaType: String(value.attachment.mediaType || 'application/octet-stream'),
            data: Buffer.from(value.data, 'base64'),
            ref: value.attachment,
          }
        }
      } catch (error) {
        // 落回下面的本地读法；两路都失败时把最后一个错误抛出去。
        this.lastImageError = String((error && error.message) || error)
      }
    }

    const attachments = this.ctx.get('attachments')
    if (!attachments || typeof attachments.readImage !== 'function') {
      const error = new Error('DSH 附件服务不可用，读不到这张图')
      error.code = 'service_unavailable'
      throw error
    }
    const ref = await this.findImageRef(sessionId, wanted, signal)
    if (!ref) {
      const error = new Error('这张图不在这个会话里')
      error.code = 'not_found'
      throw error
    }
    const stored = await attachments.readImage(ref, signal)
    return { mediaType: ref.mediaType || 'image/jpeg', data: Buffer.from(stored.data), ref: stored.ref || ref }
  }

  /** 在会话事件里找出 attachmentId 对应那条 image block 的完整引用。 */
  async findImageRef(sessionId, attachmentId, signal) {
    const log = await this.readLog(sessionId, signal)
    const stack = []
    for (const event of log.events) {
      const data = event && event.data
      if (data && Array.isArray(data.content)) stack.push(data.content)
      if (data && data.message && Array.isArray(data.message.content)) stack.push(data.message.content)
    }
    while (stack.length) {
      const content = stack.pop()
      for (const block of content) {
        if (!block || block.type !== 'image' || !block.attachment) continue
        if (String(block.attachment.attachmentId) === attachmentId) return block.attachment
      }
    }
    return null
  }

  /* ------------------------------------------------------------ */
  /* 发消息                                                         */
  /* ------------------------------------------------------------ */

  controller() {
    const controller = this.ctx.get('sessionController')
    if (!controller) {
      const error = new Error('DSH 会话控制器不可用，无法发送消息')
      error.code = 'service_unavailable'
      throw error
    }
    return controller
  }

  decodeModel(id) {
    if (typeof id !== 'string' || !id) return null
    const slash = id.indexOf('/')
    if (slash <= 0 || slash === id.length - 1) return null
    return { provider: id.slice(0, slash), model: id.slice(slash + 1) }
  }

  /**
   * 当前会话正在用的 provider/model（手机只切「深度思考」不换模型时要用）。
   *
   * 三段兜底：sessionController.selectionFor(agent).current → 会话日志里的 requestHeader
   * → profile 里的 agent-default-model。任何一段抛错都往下掉，全失败就返回 null。
   */
  currentModel(agent) {
    const pick = (value) => (value && typeof value.provider === 'string' && typeof value.model === 'string'
      ? { provider: value.provider, model: value.model }
      : null)
    try {
      const controller = this.ctx.get('sessionController')
      if (controller && typeof controller.selectionFor === 'function') {
        const found = pick(controller.selectionFor(agent).current)
        if (found) return found
      }
    } catch { /* 落到下一段 */ }
    try {
      const header = agent && agent.session && typeof agent.session.requestHeader === 'function'
        ? agent.session.requestHeader()
        : null
      const found = pick(header && header.config)
      if (found) return found
    } catch { /* 落到下一段 */ }
    return this.decodeModel(this.configuredModel())
  }

  async applySelections(agent, selections, initial, signal) {
    const abort = signal || new AbortController().signal
    if (!selections || typeof selections !== 'object') selections = {}
    const ctx = this.ctx
    // 「深度思考」开关：selections.reasoning 是 effort id（high/max…），空串或 null 表示
    // 由 DSH 用模型默认值。它跟 model 一起构成 ModelSelection { provider, model, reasoningEffort? }，
    // 所以只能拼进 decodeModel 的结果里，单独传会被 selectModel 丢掉。
    const effort = typeof selections.reasoning === 'string' ? selections.reasoning.trim() : ''
    // 只改档位不换模型时，用当前 selection 补出 provider/model，否则 effort 无处安放
    //（selectModel 必须拿到完整三元组）。decodeModel 每次都返回新对象，直接加字段是安全的。
    const decoded = selections.model
      ? this.decodeModel(selections.model)
      : (effort ? this.currentModel(agent) : null)
    if (decoded) {
      if (effort) decoded.reasoningEffort = effort
      const llm = ctx.get('llm')
      if (llm && typeof llm.resolveCallConfig === 'function') {
        try { await llm.resolveCallConfig(decoded) } catch (error) {
          // 模型不支持这个 effort 时 DSH 抛 UNSUPPORTED_REASONING_EFFORT，
          // 别把它当成「模型不可用」，否则用户换了个档位却被告知换模型。
          const reason = String((error && error.code) || '') + ' ' + String((error && error.message) || '')
          if (effort && /reasoning|effort/i.test(reason)) {
            const failure = new Error('这个模型不支持「' + effort + '」这个思考强度，换一档再试')
            failure.code = 'bad_reasoning'
            throw failure
          }
          const failure = new Error('DSH 不接受这个模型，请在手机上重新选择')
          failure.code = 'bad_model'
          throw failure
        }
      }
      try { await this.controller().selectModel({ sessionId: agent.id, ...decoded }) } catch { /* 可能已经是这个模型 */ }
    }
    // wanted/applied/failure 提到外层：结尾要用它们拼「这次到底生效了什么」的回显。
    let wanted = null
    let applied = null
    let failure = null
    if (selections.permission) {
      const presets = ctx.get('permissionPresets')
      if (presets) {
        wanted = String(selections.permission)
        const before = typeof presets.current === 'function' ? safeCurrent(presets, agent.session) : null
        applied = before
        failure = null
        if (before !== wanted) {
          if (typeof presets.set === 'function') {
            try {
              presets.set(agent.session, wanted)
              applied = safeCurrent(presets, agent.session)
            } catch (error) {
              failure = 'set: ' + String((error && error.message) || error)
            }
          }
          if (applied !== wanted) {
            // 回退到 /permission 命令，某些版本只允许走命令通道。
            const commands = ctx.get('commands')
            if (commands && typeof commands.find === 'function' && commands.find(agent, 'permission')) {
              try {
                const outcome = await commands.execute(agent, '/permission ' + wanted, [], abort)
                if (outcome && outcome.result && outcome.result.kind === 'success') {
                  applied = safeCurrent(presets, agent.session)
                  failure = null
                } else if (!failure) {
                  failure = 'command refused'
                }
              } catch (error) {
                failure = (failure ? failure + '; ' : '') + 'command: ' + String((error && error.message) || error)
              }
            }
          }
        }
      }
    }
    // 回显「这一次请求实际带了什么」。reasoning 每次按本次请求重算（没带就是 null），
    // 否则手机改完开关、下一次不带 reasoning 时响应还停在上一档，像是开关粘住了；
    // model/permission 没带时沿用上一次的值（会话是有状态的，DSH 也确实沿用）。
    // 但新建会话（initial）没有「上一次」可言——沿用会把别的会话的模型回显给手机。
    const previous = initial ? {} : (this.lastSelections || {})
    this.lastSelections = {
      model: selections.model || previous.model || null,
      reasoning: effort || null,
      permission: wanted || previous.permission || null,
      applied: wanted ? applied : (previous.applied || null),
      failure: wanted ? failure : null,
    }
  }

  /**
   * resolveAgent 返回 { agent } 或 { error }，不是 agent 本身。
   *
   * { error } 目前唯一来源是「这个会话是子代理的内部会话」——DSH 原文见
   * dsh-api-session-controller/lib/index.js 的 resolve()：命中
   * hasApiSessionSubagentOwner() 就返回 apiSessionSubagentOwnershipError()，
   * 一个 RemoteError('session/agent-busy', ...)。这种会话只能通过子代理路由
   * 继续，手机上没法当普通会话发消息，所以文案必须说人话。
   */
  async resolveAgent(id) {
    const found = await this.controller().resolveAgent(id)
    if (found && typeof found === 'object' && !('error' in found) && found.agent) return found.agent
    const reason = found && typeof found === 'object' ? found.error : undefined
    const code = reason && typeof reason === 'object' ? String(reason.code || reason.reason || '') : ''
    if (/agent-busy|subagent/i.test(code) || /subagent/i.test(String((reason && reason.message) || ''))) {
      const error = new Error('这个会话是子代理的内部会话，手机上不能直接继续：请回到发起它的那个会话里对话')
      error.code = 'subagent_session'
      error.cause = reason
      throw error
    }
    const message = String((reason && reason.message) || '')
    // 会话根本不存在（打字错/被删/换机器）：给 404，别让手机以为服务挂了。
    if (/not found|no such session|unknown session/i.test(message) || /session\/not-found/i.test(code)) {
      const missing = new Error('这个会话不存在了')
      missing.code = 'session_not_found'
      missing.cause = reason
      throw missing
    }
    const error = new Error('DSH 无法激活这个会话' + (message ? '：' + message : ''))
    error.code = 'service_unavailable'
    error.cause = reason
    throw error
  }

  async prompt(sessionId, text, requestId, selections, signal, images) {
    const controller = this.controller()
    const agent = await this.resolveAgent(sessionId)
    const abort = signal || new AbortController().signal
    await this.applySelections(agent, selections, false, abort)
    const content = promptContent(text, images)
    if (!content.length) {
      const error = new Error('消息不能为空')
      error.code = 'bad_request'
      throw error
    }
    const timeline = this.timeline(sessionId)
    const messageId = 'phone-' + digest(sessionId + ':' + requestId).slice(0, 32)
    await controller.prompt({
      sessionId,
      requestId: messageId,
      mode: 'queue',
      content,
    }, abort)
    try { await this.ctx.get('sessions')?.flush?.(agent.session) } catch { /* 忽略 */ }
    return { accepted: true, seq: timeline.throughSeq, selections: this.lastSelections || null }
  }

  async createSession({ cwd, text, requestId, model, permission, reasoning, agentPreset, images }, signal) {
    const content = promptContent(text, images)
    if (!content.length) {
      const error = new Error('第一条消息不能为空')
      error.code = 'bad_request'
      throw error
    }
    if (!requestId) {
      const error = new Error('缺少 requestId')
      error.code = 'bad_request'
      throw error
    }
    let directory
    try {
      directory = fs.realpathSync(String(cwd || ''))
      if (!fs.statSync(directory).isDirectory()) throw new Error('not a directory')
    } catch {
      const error = new Error('这个目录在本机不存在：' + String(cwd || ''))
      error.code = 'bad_cwd'
      throw error
    }

    const controller = this.controller()
    const sessionId = 'session-' + crypto.randomUUID()
    const presets = this.ctx.get('agentPresets')
    let preset = agentPreset
    if (!preset && presets && typeof presets.list === 'function') {
      try {
        const list = await presets.list()
        const usable = list.find((entry) => !entry.broken)
        preset = usable ? usable.id : undefined
      } catch { /* 忽略 */ }
    }

    await controller.create({ sessionId, cwd: directory, ...(preset ? { agentPreset: preset } : {}) })
    const workspaceRegistry = this.ctx.get('workspaceRegistry')
    if (workspaceRegistry && typeof workspaceRegistry.create === 'function') {
      try {
        const workspace = await workspaceRegistry.create(directory)
        await workspace.attachSession(sessionId)
      } catch { /* 工作区登记失败不致命 */ }
    }

    const agent = await this.resolveAgent(sessionId)
    await this.applySelections(agent, { model, permission, reasoning }, true, signal || new AbortController().signal)
    const messageId = 'phone-' + digest(sessionId + ':' + requestId).slice(0, 32)
    await controller.prompt({
      sessionId,
      requestId: messageId,
      mode: 'queue',
      content,
    }, signal || new AbortController().signal)
    try { await this.ctx.get('sessions')?.flush?.(agent.session) } catch { /* 忽略 */ }
    return { sessionId, accepted: true, seq: this.timeline(sessionId).throughSeq, selections: this.lastSelections || null }
  }

  /* ------------------------------------------------------------ */
  /* 会话管理：改名 / 归档 / 置顶                                    */
  /* ------------------------------------------------------------ */

  /**
   * 改会话标题。
   *
   * 签名来自 asar 原文（@deepseek-ai/dsh-session-title/lib/index.js 的 rename）：
   *   rename(session, title) → { title, eventSeq }
   * 入参是**活会话**（内部做 ctx.sessions.get(session.id) !== session 的检查），
   * 所以必须先 resolveAgent 拿 agent.session；标题会归一化（去控制字符、压空白），
   * 归一化后为空抛 SessionTitleInvalidError。
   */
  async renameSession(id, title, signal) {
    const value = String(title == null ? '' : title)
    if (!value.trim()) {
      const error = new Error('标题不能为空')
      error.code = 'bad_title'
      throw error
    }
    const titles = this.ctx.get('sessionTitle')
    if (!titles || typeof titles.rename !== 'function') {
      const error = new Error('这个 DSH 没有挂载会话标题服务（sessionTitle），没法改名')
      error.code = 'title_unavailable'
      throw error
    }
    const agent = await this.resolveAgent(id)
    let accepted
    try {
      accepted = titles.rename(agent.session, value)
    } catch (error) {
      // SessionTitleInvalidError 只有一个来源：标题归一化后为空。
      if (error && (error.name === 'SessionTitleInvalidError' || /visible characters/.test(String(error.message || '')))) {
        const bad = new Error('标题里没有可见字符')
        bad.code = 'bad_title'
        throw bad
      }
      const failed = new Error('改名失败：' + String((error && error.message) || error))
      failed.code = 'rename_failed'
      throw failed
    }
    const edited = { title: String(accepted && accepted.title ? accepted.title : value), seq: Number(accepted && accepted.eventSeq) }
    // 立刻同步给内存时间线，手机不用等 session/title 事件回灌就能看到新名字。
    const timeline = this.timeline(id)
    timeline.title = edited.title
    if (Number.isFinite(edited.seq)) timeline.titleSeq = edited.seq
    this.titleCache.delete(id)
    return edited
  }

  /**
   * 归档会话（从列表里隐藏）。
   *
   * 签名来自 asar 原文（dsh-workspace/lib/types/index.js 的 WorkspaceRegistry）：
   *   archiveSession(sessionId, options?)  options = { stopActivity?: true }
   * 不传 stopActivity 时，只要 workspace/session-activity waterfall 报了活动，
   * 就抛 WorkspaceActiveSessionError（api 层映射成 RemoteError
   * 'workspace/session-active'）。所以这里先 agent.cancel 再重试一次，最后用
   * stopActivity:true 兜底（那是 DSH 官方的「先停再做」路径）。
   */
  async archiveSession(id, signal) {
    const registry = this.registry()
    if (!registry) {
      const error = new Error('这个 DSH 没有挂载 workspaceRegistry，没法归档')
      error.code = 'archive_unavailable'
      throw error
    }
    try {
      await registry.archiveSession(id, {})
    } catch (error) {
      const text = String((error && (error.code || error.name)) || '') + ' ' + String((error && error.message) || '')
      if (!/session-active|active/i.test(text)) {
        // WorkspaceUnknownSessionError 的原文是 "cannot archive session '<id>': live sessions
        // and session persistence hold no such session"。
        if (/no such session|not-found|UnknownSession|not found/i.test(text)) {
          const missing = new Error('这个会话不存在了')
          missing.code = 'session_not_found'
          missing.cause = error
          throw missing
        }
        const failed = new Error('归档失败：' + String((error && error.message) || error))
        failed.code = 'archive_failed'
        throw failed
      }
      // 还有活在跑：先让它停下来，再重试一次。
      try {
        const agents = this.ctx.get('agents')
        const agent = agents && typeof agents.get === 'function' ? agents.get(id) : undefined
        if (agent && typeof agent.cancel === 'function') agent.cancel({ kind: 'user' })
      } catch { /* 停不下来就交给 stopActivity */ }
      try {
        await registry.archiveSession(id, {})
      } catch {
        try {
          await registry.archiveSession(id, { stopActivity: true })
        } catch (second) {
          const failed = new Error('归档失败：' + String((second && second.message) || second))
          failed.code = 'archive_failed'
          throw failed
        }
      }
    }
    return { ok: true, archived: this.marks().archived.has(id) }
  }

  /** 取消归档。签名：unarchiveSession(sessionId)；未归档的 id 是幂等 no-op。 */
  async unarchiveSession(id) {
    const registry = this.registry()
    if (!registry || typeof registry.unarchiveSession !== 'function') {
      const error = new Error('这个 DSH 没有挂载 workspaceRegistry，没法取消归档')
      error.code = 'archive_unavailable'
      throw error
    }
    await registry.unarchiveSession(id)
    return { ok: true, archived: this.marks().archived.has(id) }
  }

  /** 置顶 / 取消置顶（官方 App 的 pin）。归档的会话不能置顶，DSH 会抛错。 */
  async pinSession(id, pinned) {
    const registry = this.registry()
    const method = pinned ? 'pinSession' : 'unpinSession'
    if (!registry || typeof registry[method] !== 'function') {
      const error = new Error('这个 DSH 没有挂载 workspaceRegistry，没法置顶')
      error.code = 'pin_unavailable'
      throw error
    }
    try {
      await registry[method](id)
    } catch (error) {
      const failed = new Error('置顶失败：' + String((error && error.message) || error))
      failed.code = 'pin_failed'
      throw failed
    }
    return { ok: true, pinned: this.marks().pinned.has(id) }
  }

  interrupt(sessionId) {
    const agents = this.ctx.get('agents')
    const agent = agents?.get?.(sessionId)
    if (!agent || typeof agent.cancel !== 'function') {
      const error = new Error('这个会话当前没有在跑')
      error.code = 'not_running'
      throw error
    }
    agent.cancel({ kind: 'user' })
    return { ok: true }
  }

  /* ------------------------------------------------------------ */
  /* 订阅                                                          */
  /* ------------------------------------------------------------ */

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(payload) {
    for (const listener of this.listeners) {
      try { listener(payload) } catch { /* 一个订阅者出错不影响别人 */ }
    }
  }

  close() {
    this.disposed = true
    this.listeners.clear()
    this.timelines.clear()
    this.titleQueue.clear()
    if (this.titleSaveTimer) {
      clearTimeout(this.titleSaveTimer)
      this.titleSaveTimer = null
      this.saveTitleStore()
    }
  }
}

export function dataRoot() {
  const base = process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  return path.join(base, 'phone-harness')
}
