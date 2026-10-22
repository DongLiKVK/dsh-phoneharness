'use strict'

/**
 * 用户主机 harness 配置（契约 docs/harness-contract.md §1）。
 *
 * 三个接口：
 *   state(signal)            → GET  /v1/harness        打点前先看现状
 *   configure(input, signal) → POST /v1/harness/config 切模式 / 工作区 / 权限 / 模型
 *   listDirs(input)          → GET  /v1/harness/dirs   只列目录
 *   createDir(input)         → POST /v1/harness/dirs   新建目录（可选）
 *
 * 两处需要说明的分工：
 *  1) 返回给手机的 message 是接口层的中文短句（契约 §1.2 要求），随请求变化；
 *     Android 界面的固定文案全部走 android/res/values/strings.xml（契约 §4，键名冻结）。
 *  2) 预设的中文名与描述是宿主预先定义、由本模块补全的元数据（桌面端逐字文案），
 *     与界面骨架文案不同源，所以放在下面的 PRESET_TEXT 表里。
 *
 * 落盘通道（写后一律读回确认，确认不到就不算 persisted）：
 *  - Agent 预设默认值：宿主 settings 服务（profile 条目 agent-preset-registry 的
 *    selectedDefault，volatile 字段），不可用时退到 configEditor.edit。
 *  - 权限默认值：同样走 settings（profile 条目 permission 的 defaultPreset，volatile 字段）。
 *  - 默认模型：复用 runtime.setDefaultModel()（models.js 已有的 saveSelection 范式）。
 *  - 工作区：宿主没有「切换当前工作区」的服务（workspaceRegistry 只有 list/get/create/
 *    resolveByPath/archive/pin，桌面端 selectWorkspace 是纯前端导航），所以工作区是本插件
 *    自己的偏好：先改本次运行，再写进本插件自己的 profile 配置条目；写不进就如实标
 *    persisted=false 并说明「重启后不保留」。
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/** 最近工作区上限，与 runtime.workspaces() 的窗口保持一致。 */
const MAX_WORKSPACES = 12
/** 单个目录名长度上限（Windows 文件系统）。 */
const MAX_NAME = 255
/** 只要出现中日韩汉字，就认为宿主已经给了中文本地化文案。 */
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

/** 内置兜底名册里「宿主没有声明这个预设」的原因文案（手机端会直接显示）。 */
const NOT_DECLARED = '这台机器没有声明这个预设，名册用的是内置兜底'

/** 本插件自己的 profile 条目，用来保存「手机偏好的工作区」。 */
const SELF_IDS = ['dsh-phoneharness']
const SELF_NAMES = ['dsh-phoneharness']

/** 宿主里可写的配置条目：包名 + 尾部 id 猜法 + volatile 字段名。 */
const TARGETS = {
  preset: {
    label: 'Agent 预设',
    ids: ['agent-preset-registry'],
    names: ['@deepseek-ai/dsh-agent-preset-registry'],
    field: 'selectedDefault',
    unavailable: '这台机器上没有可写的 Agent 预设配置（agent-preset-registry 未加载）',
  },
  permission: {
    label: '权限模式',
    ids: ['permission', 'permission-presets'],
    names: ['@deepseek-ai/dsh-permission-presets'],
    field: 'defaultPreset',
    unavailable: '这台机器上没有可写的权限默认配置（permission-presets 未加载）',
  },
}

/** 桌面端逐字文案：标题 + 描述（docs/harness-desktop-reference.md §1）。 */
const PRESET_TEXT = {
  standard: {
    title: '标准模式',
    description: '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。',
  },
  ptc: {
    title: 'PTC 模式',
    description: '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。',
  },
  minimal: {
    title: '极简模式',
    description: 'Agent 使用终端和图片读取工具，并支持上下文压缩，适合测试和对比其基础表现。',
  },
  cordis: {
    title: '创造模式',
    description: '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。',
  },
}

/** 预设 id 别名 → 上面这张表（同一模式的不同 id 写法）。 */
const PRESET_ALIASES = {
  standard: 'standard',
  default: 'standard',
  normal: 'standard',
  ptc: 'ptc',
  minimal: 'minimal',
  simple: 'minimal',
  cordis: 'cordis',
  creator: 'cordis',
  creation: 'cordis',
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function str(value) {
  return typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : '')
}

function messageOf(error) {
  if (error && typeof error.message === 'string' && error.message) return error.message
  return String(error === undefined || error === null ? 'unknown' : error)
}

function coded(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function errorCode(error) {
  return String((error && error.code) || '')
}

/** 路径比较：Windows 下大小写不敏感，尾部斜杠无关。 */
function samePath(left, right) {
  const a = str(left)
  const b = str(right)
  if (!a || !b) return false
  const cut = (value) => value.replace(/[\\/]+$/, '').toLowerCase()
  return cut(a) === cut(b)
}

/** 短名：最后一段；盘符根与 POSIX 根给回自己。 */
function basenameOf(target) {
  const value = str(target)
  if (!value) return ''
  const trimmed = value.replace(/[\\/]+$/, '')
  if (!trimmed) return value
  const parts = trimmed.split(/[\\/]+/).filter(Boolean)
  if (!parts.length) return trimmed
  const last = parts[parts.length - 1]
  // 'C:' 这种盘符根，最后一段就是 'C:'；UNC 的 share 也落在最后一段上。
  return last.length > 60 ? last.slice(0, 60) : last
}

function shorten(value, limit) {
  const text = str(value)
  if (text.length <= limit) return text
  return text.slice(0, limit - 1) + '…'
}

/** 跟随最后一段符号链接拿真实路径；失败就用原值。 */
async function realish(target) {
  try {
    return await fsp.realpath(target)
  } catch {
    return target
  }
}

/* ------------------------------------------------------------------ */
/* 主体                                                                */
/* ------------------------------------------------------------------ */

export class HarnessConfig {
  constructor(ctx, options = {}) {
    this.ctx = ctx
    this.options = options || {}
    this.runtime = this.options.runtime || null
    /** 上一次列出来的工作区，供 path 省略时同步兜底。 */
    this.lastWorkspaces = []
    this.lastCurrentWorkspace = ''
  }

  /* ---------------- 依赖 ---------------- */

  service(name) {
    try {
      return this.ctx.get(name) || null
    } catch {
      return null
    }
  }

  say(level, message) {
    const logger = this.ctx && this.ctx.logger
    if (logger && typeof logger[level] === 'function') logger[level]('dsh-phoneharness: ' + message)
  }

  readDefaults() {
    try {
      const value = this.options.readDefaults ? this.options.readDefaults() : null
      return isObject(value) ? value : {}
    } catch {
      return {}
    }
  }

  writeDefaults(patch) {
    try {
      if (typeof this.options.writeDefaults === 'function') this.options.writeDefaults(patch)
    } catch (error) {
      this.say('warn', '写入本次运行的默认值失败：' + messageOf(error))
    }
  }

  configEditor() {
    const editor = this.service('configEditor')
    if (!editor || typeof editor.edit !== 'function' || typeof editor.entries !== 'function') return null
    return editor
  }

  settingsService() {
    const settings = this.service('settings')
    if (!settings || typeof settings.update !== 'function') return null
    return settings
  }

  entriesOf(editor) {
    try {
      const rows = editor.entries()
      return Array.isArray(rows) ? rows : []
    } catch {
      return []
    }
  }

  /** 本插件自己的 profile 条目：配了 workspace 之后写回它。 */
  selfEntry() {
    const editor = this.configEditor()
    if (!editor) return null
    const rows = this.entriesOf(editor)
    for (const entry of rows) {
      const id = String((entry && entry.options && entry.options.id) || '')
      const name = String((entry && entry.options && entry.options.name) || '')
      if (SELF_IDS.includes(id) || SELF_NAMES.includes(name)) return entry
    }
    return null
  }

  /** 宿主里某个可写条目的定位结果：{ target, entry, ns }。 */
  entryFor(key) {
    const target = TARGETS[key]
    const editor = this.configEditor()
    if (!target || !editor) return null
    const rows = this.entriesOf(editor)
    for (const entry of rows) {
      const options = (entry && entry.options) || {}
      const id = String(options.id || '')
      const name = String(options.name || '')
      if (target.ids.includes(id) || target.names.includes(name)) {
        return { target, entry, ns: id }
      }
    }
    return null
  }

  canWriteModel() {
    const service = this.service('agentDefaultModel')
    return Boolean(service && typeof service.saveSelection === 'function')
  }

  capabilities() {
    return {
      writeConfig: Boolean(this.entryFor('preset') || this.entryFor('permission') || this.selfEntry() || this.settingsService() || this.canWriteModel()),
      listDirs: true,
      configEditor: Boolean(this.configEditor()),
    }
  }

  /* ---------------- 读：预设 ---------------- */

  /** 预设 id → 内置文案表的键（同一模式的不同 id 写法归一到同一个键）。 */
  aliasOf(id) {
    return PRESET_ALIASES[str(id).toLowerCase()] || null
  }

  /** 一条预设的标题 / 描述：宿主文案优先，缺失回退内置中文；标题任何情况下都不留空。 */
  localise(preset) {
    const id = str(preset && preset.id)
    const text = PRESET_TEXT[this.aliasOf(id)] || null
    const hostTitle = str(preset && (preset.title || preset.name))
    const hostDescription = str(preset && preset.description)
    const title = CJK.test(hostTitle) ? hostTitle : (text ? text.title : hostTitle)
    const description = CJK.test(hostDescription) ? hostDescription : (text ? text.description : hostDescription)
    return { id, title: title || id, description, builtin: Boolean(text) }
  }

  /** broken 字段字符串化：宿主给什么就透传什么（非空 = 这个预设加载失败）。 */
  brokenReason(preset) {
    const raw = preset ? preset.broken : undefined
    if (raw === undefined || raw === null || raw === false || raw === '') return ''
    return typeof raw === 'string' ? raw : messageOf(raw)
  }

  /**
   * 宿主名册取数：按正式程度依次尝试，任一成功就定下来（都不行由 presetRows 回内置四条）。
   *  S1 agentPresets.remoteExportList()   宿主「传入的预选模式列表」正式形态，每条带 isDefault
   *  S2 agentPresets.compositionInventory() 同一服务里另一条带 isDefault 的名册通道
   *  S3 agentPresets.list()               基础名册（含加载失败的），current 由 defaultId 决定
   *  S4 runtime.catalog().agentPresets     插件已有的 catalog 通道
   */
  async hostPresetRoster(signal) {
    const service = this.service('agentPresets')
    const tried = []
    let rows = []
    let source = ''
    let hostDefault = ''

    const take = (value, label) => {
      const list = Array.isArray(value) ? value : (isObject(value) && Array.isArray(value.presets) ? value.presets : null)
      if (!list) { tried.push(label + '：返回的不是名册') ; return false }
      const keep = list.filter((one) => isObject(one) && str(one.id))
      if (!keep.length) { tried.push(label + '：名册是空的'); return false }
      rows = keep
      source = label
      const marked = list.find((one) => isObject(one) && one.isDefault === true)
      if (marked) hostDefault = str(marked.id)
      return true
    }

    if (service) {
      if (typeof service.remoteExportList === 'function') {
        try { take(await service.remoteExportList(), 'agentPresets.remoteExportList()') } catch (error) { tried.push('agentPresets.remoteExportList()：' + messageOf(error)) }
      } else {
        tried.push('agentPresets.remoteExportList()：这台机器没这个方法')
      }

      if (!rows.length && typeof service.compositionInventory === 'function') {
        try { take(await service.compositionInventory(), 'agentPresets.compositionInventory()') } catch (error) { tried.push('agentPresets.compositionInventory()：' + messageOf(error)) }
      }

      if (!rows.length && typeof service.list === 'function') {
        try { take(await service.list(), 'agentPresets.list()') } catch (error) { tried.push('agentPresets.list()：' + messageOf(error)) }
      }

      if (!hostDefault) {
        try { const value = service.defaultId; if (typeof value === 'string') hostDefault = value } catch { /* 读不到就算了 */ }
      }
    } else {
      tried.push('agentPresets：这台机器没有这个服务')
    }

    if (!rows.length) {
      const catalog = await this.catalogSafe(signal)
      const listed = Array.isArray(catalog.agentPresets) ? catalog.agentPresets : []
      if (listed.length) take(listed, 'runtime.catalog().agentPresets')
    }

    return { rows, source, hostDefault, tried, fallback: !service }
  }

  /** 名册来源给手机的一句话说明（只在走了兜底通道时才写）。 */
  rosterNote(roster) {
    if (roster.source === 'agentPresets.remoteExportList()') return ''
    const why = roster.tried.length ? roster.tried.join('；') : '宿主没给出名册'
    if (!roster.rows.length) return '这台机器没给 Agent 预设名册（' + why + '），手机端用内置四条兜底'
    return 'Agent 预设名册走的兜底通道 ' + roster.source + '（' + why + '）'
  }

  /** 完整预设名册（含加载失败的），并标出「新任务默认用哪个」；任何来源失败都不返回空名册。 */
  async presetRows(signal) {
    const roster = await this.hostPresetRoster(signal)
    const service = this.service('agentPresets')
    let hostDefault = roster.hostDefault
    if (!hostDefault && service) {
      try { const value = service.defaultId; if (typeof value === 'string') hostDefault = value } catch { /* 读不到就算了 */ }
    }

    const rows = []
    const seen = new Set()
    const push = (preset, fromHost) => {
      const localised = this.localise(preset)
      if (!localised.id) return
      // 别名（default→standard 之类）算同一个模式，避免和内置四条重复。
      const key = this.aliasOf(localised.id) || localised.id.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      const broken = this.brokenReason(preset)
      const reason = broken || (fromHost ? '' : NOT_DECLARED)
      rows.push({
        id: localised.id,
        title: localised.title,
        description: localised.description,
        current: false,
        usable: fromHost ? !broken : false,
        builtin: localised.builtin,
        ...(reason ? { reason } : {}),
      })
    }

    for (const preset of roster.rows) push(preset, true)
    // 宿主一条都没声明时手机也得看见完整名册：四条内置预设永远在场（usable 按实际判定）。
    for (const id of Object.keys(PRESET_TEXT)) if (!seen.has(id)) push({ id }, false)

    const configured = str(this.readDefaults().agentPreset)
    const effective = configured || hostDefault || (rows[0] ? rows[0].id : '')
    for (const row of rows) row.current = row.id === effective
    // 配置里钉了一个宿主没声明的模式：也让它显示出来（和 workspaces 的处理一致），保证有且只有一个 current。
    if (effective && !rows.some((row) => row.current)) {
      const lonely = this.localise({ id: effective })
      rows.unshift({
        id: effective,
        title: lonely.title,
        description: lonely.description,
        current: true,
        usable: false,
        builtin: lonely.builtin,
        reason: NOT_DECLARED,
      })
    }

    return { rows, effective, hostDefault, configured, note: this.rosterNote(roster) }
  }

  /* ---------------- 读：工作区 ---------------- */

  /** 复用 runtime.workspaces()，短名 + current 标记。 */
  async workspaceRows(signal) {
    let raw = []
    if (this.runtime && typeof this.runtime.workspaces === 'function') {
      try {
        const rows = await this.runtime.workspaces(signal)
        raw = Array.isArray(rows) ? rows : []
      } catch (error) {
        this.say('warn', '工作区列表读取失败：' + messageOf(error))
      }
    }

    const configured = str(this.readDefaults().workspace)
    let current = ''
    if (configured) {
      const hit = raw.find((row) => isObject(row) && samePath(row.cwd, configured))
      current = hit ? str(hit.cwd) : configured
    }
    if (!current && raw.length) current = str(raw[0].cwd)

    const rows = []
    const seen = new Set()
    const push = (cwd, title) => {
      const value = str(cwd)
      if (!value) return
      const key = value.replace(/[\\/]+$/, '').toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      const label = str(title)
      const short = label && !/[\\/]/.test(label) ? label : basenameOf(value)
      rows.push({ cwd: value, title: shorten(short || value, 60), current: false })
    }
    push(current, basenameOf(current))
    for (const row of raw) {
      if (!isObject(row)) continue
      push(row.cwd, row.title)
      if (rows.length >= MAX_WORKSPACES) break
    }
    for (const row of rows) row.current = samePath(row.cwd, current)
    if (current && !rows.some((row) => row.current)) rows.unshift({ cwd: current, title: shorten(basenameOf(current) || current, 60), current: true })

    this.lastWorkspaces = rows.slice(0, MAX_WORKSPACES)
    this.lastCurrentWorkspace = current
    return this.lastWorkspaces
  }

  /** path 省略时用的「当前工作区」：插件配置 → 上次列表 → 进程目录。 */
  currentWorkspaceDir() {
    return str(this.readDefaults().workspace) || this.lastCurrentWorkspace || process.cwd()
  }

  /* ---------------- 读：catalog（模型 / 权限 / 默认值） ---------------- */

  async catalogSafe(signal) {
    const empty = { models: [], permissions: [], agentPresets: [], defaults: {}, failures: [] }
    if (!this.runtime || typeof this.runtime.catalog !== 'function') return empty
    try {
      const result = await this.runtime.catalog(signal)
      return isObject(result) ? result : empty
    } catch (error) {
      this.say('warn', 'catalog 读取失败：' + messageOf(error))
      return empty
    }
  }

  /* ---------------- 读：GET /v1/harness ---------------- */

  async state(signal) {
    const catalog = await this.catalogSafe(signal)
    const models = Array.isArray(catalog.models) ? catalog.models : []
    const permissions = Array.isArray(catalog.permissions) ? catalog.permissions : []
    const presetInfo = await this.presetRows(signal)
    const workspaces = await this.workspaceRows(signal)
    const config = this.readDefaults()
    const catalogDefaults = isObject(catalog.defaults) ? catalog.defaults : {}
    const currentWorkspace = (workspaces.find((row) => row.current) || {}).cwd || null

    const defaults = {
      model: str(config.model) || str(catalogDefaults.model) || (models[0] ? str(models[0].id) : null),
      permission: str(config.permission) || str(catalogDefaults.permission) || (permissions.length ? str(permissions[permissions.length - 1].id) : null),
      agentPreset: presetInfo.effective || str(catalogDefaults.agentPreset) || (presetInfo.rows[0] ? presetInfo.rows[0].id : null),
    }

    const failures = []
    for (const one of Array.isArray(catalog.failures) ? catalog.failures : []) {
      if (isObject(one)) failures.push({ area: str(one.provider) || 'catalog', message: str(one.message) })
    }
    if (presetInfo.note) failures.push({ area: 'agentPreset', message: presetInfo.note })
    if (!this.configEditor()) failures.push({ area: 'configEditor', message: '这台机器读不到 configEditor，配置改不动' })
    if (!this.settingsService()) failures.push({ area: 'settings', message: '这台机器读不到 settings 服务，预设 / 权限默认值只能走 configEditor' })
    if (!this.canWriteModel()) failures.push({ area: 'model', message: '这台机器读不到 agentDefaultModel 服务，默认模型只能读不能改' })

    // 工作区是插件自己的偏好：没有可写条目时提前说明，别让手机白点。
    if (!this.selfEntry()) failures.push({ area: 'workspace', message: '这台机器上的插件条目不可写，工作区只在本次运行内生效' })

    return {
      presets: presetInfo.rows,
      workspaces,
      defaults,
      capabilities: this.capabilities(),
      failures,
      ...(currentWorkspace ? { workspace: currentWorkspace } : {}),
    }
  }

  /* ---------------- 写：落盘 + 读回 ---------------- */

  /** 从 configEditor 持久化层读回某个字段（override 优先，其次 inherited）。 */
  persistedValue(entry, field) {
    const editor = this.configEditor()
    if (!editor || typeof editor.configuration !== 'function') return undefined
    try {
      const rows = editor.configuration()
      if (!Array.isArray(rows)) return undefined
      const row = rows.find((one) => one && one.entry === entry)
      if (!row) return undefined
      const override = isObject(row.override) ? row.override : {}
      const inherited = isObject(row.inherited) ? row.inherited : {}
      const config = Object.keys(override).length ? override : inherited
      return config[field]
    } catch {
      return undefined
    }
  }

  /**
   * 把一个字段写进宿主配置条目：先试 settings 服务的 volatile 写入（不重启插件），
   * 不行再用 configEditor.edit。两种都写不了就抛 config_unavailable。
   */
  async writeField(found, value) {
    const settings = this.settingsService()
    if (settings && found.ns && typeof settings.describe === 'function') {
      try {
        const descriptor = (settings.describe() || []).find((one) => one && one.ns === found.ns)
        await settings.update(found.ns, { [found.target.field]: value }, descriptor ? descriptor.revision : undefined)
        const after = (settings.describe() || []).find((one) => one && one.ns === found.ns)
        if (after && isObject(after.value) && str(after.value[found.target.field]) === value) {
          return { persisted: true, via: 'settings' }
        }
      } catch (error) {
        this.say('warn', 'settings 写入 ' + found.ns + ' 失败，改用 configEditor：' + messageOf(error))
      }
    }

    const editor = this.configEditor()
    if (!editor) throw coded('config_unavailable', found.target.unavailable)
    await editor.edit(found.entry, (raw) => ({
      ...(isObject(raw) ? raw : {}),
      [found.target.field]: value,
    }))
    const check = this.persistedValue(found.entry, found.target.field)
    if (str(check) !== value) {
      throw coded('config_unavailable', '写进 profile 之后读回不是新值，这次切换没有落盘：' + found.ns)
    }
    return { persisted: true, via: 'configEditor' }
  }

  /** 工作区目录校验：绝对化 → 存在 → 是目录 → 可写。 */
  async resolveWorkspace(raw) {
    const value = str(raw)
    if (!value) throw coded('bad_workspace', '工作区路径不能为空')
    const candidate = path.isAbsolute(value) ? value : path.resolve(this.currentWorkspaceDir(), value)
    let info = null
    try {
      info = await fsp.stat(candidate)
    } catch {
      throw coded('bad_workspace', '这个工作区在本机不存在：' + candidate)
    }
    if (!info.isDirectory()) throw coded('bad_workspace', '这个工作区不是目录：' + candidate)
    try {
      await fsp.access(candidate, fs.constants.W_OK)
    } catch {
      throw coded('bad_workspace', '这个工作区不能写：' + candidate)
    }
    return realish(candidate)
  }

  /* ---------------- 写：POST /v1/harness/config ---------------- */

  async configure(input, signal) {
    const body = isObject(input) ? input : {}
    const known = ['agentPreset', 'workspace', 'permission', 'model']
    const unknown = Object.keys(body).filter((key) => !known.includes(key))
    if (unknown.length) throw coded('bad_request', '不认识这些字段：' + unknown.join('、'))
    const present = known.filter((key) => str(body[key]) !== '')
    if (!present.length) throw coded('bad_request', '至少要给一项：agentPreset、workspace、permission、model')

    const catalog = await this.catalogSafe(signal)
    const applied = {}
    const parts = []
    let persisted = true
    let runtimeOnly = false

    if (present.includes('agentPreset')) {
      const wanted = str(body.agentPreset)
      const info = await this.presetRows(signal)
      const row = info.rows.find((one) => one.id === wanted)
      if (!row) throw coded('unknown_preset', '这台机器上没有「' + wanted + '」这个模式')
      if (!row.usable) throw coded('unknown_preset', '「' + row.title + '」用不了，换一个可用模式：' + (row.reason || '未知原因'))
      const found = this.entryFor('preset')
      if (!found) throw coded('config_unavailable', TARGETS.preset.unavailable)
      const result = await this.writeField(found, wanted)
      applied.agentPreset = wanted
      persisted = persisted && result.persisted
      // 本次运行也立刻按新值走（插件配置里如果钉过旧值，不镜像就会出现「刚切完还显示旧模式」）。
      this.writeDefaults({ agentPreset: wanted })
      parts.push('已切换为 ' + row.title)
    }

    if (present.includes('workspace')) {
      const resolved = await this.resolveWorkspace(body.workspace)
      const editor = this.configEditor()
      const entry = this.selfEntry()
      let landed = false
      if (editor && entry) {
        try {
          await editor.edit(entry, (raw) => ({ ...(isObject(raw) ? raw : {}), workspace: resolved }))
          landed = str(this.persistedValue(entry, 'workspace')) && samePath(this.persistedValue(entry, 'workspace'), resolved)
        } catch (error) {
          this.say('warn', '工作区写进 profile 失败：' + messageOf(error))
          throw coded('config_unavailable', '写工作区配置被拒绝：' + messageOf(error))
        }
      }
      this.writeDefaults({ workspace: resolved })
      applied.workspace = resolved
      persisted = persisted && Boolean(landed)
      if (!landed) runtimeOnly = true
      parts.push('工作区已切换为 ' + (basenameOf(resolved) || resolved))
    }

    if (present.includes('permission')) {
      const wanted = str(body.permission)
      const permissions = Array.isArray(catalog.permissions) ? catalog.permissions : []
      const row = permissions.find((one) => isObject(one) && str(one.id) === wanted)
      if (!row) throw coded('unknown_permission', '这台机器上没有「' + wanted + '」这个权限模式')
      const found = this.entryFor('permission')
      if (!found) throw coded('config_unavailable', TARGETS.permission.unavailable)
      const result = await this.writeField(found, wanted)
      applied.permission = wanted
      persisted = persisted && result.persisted
      this.writeDefaults({ permission: wanted })
      parts.push('已切换为 ' + (str(row.name) || wanted))
    }

    if (present.includes('model')) {
      const wanted = str(body.model)
      const models = Array.isArray(catalog.models) ? catalog.models : []
      if (models.length && !models.some((one) => isObject(one) && str(one.id) === wanted)) {
        throw coded('unknown_model', '这台机器上没有「' + wanted + '」这个模型')
      }
      if (!this.runtime || typeof this.runtime.setDefaultModel !== 'function') {
        throw coded('config_unavailable', '这台机器上不能写默认模型（runtime 没挂上）')
      }
      const result = await this.runtime.setDefaultModel({ model: wanted })
      applied.model = wanted
      this.writeDefaults({ model: wanted })
      persisted = persisted && !(isObject(result) && result.applied === false)
      parts.push('已切换为 ' + wanted)
    }

    if (!parts.length) throw coded('bad_request', '没有可应用的改动')
    const message = parts.join('；') + (runtimeOnly ? '（已生效（本次运行））' : '')
    return {
      ok: true,
      applied,
      message,
      persisted,
      harness: await this.state(signal),
    }
  }

  /* ---------------- 目录 ---------------- */

  /** 把 path/stat 的错误翻成契约错误码（bad_path / not_found / forbidden）。 */
  mapPathError(error, target) {
    const code = errorCode(error)
    if (code === 'EACCES' || code === 'EPERM') return coded('forbidden', '这个目录没有权限看：' + target)
    if (code === 'ENOENT' || code === 'ENOTDIR') return coded('not_found', '这个目录不存在：' + target)
    return coded('bad_path', '这个路径用不了：' + target)
  }

  /** 定位要列的目录：省略 → 当前工作区；相对路径 → 相对当前工作区。 */
  async targetDir(raw) {
    const value = str(raw)
    if (/^\u0000/.test(value)) throw coded('bad_path', '路径里有非法字符')
    const base = value ? (path.isAbsolute(value) ? value : path.resolve(this.currentWorkspaceDir(), value)) : this.currentWorkspaceDir()
    let info = null
    try {
      info = await fsp.stat(base)
    } catch (error) {
      throw this.mapPathError(error, base)
    }
    if (!info.isDirectory()) throw coded('bad_path', '这不是目录：' + base)
    return realish(base)
  }

  /** Windows 上可用的盘符根；其他平台给 POSIX 根。 */
  async rootsFor(cwd) {
    if (process.platform !== 'win32') return [{ name: '/', path: '/' }]
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const probes = await Promise.all(letters.map(async (letter) => {
      const root = letter + ':\\'
      try {
        const info = await fsp.stat(root)
        return info.isDirectory() ? { name: letter + ':', path: root } : null
      } catch {
        return null
      }
    }))
    const rows = probes.filter(Boolean)
    const drive = path.parse(cwd).root
    if (drive && !/^\\\\/.test(drive) && !rows.some((row) => samePath(row.path, drive))) {
      rows.unshift({ name: drive.replace(/[\\/]+$/, ''), path: drive })
    }
    return rows
  }

  async listDirs(input) {
    const body = isObject(input) ? input : {}
    const flag = body.showHidden
    const showHidden = flag === true || flag === '1' || flag === 1 || flag === 'true'
    const cwd = await this.targetDir(body.path)

    let dirents = []
    try {
      dirents = await fsp.readdir(cwd, { withFileTypes: true })
    } catch (error) {
      throw this.mapPathError(error, cwd)
    }

    const entries = []
    for (const dirent of dirents) {
      const name = typeof dirent.name === 'string' ? dirent.name : String(dirent.name || '')
      if (!name) continue
      // 符号链接一律不跟：目录树里指到别处的链接不在这里展开，避免顺着链接逃出用户以为的范围。
      if (typeof dirent.isSymbolicLink === 'function' && dirent.isSymbolicLink()) continue
      if (typeof dirent.isDirectory === 'function' && !dirent.isDirectory()) continue
      const hidden = name.startsWith('.')
      if (hidden && !showHidden) continue
      entries.push({ name: name.length > 60 ? name : name, path: path.join(cwd, name), dir: true, hidden })
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh'))

    const root = path.parse(cwd).root
    const parent = root && samePath(cwd, root) ? null : path.dirname(cwd)
    return {
      cwd,
      parent,
      roots: await this.rootsFor(cwd),
      entries,
      showHidden,
    }
  }

  async createDir(input) {
    const body = isObject(input) ? input : {}
    const name = str(body.name)
    if (!name) throw coded('bad_name', '目录名不能为空')
    if (name.length > MAX_NAME) throw coded('bad_name', '目录名太长了')
    if (name === '.' || name === '..' || /[\\/]/.test(name)) throw coded('bad_name', '目录名里不能有斜杠、. 或 ..')
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(name)) throw coded('bad_name', '目录名里有控制字符')
    if (process.platform === 'win32' && /[<>:"|?*]/.test(name)) throw coded('bad_name', '这个目录名里有 Windows 不接受的字符')

    const parent = await this.targetDir(body.parent)
    const target = path.join(parent, name)
    let exists = false
    try {
      await fsp.stat(target)
      exists = true
    } catch {
      exists = false
    }
    if (exists) throw coded('exists', '已经有同名目录了：' + name)
    try {
      await fsp.mkdir(target)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EEXIST') throw coded('exists', '已经有同名目录了：' + name)
      if (code === 'EACCES' || code === 'EPERM') throw coded('forbidden', '这个目录不让建：' + parent)
      throw this.mapPathError(error, target)
    }
    return { path: target }
  }
}

export { PRESET_TEXT, TARGETS, basenameOf, samePath }
export default HarnessConfig
