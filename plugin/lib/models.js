import fs from 'node:fs'
import path from 'node:path'

/**
 * 「模型可选择性配置」的宿主侧全部逻辑。
 *
 * 手机 App 通过四条接口读写这台机器上的模型配置：
 *   GET    /v1/models               列出 provider / model / 能力 + 默认选择 + 自定义配置
 *   POST   /v1/models/default       切换默认模型（写 profile 的 agent-default-model）
 *   POST   /v1/models/custom        添加一条 llm-pi-ai 外部路由
 *   DELETE /v1/models/custom/{route} 删除一条外部路由
 *
 * 两条写路径：
 *   1. 首选 ctx.get('configEditor').edit(entry, change) —— 走 DSH 自己的配置编辑器，
 *      校验 + 落盘 + Loader 热重载一条龙，改完立刻生效（applied:true）；
 *   2. 退路：直接改 profile 的 cordis.patch.yml 里 llm-pi-ai 那段（先备份再原子写）。
 *      Loader 不会因为我们改文件就重建插件，所以如实回 applied:false / needsRestart:true。
 *
 * 原则：任何一项 DSH 服务缺失或抛错都降级（空数组 + failures），GET 永远不 500。
 * 所有 DSH 服务只通过 ctx.get(...) 拿，绝不 import 内部模块。
 */

const PI_AI_ID = 'llm-pi-ai'
const PI_AI_NAME_HINT = 'llm-pi-ai'
const DEFAULT_API = 'openai-completions'
/** route 与凭据环境变量的形状（与 App 端约定一致，不能放宽）。 */
const ROUTE_RE = /^[a-z0-9_-]{2,32}$/
const API_KEY_ENV_RE = /^[A-Z][A-Z0-9_]*$/
const MODEL_ID_MAX = 128
const REASONING_RE = /^[A-Za-z0-9_-]{1,16}$/
/** provider/model 列表缓存；配置一改就 invalidate()，所以 TTL 只防抖。 */
const CACHE_TTL = 20000

function coded(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function messageOf(error) {
  return String((error && error.message) || error || 'unknown')
}

/** 正整数（contextWindow / maxTokens）；拿不到或非法就返回 null，让调用方省略字段。 */
function positive(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

/** 字符串数组去空白去空项。 */
function stringList(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const raw of value) {
    const item = text(raw)
    if (!item) continue
    if (!out.includes(item)) out.push(item)
  }
  return out
}

/** 从 llm.resolveModel 的 reasoning 描述里抽档位 id 列表（App 要字符串数组）。 */
function effortIds(reasoning) {
  if (!isObject(reasoning) || !Array.isArray(reasoning.efforts)) return []
  const out = []
  for (const effort of reasoning.efforts) {
    const id = typeof effort === 'string' ? effort : text(effort && effort.id)
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

/** profile 里的 llm-pi-ai 条目（id 优先，其次插件名）。 */
function findPiAiEntry(entries) {
  if (!Array.isArray(entries)) return null
  for (const entry of entries) {
    const id = entry && entry.options && entry.options.id
    if (id === PI_AI_ID) return entry
  }
  for (const entry of entries) {
    const name = entry && entry.options && entry.options.name
    if (typeof name === 'string' && name.includes(PI_AI_NAME_HINT)) return entry
  }
  return null
}

/* ---------------------------------------------------------------- */
/* profile patch yml 的最小文本编辑器                                 */
/* ---------------------------------------------------------------- */
/* 插件运行在 DSH 进程里，profile 的 node_modules 里没有 js-yaml，      */
/* 所以这里用「定位 llm-pi-ai 那一段 + 按缩进插删」的文本方式改文件，     */
/* 只碰自己写的那一块，其余字节原样保留。                              */

const q = (value) => JSON.stringify(String(value == null ? '' : value))

function stripQuotes(value) {
  const raw = String(value == null ? '' : value).trim()
  if (raw.length >= 2 && ((raw[0] === '"' && raw[raw.length - 1] === '"') || (raw[0] === "'" && raw[raw.length - 1] === "'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

/** 找到「- id: llm-pi-ai」这一条在行数组里的范围 [start, end)。 */
function findPatchBlock(lines) {
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const match = /^-\s+id:\s*(.+?)\s*$/.exec(lines[i])
    if (match && stripQuotes(match[1]) === PI_AI_ID) { start = i; break }
  }
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^-\s/.test(lines[i]) || /^[^\s#]/.test(lines[i])) { end = i; break }
  }
  return { start, end }
}

/** 段里的 providers: 头；providers: {} 这种内联写法也认（稍后会被展开）。 */
function findProvidersHeader(lines, block) {
  for (let i = block.start; i < block.end; i++) {
    const match = /^(\s*)providers:\s*(\{.*\})?\s*(#.*)?$/.exec(lines[i])
    if (match) return { index: i, indent: match[1].length, inline: Boolean(match[2]) }
  }
  return null
}

/** 段里的 config: 头。 */
function findConfigHeader(lines, block) {
  for (let i = block.start; i < block.end; i++) {
    const match = /^(\s*)config:\s*(#.*)?$/.exec(lines[i])
    if (match) return { index: i, indent: match[1].length }
  }
  return null
}

/** providers 段里已存在的 route 名字集合。 */
function routesInPatch(lines, block, header) {
  const routes = new Set()
  if (!header) return routes
  for (let i = header.index + 1; i < block.end; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#') || /^\s*-/.test(line)) continue
    const match = /^(\s*)([^:#][^:]*?)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const indent = match[1].length
    if (indent <= header.indent) break
    if (indent === header.indent + 2) routes.add(stripQuotes(match[2]))
  }
  return routes
}

/** 一条 route 的 YAML 行（全部标量用双引号，中文原样保留）。 */
function renderRoute(indent, route, profile) {
  const pad = (size) => ' '.repeat(size)
  const out = []
  out.push(pad(indent) + route + ':')
  out.push(pad(indent + 2) + 'displayName: ' + q(profile.displayName))
  out.push(pad(indent + 2) + 'apiKeyEnv: ' + q(profile.apiKeyEnv))
  out.push(pad(indent + 2) + 'api: ' + q(profile.api))
  out.push(pad(indent + 2) + 'baseURL: ' + q(profile.baseURL))
  out.push(pad(indent + 2) + 'models:')
  for (const model of profile.models) {
    out.push(pad(indent + 4) + '- id: ' + q(model.id))
    out.push(pad(indent + 6) + 'name: ' + q(model.name))
    if (model.contextWindow) out.push(pad(indent + 6) + 'contextWindow: ' + String(model.contextWindow))
    if (model.maxTokens) out.push(pad(indent + 6) + 'maxTokens: ' + String(model.maxTokens))
  }
  return out
}

function readTextFile(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

/** 读 profile patch 里 llm-pi-ai 的 route 集合；读不到返回 null（未知），段在但没 providers 返回空集合。 */
function readPatchRoutes(file) {
  const raw = readTextFile(file)
  if (raw == null) return null
  const lines = raw.split(/\r?\n/)
  const block = findPatchBlock(lines)
  if (!block) return null
  const header = findProvidersHeader(lines, block)
  return header ? routesInPatch(lines, block, header) : new Set()
}

/** 备份 + 原子写。返回备份路径。 */
function writeWithBackup(file, nextText) {
  const stamp = Date.now()
  let backup = file + '.bak-phone-models-' + stamp
  try {
    if (fs.existsSync(backup)) backup = backup + '-' + process.pid
    fs.copyFileSync(file, backup)
  } catch (error) {
    throw coded('config_unavailable', '写配置前备份失败：' + messageOf(error))
  }
  const temp = file + '.' + process.pid + '.tmp'
  try {
    fs.writeFileSync(temp, nextText, 'utf8')
    fs.renameSync(temp, file)
  } catch (error) {
    try { fs.rmSync(temp, { force: true }) } catch { /* 忽略 */ }
    throw coded('config_unavailable', '写 profile patch 失败：' + messageOf(error))
  }
  return backup
}

/** 往 profile patch 的 llm-pi-ai.providers 里插一条 route；已存在抛 custom_exists。 */
function writeRouteToPatch(file, route, profile) {
  const raw = readTextFile(file)
  if (raw == null) throw coded('config_unavailable', '读不到 profile patch：' + file)
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const block = findPatchBlock(lines)
  if (!block) throw coded('config_unavailable', 'profile patch 里没有 llm-pi-ai 这一条：' + file)
  const header = findProvidersHeader(lines, block)
  if (header && routesInPatch(lines, block, header).has(route)) {
    throw coded('custom_exists', 'route "' + route + '" 已经在 llm-pi-ai 配置里了')
  }
  let insertAt = -1
  let indent = 6
  let next = lines
  if (header) {
    insertAt = header.index + 1
    indent = header.indent + 2
    if (header.inline) {
      next = lines.slice()
      next[header.index] = ' '.repeat(header.indent) + 'providers:'
    }
  } else {
    const config = findConfigHeader(lines, block)
    if (config) {
      insertAt = config.index + 1
      indent = config.indent + 4
      next = lines.slice()
      next.splice(insertAt, 0, ' '.repeat(config.indent + 2) + 'providers:')
      insertAt += 1
    } else {
      insertAt = block.end
      indent = 6
      next = lines.slice()
      next.splice(insertAt, 0, '  config:', '    providers:')
      insertAt += 2
    }
  }
  const rendered = renderRoute(indent, route, profile)
  next = next.slice(0, insertAt).concat(rendered, next.slice(insertAt))
  const out = next.join(eol)
  return writeWithBackup(file, out.endsWith(eol) ? out : out + eol)
}

/** 从 profile patch 的 llm-pi-ai.providers 里删掉一条 route；找不到抛 unknown_custom。 */
function removeRouteFromPatch(file, route) {
  const raw = readTextFile(file)
  if (raw == null) throw coded('config_unavailable', '读不到 profile patch：' + file)
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(/\r?\n/)
  const block = findPatchBlock(lines)
  if (!block) throw coded('config_unavailable', 'profile patch 里没有 llm-pi-ai 这一条：' + file)
  const header = findProvidersHeader(lines, block)
  if (!header) throw coded('unknown_custom', '没有这个自定义模型配置')
  let keyIndex = -1
  for (let i = header.index + 1; i < block.end; i++) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#') || /^\s*-/.test(line)) continue
    const match = /^(\s*)([^:#][^:]*?)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const indent = match[1].length
    if (indent <= header.indent) break
    if (indent === header.indent + 2 && stripQuotes(match[2]) === route) { keyIndex = i; break }
  }
  if (keyIndex < 0) throw coded('unknown_custom', '没有这个自定义模型配置')
  let stop = block.end
  for (let i = keyIndex + 1; i < block.end; i++) {
    if (!lines[i].trim()) continue
    const match = /^(\s*)\S/.exec(lines[i])
    const indent = match ? match[1].length : 0
    if (indent <= header.indent + 2) { stop = i; break }
  }
  const next = lines.slice(0, keyIndex).concat(lines.slice(stop))
  return writeWithBackup(file, next.join(eol))
}

/* ---------------------------------------------------------------- */

export class ModelRegistry {
  /**
   * @param ctx cordis 上下文（只用 ctx.get(...)）。
   * @param options {readDefaults, configuredModel, profilePatchPath, storePath, cacheTtlMs, logger}
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.options = isObject(options) ? options : {}
    this.storePath = text(this.options.storePath) || null
    this.cacheTtl = Number.isFinite(this.options.cacheTtlMs) ? Math.max(0, Number(this.options.cacheTtlMs)) : CACHE_TTL
    this.logger = this.options.logger || null
    this.cache = { catalogAt: 0, catalog: null, routesAt: 0, hasRoutes: false, routes: null }
    this.storeCache = null
  }

  /* ---------------- 基础 ---------------- */

  service(name) {
    try { return this.ctx.get(name) || null } catch { return null }
  }

  say(level, message) {
    try {
      if (this.logger && typeof this.logger[level] === 'function') this.logger[level]('phone-harness: ' + message)
    } catch { /* 忽略 */ }
  }

  invalidate() {
    this.cache.catalogAt = 0
    this.cache.catalog = null
    this.cache.routesAt = 0
    this.cache.hasRoutes = false
    this.cache.routes = null
  }

  readDefaults() {
    try {
      const value = typeof this.options.readDefaults === 'function' ? this.options.readDefaults() : null
      return isObject(value) ? value : {}
    } catch { return {} }
  }

  configuredModel() {
    try {
      return typeof this.options.configuredModel === 'function' ? this.options.configuredModel() : null
    } catch { return null }
  }

  selection() {
    const service = this.service('agentDefaultModel')
    if (!service || typeof service.currentSelection !== 'function') return null
    try {
      const value = service.currentSelection()
      return isObject(value) ? value : null
    } catch { return null }
  }

  /** 当前默认选择 {model:'provider/model'|null, reasoning:string|null}（只读）。 */
  defaultsNow() {
    const config = this.readDefaults()
    const selection = this.selection()
    const selectionModel = selection && text(selection.provider) && text(selection.model)
      ? text(selection.provider) + '/' + text(selection.model)
      : null
    const selectionReasoning = selection && text(selection.reasoningEffort) ? text(selection.reasoningEffort) : ''
    const model = text(config.model) || this.configuredModel() || selectionModel || null
    const reasoning = text(config.reasoning) || selectionReasoning || null
    return { model, reasoning }
  }

  /* ---------------- 自定义配置存储 ---------------- */

  store() {
    if (this.storeCache) return this.storeCache
    const data = { version: 1, routes: {} }
    if (this.storePath) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'))
        if (isObject(raw) && isObject(raw.routes)) data.routes = raw.routes
      } catch { /* 首次运行 / 文件损坏都从空开始 */ }
    }
    this.storeCache = data
    return data
  }

  saveStore(data) {
    if (!this.storePath) return
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true })
      const temp = this.storePath + '.' + process.pid + '.tmp'
      fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 })
      fs.renameSync(temp, this.storePath)
    } catch (error) {
      this.say('warn', '自定义模型清单落盘失败：' + messageOf(error))
    }
  }

  /** profile patch 的路径（configEditor → profileContext → 环境变量）。 */
  patchPath() {
    if (text(this.options.profilePatchPath)) return text(this.options.profilePatchPath)
    const editor = this.service('configEditor')
    if (editor) {
      try { if (typeof editor.documentPath === 'string' && editor.documentPath) return editor.documentPath } catch { /* 忽略 */ }
    }
    const profile = this.service('profileContext')
    if (profile) {
      try { if (typeof profile.patchPath === 'string' && profile.patchPath) return profile.patchPath } catch { /* 忽略 */ }
      try { if (typeof profile.dir === 'string' && profile.dir) return path.join(profile.dir, 'cordis.patch.yml') } catch { /* 忽略 */ }
    }
    if (text(process.env.DSH_PROFILE_DIR)) return path.join(text(process.env.DSH_PROFILE_DIR), 'cordis.patch.yml')
    if (text(process.env.DSH_HOME) && text(process.env.DSH_PROFILE)) {
      return path.join(text(process.env.DSH_HOME), 'profiles', text(process.env.DSH_PROFILE), 'cordis.patch.yml')
    }
    return null
  }

  /** llm-pi-ai 里现存的 route 集合；null = 判断不出来（服务都没了）。 */
  async piRoutes() {
    const now = Date.now()
    if (this.cache.hasRoutes && now - this.cache.routesAt < this.cacheTtl) return this.cache.routes
    let routes = null
    const editor = this.service('configEditor')
    if (editor && typeof editor.entries === 'function') {
      try {
        const entry = findPiAiEntry(editor.entries() || [])
        const providers = entry && entry.options && entry.options.config && entry.options.config.providers
        if (isObject(providers)) routes = new Set(Object.keys(providers))
      } catch { /* 落到文件 */ }
    }
    if (routes === null) {
      const file = this.patchPath()
      if (file) {
        try { routes = readPatchRoutes(file) } catch { routes = null }
      }
    }
    this.cache.routes = routes
    this.cache.hasRoutes = true
    this.cache.routesAt = now
    return routes
  }

  /* ---------------- 列表 ---------------- */

  async describeModel(llm, providerId, model, custom) {
    if (!model || typeof model.id !== 'string' || !model.id) return null
    const row = {
      id: providerId + '/' + model.id,
      // App 直接把 title 显示出来，优先用模型自己的 name（DeepSeek-V4.1-Flash 这种）。
      title: text(model.name) || model.id,
      provider: providerId,
      model: model.id,
    }
    let info = null
    if (typeof llm.resolveModel === 'function') {
      try { info = await llm.resolveModel(providerId, model.id) } catch { info = null }
    }
    const contextWindow = positive(model.contextWindow)
      || positive(model.context && model.context.contextWindow)
      || positive(info && info.context && info.context.contextWindow)
    const maxTokens = positive(model.maxTokens)
      || positive(info && info.defaultMaxTokens)
      || positive(info && info.maxTokens)
    const declaredInput = stringList(model.input)
    const listedInput = stringList(model.inputModalities)
    const resolvedInput = stringList(info && info.inputModalities)
    const input = declaredInput.length ? declaredInput : listedInput.length ? listedInput : resolvedInput
    const efforts = effortIds(info && info.reasoning)
    if (contextWindow) row.contextWindow = contextWindow
    if (maxTokens) row.maxTokens = maxTokens
    if (input.length) row.input = input
    // 拿不到「有哪些思考档位」就整条省略，App 会降级成只有默认档。
    if (efforts.length) row.reasoning = efforts
    const defaultEffort = text(info && info.reasoning && info.reasoning.defaultEffort)
    if (defaultEffort) row.reasoningDefault = defaultEffort
    row.custom = custom === true
    return row
  }

  async list(signal) {
    const failures = []
    const providers = []
    const live = new Set()
    const llm = this.service('llm')
    if (!llm || typeof llm.listProviders !== 'function') {
      failures.push({ scope: 'llm', message: '模型服务不可用，模型列表为空' })
    } else {
      let listed = []
      try {
        const value = llm.listProviders()
        if (Array.isArray(value)) listed = value
      } catch (error) {
        failures.push({ scope: 'providers', message: 'provider 列表读取失败：' + messageOf(error) })
      }
      for (const provider of listed) {
        const id = text(provider && provider.id)
        if (!id) continue
        live.add(id)
        const entry = { id, name: text(provider.name) || id, configurable: false, custom: false, models: [] }
        let models = []
        if (typeof llm.listModels === 'function') {
          try {
            const value = await llm.listModels(id)
            if (Array.isArray(value)) models = value
          } catch (error) {
            failures.push({ provider: id, message: '模型列表读取失败：' + messageOf(error) })
          }
        }
        for (const model of models) {
          try {
            const row = await this.describeModel(llm, id, model, false)
            if (row) entry.models.push(row)
          } catch (error) {
            failures.push({ provider: id, model: text(model && model.id), message: messageOf(error) })
          }
        }
        providers.push(entry)
      }
    }

    const routes = await this.piRoutes()
    const storeRoutes = this.store().routes
    for (const entry of providers) {
      const mine = Object.prototype.hasOwnProperty.call(storeRoutes, entry.id)
      entry.custom = mine
      entry.configurable = routes ? routes.has(entry.id) : mine
      for (const model of entry.models) model.custom = mine
    }

    const custom = []
    for (const [route, entry] of Object.entries(storeRoutes)) {
      if (!isObject(entry)) continue
      custom.push({
        route,
        displayName: text(entry.displayName) || route,
        baseURL: text(entry.baseURL),
        apiKeyEnv: text(entry.apiKeyEnv),
        api: text(entry.api) || DEFAULT_API,
        modelIds: stringList(entry.modelIds),
        applied: live.has(route),
      })
    }
    custom.sort((left, right) => left.route.localeCompare(right.route))

    const defaults = this.defaultsNow()
    if (!defaults.model) {
      const first = providers.find((entry) => entry.models.length)
      defaults.model = first ? first.models[0].id : null
    }
    return { ok: true, defaults, providers, custom, failures }
  }

  /* ---------------- 切换默认模型 ---------------- */

  async setDefault(input) {
    const body = isObject(input) ? input : {}
    const modelId = text(body.model)
    if (!modelId) throw coded('bad_request', '需要 model（provider/model）')
    const slash = modelId.indexOf('/')
    if (slash <= 0 || slash === modelId.length - 1) throw coded('bad_model', '模型 id 必须形如 provider/model')
    const provider = modelId.slice(0, slash)
    const model = modelId.slice(slash + 1)
    const reasoning = typeof body.reasoning === 'string' ? body.reasoning.trim() : ''
    if (reasoning && !REASONING_RE.test(reasoning)) {
      throw coded('bad_reasoning', '思考强度只能是 1~16 位字母、数字、下划线或短横线')
    }
    const service = this.service('agentDefaultModel')
    if (!service || typeof service.saveSelection !== 'function') {
      throw coded('default_unavailable', '这台机器上没有可写的默认模型服务（agent-default-model 未加载）')
    }
    const next = { provider, model, ...(reasoning ? { reasoningEffort: reasoning } : {}) }
    try {
      await service.saveSelection(next)
    } catch (error) {
      throw coded('default_unavailable', '写默认模型失败：' + messageOf(error))
    }
    // saveSelection 在没有 configEditor 时会静默什么都不做，所以读回确认一次。
    const selection = this.selection()
    const applied = Boolean(selection)
      && text(selection.provider) === provider
      && text(selection.model) === model
      && (!reasoning || text(selection.reasoningEffort) === reasoning)
    if (!applied) this.say('warn', '默认模型写入后读回不一致，这台机器可能没有 configEditor')
    return {
      ok: true,
      defaults: this.defaultsNow(),
      applied,
      ...(applied ? {} : { note: '没有写进 profile（configEditor 未加载），重启 DSH 后可能仍用旧默认模型' }),
    }
  }

  /* ---------------- 添加 / 删除自定义配置 ---------------- */

  buildProfile(input) {
    return {
      displayName: input.displayName,
      apiKeyEnv: input.apiKeyEnv,
      api: DEFAULT_API,
      baseURL: input.baseURL,
      models: input.modelIds.map((id) => ({
        id,
        name: id,
        ...(input.contextWindow ? { contextWindow: input.contextWindow } : {}),
        ...(input.maxTokens ? { maxTokens: input.maxTokens } : {}),
      })),
    }
  }

  /** 用 configEditor 改配置；成功返回 true，配置编辑器不可用时返回 false。 */
  async editViaConfigEditor(mutate) {
    const editor = this.service('configEditor')
    if (!editor || typeof editor.edit !== 'function' || typeof editor.entries !== 'function') return false
    let entry = null
    try { entry = findPiAiEntry(editor.entries() || []) } catch { entry = null }
    if (!entry) return false
    try {
      await editor.edit(entry, (current) => {
        const next = isObject(current) ? { ...current } : {}
        const providers = isObject(next.providers) ? { ...next.providers } : {}
        mutate(providers)
        next.providers = providers
        return next
      })
      return true
    } catch (error) {
      const message = messageOf(error)
      // 「配置编辑器暂时不可用」才退回改文件；配置本身被拒（校验失败）就直接报错，
      // 否则会把一份 DSH 不认的配置写进 profile。
      if (/no longer available|changed during reload|no longer active|EACCES|EPERM|EROFS|read-only|ENOENT/i.test(message)) {
        this.say('warn', 'configEditor 不可用，退回改 profile patch：' + message)
        return false
      }
      throw coded('config_unavailable', '写入 llm-pi-ai 配置被拒绝：' + message)
    }
  }

  async addCustom(input) {
    const body = isObject(input) ? input : {}
    const route = typeof body.route === 'string' ? body.route.trim() : ''
    if (!ROUTE_RE.test(route)) throw coded('bad_route', 'route 只能是小写字母、数字、下划线或短横线，长度 2~32')
    const baseURL = typeof body.baseURL === 'string' ? body.baseURL.trim() : ''
    let parsed = null
    try { parsed = baseURL ? new URL(baseURL) : null } catch { parsed = null }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      throw coded('bad_base_url', 'baseURL 必须是 http:// 或 https:// 开头的地址')
    }
    const apiKeyEnv = typeof body.apiKeyEnv === 'string' ? body.apiKeyEnv.trim() : ''
    if (!API_KEY_ENV_RE.test(apiKeyEnv)) throw coded('bad_env', 'apiKeyEnv 只能是大写字母、数字、下划线，且以字母开头')
    const modelIds = []
    for (const raw of Array.isArray(body.modelIds) ? body.modelIds : []) {
      if (typeof raw !== 'string') continue
      const id = raw.trim()
      if (!id) continue
      if (id.length > MODEL_ID_MAX || /\s/.test(id)) {
        throw coded('bad_models', 'modelIds 里有不合法的模型 id（不能为空、不能含空白、最长 128）')
      }
      if (!modelIds.includes(id)) modelIds.push(id)
    }
    if (!modelIds.length) throw coded('bad_models', 'modelIds 至少要有一个模型 id')
    const contextWindow = positive(body.contextWindow)
    const maxTokens = positive(body.maxTokens)
    const displayName = text(body.displayName) || route

    const store = this.store()
    if (Object.prototype.hasOwnProperty.call(store.routes, route)) {
      throw coded('custom_exists', 'route "' + route + '" 已经有自定义配置了')
    }
    const routes = await this.piRoutes()
    if (routes && routes.has(route)) {
      throw coded('custom_exists', 'route "' + route + '" 已经在 llm-pi-ai 配置里了')
    }

    const profile = this.buildProfile({ displayName, baseURL, apiKeyEnv, modelIds, contextWindow, maxTokens })
    let applied = false
    let needsRestart = true
    let backend = 'profilePatch'
    let patch = null
    let backup = null

    if (await this.editViaConfigEditor((providers) => { providers[route] = profile })) {
      applied = true
      needsRestart = false
      backend = 'configEditor'
    } else {
      const file = this.patchPath()
      if (!file) throw coded('config_unavailable', '找不到 profile 的 cordis.patch.yml，没法写配置')
      backup = writeRouteToPatch(file, route, profile)
      patch = file
      this.say('warn', '自定义模型写进了 profile patch，重启 DSH 才会生效：' + file)
    }

    store.routes[route] = {
      route,
      displayName,
      baseURL,
      apiKeyEnv,
      api: DEFAULT_API,
      modelIds,
      ...(contextWindow ? { contextWindow } : {}),
      ...(maxTokens ? { maxTokens } : {}),
      backend,
      addedAt: new Date().toISOString(),
    }
    this.saveStore(store)
    this.invalidate()
    return {
      ok: true,
      route,
      applied,
      needsRestart,
      backend,
      ...(patch ? { patch } : {}),
      ...(backup ? { backup } : {}),
    }
  }

  async removeCustom(routeInput) {
    const route = typeof routeInput === 'string' ? routeInput.trim() : ''
    if (!ROUTE_RE.test(route)) throw coded('unknown_custom', '没有这个自定义模型配置')
    const store = this.store()
    const known = Object.prototype.hasOwnProperty.call(store.routes, route)
    const routes = await this.piRoutes()
    if (!known && !(routes && routes.has(route))) throw coded('unknown_custom', '没有这个自定义模型配置')

    let applied = false
    let needsRestart = true
    let backend = 'profilePatch'
    let patch = null
    let backup = null
    if (await this.editViaConfigEditor((providers) => { delete providers[route] })) {
      applied = true
      needsRestart = false
      backend = 'configEditor'
    } else {
      const file = this.patchPath()
      if (!file) throw coded('config_unavailable', '找不到 profile 的 cordis.patch.yml，没法改配置')
      backup = removeRouteFromPatch(file, route)
      patch = file
      this.say('warn', '自定义模型已从 profile patch 删除，重启 DSH 才会生效：' + file)
    }

    if (known) {
      delete store.routes[route]
      this.saveStore(store)
    }
    this.invalidate()
    // 删掉的这条路由如果正好是当前默认模型，默认模型就会指向一个已经不存在的 provider，
    // 手机端 chip 和新会话的 model 都会带上它。这里把默认模型退回第一个可用模型。
    let defaultReset = null
    const before = this.defaultsNow()
    const wasDefault = Boolean(before.model) && before.model.split('/')[0] === route
    if (wasDefault) {
      try {
        const snapshot = await this.list()
        const candidates = []
        for (const provider of (snapshot.providers || [])) {
          for (const model of (provider.models || [])) candidates.push(model)
        }
        if (candidates.length > 0) {
          await this.setDefault({ model: candidates[0].id })
          defaultReset = candidates[0].id
        }
      } catch (error) {
        this.say('warn', '默认模型回退失败：' + messageOf(error))
      }
    }
    return {
      ok: true,
      route,
      applied,
      needsRestart,
      backend,
      ...(defaultReset ? { defaultReset } : {}),
      ...(patch ? { patch } : {}),
      ...(backup ? { backup } : {}),
    }
  }
}
