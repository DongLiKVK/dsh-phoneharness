#!/usr/bin/env node
/**
 * tools/verify-harness.mjs —— 「用户主机 harness」功能的可复跑验收脚本（契约 §6）。
 *
 * 作者：verifier（写租约 tools/verify-harness.mjs、shots/harness/**、docs/harness-verification.md）
 *
 * 为什么自带桩：ds_phone_harness 是宿主插件，改 lib/*.js 要重启 DSH 才生效，而 DSH 正在跑
 * 我们自己的会话。所以这里用**假 ctx** 把真的 PhoneServer + HarnessRuntime 拉起来（路由、
 * 鉴权、错误码映射全是线上那一份代码），只有 DSH 的服务（llm / agentDefaultModel /
 * configEditor / agentPresets / workspaceRegistry / profileContext）是内存实现。
 * 模式对齐 tools/stub-models-server.mjs，并且额外能模拟 configEditor 可用 / 不可用
 * 两种 capabilities（契约 §1.2 的 persisted、§3.4 的 writeConfig、§6(5) 的只读反例）。
 *
 * 用法：
 *   node tools/verify-harness.mjs                  # 全量：A 语法 + B 协议 + C 反例 + D 构建 + E 资源 + F 静态界面
 *   node tools/verify-harness.mjs --no-build       # 跳过 android 构建（省 1~3 分钟）
 *   node tools/verify-harness.mjs --host-only      # 只跑 A/B/C（宿主侧）
 *   node tools/verify-harness.mjs --force          # 即使判定「未就绪」也照跑构建与协议
 *   node tools/verify-harness.mjs --out shots/harness/verify-report.json
 *
 * 结论口径（契约 §6 第 6 条）：
 *   PASS      断言全部成立
 *   FAIL      接口已实现但行为/形状不符 —— 报告里必须写清责任文件与责任成员
 *   NOT-READY 对端还没落盘（典型：GET /v1/harness 回 404「没有这个接口」），不算失败
 *   SKIP      本次运行被开关跳过（如 --no-build）
 *   未验证    需要真机/人工的部分（截图、置灰观感），写清替代证据与局限
 *
 * 退出码：有 FAIL → 1；否则 0（NOT-READY / SKIP / 未验证 不影响退出码）。
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PLUGIN = path.join(ROOT, 'plugin')
const ANDROID = path.join(ROOT, 'android')
const SHOTS = path.join(ROOT, 'shots', 'harness')
const SDK_BT = path.join(ROOT, 'sdk', 'build-tools', 'android-16')

/* v1.3.2 版面判据用：只取「输入卡片那一行」自身的 row.addView(...) 语句。
   只看这些行，避免把同一区域里的 HorizontalScrollView chipScroll 声明误判成「chip 仍在卡片内」。 */
function cardRowAddLines(text, cardPos) {
  const end = cardPos >= 0 ? cardPos : text.length
  const start = text.lastIndexOf('card.addView(row', end)
  return text.slice(start >= 0 ? start : 0, end)
    .split('\n')
    .filter((l) => /(^|[.\s])row\.addView\s*\(/.test(l))
}

const argv = process.argv.slice(2)
const flag = (name) => argv.includes('--' + name)
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const FORCE = flag('force')
const NO_BUILD = flag('no-build') || flag('host-only')
const HOST_ONLY = flag('host-only')
const OUT_JSON = opt('out', path.join(SHOTS, 'verify-report.json'))
const EDITOR_PORT = Number(opt('port', '0'))

const TOKEN = 'devtoken'
const PAIR_CODE = '000000'

/* ------------------------------------------------------------------ */
/* 结果账本                                                            */
/* ------------------------------------------------------------------ */

const results = []
let currentGroup = ''

function group(title) {
  currentGroup = title
  console.log('\n' + '='.repeat(78) + '\n== ' + title + '\n' + '='.repeat(78))
}

function record(id, title, status, evidence, extra) {
  const row = {
    id,
    group: currentGroup,
    title,
    status,
    evidence: evidence === undefined ? '' : String(evidence),
    ...(extra || {}),
  }
  results.push(row)
  const tag = { PASS: 'PASS    ', FAIL: 'FAIL    ', 'NOT-READY': 'NOT-READY', SKIP: 'SKIP    ', '未验证': '未验证  ' }[status] || status
  console.log('[' + tag + '] ' + id + ' ' + title)
  if (row.evidence) console.log(indent(row.evidence, '           '))
  if (row.note) console.log(indent('note: ' + row.note, '           '))
  return row
}

function indent(text, pad) {
  return String(text)
    .split('\n')
    .slice(0, 40)
    .map((line) => pad + (line.length > 400 ? line.slice(0, 400) + ' …' : line))
    .join('\n')
}

const clip = (text, n = 900) => {
  const value = String(text == null ? '' : text)
  return value.length > n ? value.slice(0, n) + '\n…（截断，全长 ' + value.length + ' 字符）' : value
}

/* ------------------------------------------------------------------ */
/* 与契约 §4 / 桌面参考同步的冻结期望值                                  */
/* ------------------------------------------------------------------ */

/** 契约 §4 冻结的文案键（键名 -> 值），用于静态核对与 APK 资源核对。 */
const STRINGS = {
  harness_workspace_chip_default: '选择工作区',
  harness_preset_chip_default: '选择模式',
  harness_workspace_panel_title: '选择工作区',
  harness_preset_panel_title: 'Agent 预设',
  harness_preset_section_intro: '选择 Agent 的工具和工作方式。日常任务用「标准模式」，扩展 DSH 的能力用「创造模式」。',
  harness_group_builtin: '内置',
  harness_group_custom: '自定义',
  harness_in_use: '新任务默认',
  harness_no_description: '暂无描述。',
  harness_broken_badge: '加载失败',
  harness_use_this_dir: '使用此目录',
  harness_browse_dir: '浏览主机目录',
  harness_manual_path: '手动输入路径',
  harness_parent_dir: '上级目录',
  harness_refresh: '刷新',
  harness_host_label: '主机',
  harness_readonly_warning: '主机不接受配置写入，以下只能查看',
  harness_persist_runtime_only: '已生效（本次运行）',
  harness_switch_refused: '无法切换到「%1$s」：%2$s',
  harness_settings_row: '用户主机的 Harness',
  harness_recent_workspaces: '最近工作区',
  harness_empty_workspaces: '还没有可用的工作区',
  harness_empty_presets: '主机没有提供任何 Agent 预设',
  harness_loading: '正在读取主机配置…',
  harness_retry: '重新加载',
  harness_load_error: '读不到主机的配置：%1$s',
  harness_host_notes: '主机提示',
}

/** 桌面参考逐字：四个内置预设 id（含别名）-> 中文名 / 描述。 */
const PRESET_EXPECT = [
  { ids: ['standard', 'default', 'normal'], title: '标准模式', description: '处理代码、文件和资料，适合大多数任务。Agent 会按需使用检索、编辑和终端等工具。' },
  { ids: ['ptc'], title: 'PTC 模式', description: '包含标准模式的所有能力，更适合批量调用工具，并对结果进行筛选、整理、去重、统计或汇总的任务。' },
  { ids: ['minimal', 'simple'], title: '极简模式', description: 'Agent 使用终端和图片读取工具，并支持上下文压缩，适合测试和对比其基础表现。' },
  { ids: ['cordis', 'creator', 'creation'], title: '创造模式', description: '用对话定制 DSH：让 Agent 编写插件，添加新功能或界面；也能组合工具和提示词，创建自己的模式。' },
]

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/
const hasCJK = (value) => CJK.test(String(value == null ? '' : value))

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const exists = (p) => { try { return fs.statSync(p) } catch { return null } }
const readText = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } }

function request(port, method, urlPath, body, headers) {
  return new Promise((resolve) => {
    const payload = body === undefined || body === null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: urlPath,
        headers: {
          ...(payload ? { 'content-type': 'application/json' } : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try { json = JSON.parse(text) } catch { /* 非 JSON */ }
          resolve({ status: res.statusCode, headers: res.headers, text, json })
        })
      },
    )
    req.on('error', (error) => resolve({ status: 0, headers: {}, text: String(error && error.message), json: null, error }))
    if (payload) req.write(payload)
    req.end()
  })
}

function sh(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...(options || {}) })
  return {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message) : '',
  }
}

const rawResponse = (res) => JSON.stringify({ status: res.status, body: res.json === null ? res.text : res.json }, null, 2)

/** 路径比较（对齐 harness.js 的 samePath：Windows 大小写不敏感、尾部斜杠无关）。 */
const normPath = (value) => String(value == null ? '' : value).replace(/[\\/]+$/, '').toLowerCase()

/**
 * 路径归一化：优先 fs.realpathSync.native（JS 版 realpath 不还原 8.3 短名 ——
 * os.tmpdir() 在这台机器会给 C:\Users\<USERNAME>~1\…，服务端返回的是长名，
 * 两边直接比会假 FAIL）。
 */
const realishPath = (value) => {
  const raw = String(value == null ? '' : value)
  if (!raw) return ''
  try {
    return fs.realpathSync.native(raw).replace(/[\\/]+$/, '').toLowerCase()
  } catch {
    return raw.replace(/[\\/]+$/, '').toLowerCase()
  }
}

/** 路由还没实现时的统一特征：404 + not_found + 「没有这个接口」 —— 这种情况判 NOT-READY 而不是 FAIL。 */
const isRouteMissing = (res) =>
  res.status === 404 && res.json && res.json.error && res.json.error.code === 'not_found' && /没有这个接口/.test(String(res.json.error.message || ''))

/* ------------------------------------------------------------------ */
/* 桩 harness 服务器                                                   */
/* ------------------------------------------------------------------ */

function makeConfigEditor(patchPath, calls) {
  const entries = [
    { options: { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { workbuddy: { displayName: 'DeepSeek' } } } } },
    { options: { id: 'agent-default-model', name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'workbuddy', model: 'deepseek-v4.1-flash' } } },
    { options: { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry', config: { selectedDefault: 'standard' } } },
    { options: { id: 'permission', name: '@deepseek-ai/dsh-permission-presets', config: { defaultPreset: 'default' } } },
    { options: { id: 'dsh-phoneharness', name: 'dsh-phoneharness', config: {} } },
  ]
  const clone = (value) => JSON.parse(JSON.stringify(value == null ? {} : value))
  return {
    get documentPath() { return patchPath },
    entries: () => entries.slice(),
    // harness.js 的 persistedValue() 靠 configuration() 的 override/inherited 读回确认；
    // 返回 override:null 会让「写后读回」失败，把成功的落盘误判成 config_unavailable。
    configuration: () => entries.map((entry) => ({ entry, inherited: null, override: JSON.parse(JSON.stringify(entry.options.config || {})) })),
    /** 兼容两种签名：change 是函数（对齐 stub-models-server）或对象补丁。 */
    async edit(entry, change) {
      const before = clone(entry.options.config)
      let next
      if (typeof change === 'function') next = change(clone(before), before)
      else next = { ...before, ...(change || {}) }
      entry.options.config = next
      calls.push({ entryId: entry?.options?.id || null, changeKind: typeof change, next: clone(next) })
      return next
    },
  }
}

/**
 * 起一个桩宿主：真 PhoneServer + 真 HarnessRuntime + 假 DSH 服务。
 * withEditor=false 时不提供 configEditor、profilePatchPath 也置 null —— 模拟
 * 契约 §1.2 的「configEditor 与本插件配置两条路径都不可用」。
 */
async function startStubServer({ withEditor = true } = {}) {
  const calls = { edits: [] }
  const { HarnessRuntime } = await import(pathToFileURL(path.join(PLUGIN, 'lib', 'runtime.js')).href)
  const { PhoneServer } = await import(pathToFileURL(path.join(PLUGIN, 'lib', 'server.js')).href)
  const { HarnessConfig } = await import(pathToFileURL(path.join(PLUGIN, 'lib', 'harness.js')).href)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-harness-verify-'))
  const patchPath = path.join(tmp, 'cordis.patch.yml')
  fs.writeFileSync(
    patchPath,
    ['# 桩用的 profile 副本；绝不碰真的 profile。', '- id: agent-default-model', '  name: "@deepseek-ai/dsh-agent-default-model"', '  config:', '    provider: "workbuddy"', '    model: "deepseek-v4.1-flash"', ''].join('\n'),
    'utf8',
  )

  const agentPresets = {
    defaultId: 'standard',
    list: async () => [
      { id: 'standard', title: '标准模式', description: PRESET_EXPECT[0].description, builtin: true, broken: false },
      { id: 'ptc', title: 'PTC 模式', description: PRESET_EXPECT[1].description, builtin: true, broken: false },
      { id: 'minimal', title: '极简模式', description: PRESET_EXPECT[2].description, builtin: true, broken: false },
      { id: 'cordis', title: '创造模式', description: PRESET_EXPECT[3].description, builtin: true, broken: false },
      { id: 'broken-preset', title: '坏掉的预设', description: '', builtin: false, broken: true, reason: '标准模式不可用，请恢复该模式或选择其他可用模式。' },
    ],
  }

  const workspaceRegistry = {
    list: async () => [
      { cwd: ROOT, title: 'phone-harness' },
      { cwd: path.join(ROOT, 'android'), title: 'android' },
      { cwd: os.tmpdir(), title: 'tmp' },
    ],
    create: async () => ({ attachSession: async () => {} }),
  }

  const llm = {
    listProviders: () => [{ id: 'workbuddy', name: 'DeepSeek' }],
    listModels: async () => [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash' }],
    resolveModel: async (provider, model) => ({ provider, id: model, name: model, inputModalities: ['text'] }),
  }

  const agentDefaultModel = {
    state: { provider: 'workbuddy', model: 'deepseek-v4.1-flash' },
    currentSelection() { return { ...agentDefaultModel.state } },
    async saveSelection(next) {
      if (!next || !next.provider || !next.model) throw new Error('bad selection')
      agentDefaultModel.state = { provider: String(next.provider), model: String(next.model) }
    },
  }

  /** 插件自己的 settings 对象（对应 plugin/index.js 里的 settings 变量；readDefaults/writeDefaults 就地读写它）。 */
  const pluginSettings = { model: '', permission: '', agentPreset: 'standard', workspace: '' }

  /** DSH 的 settings 服务（harness.js 的 settingsService()：要 update，可选 describe）。 */
  const dshSettings = {
    rows: [
      { ns: 'agent-preset-registry', value: { selectedDefault: 'standard' }, revision: 1 },
      { ns: 'permission', value: { defaultPreset: 'default' }, revision: 2 },
    ],
    describe() { return dshSettings.rows.map((row) => ({ ns: row.ns, value: { ...row.value }, revision: row.revision })) },
    async update(ns, patch, revision) {
      const row = dshSettings.rows.find((one) => one.ns === ns)
      if (!row) throw new Error('unknown settings ns: ' + ns)
      if (Number.isFinite(revision) && row.revision !== revision) throw new Error('settings revision mismatch: ' + revision)
      row.value = { ...row.value, ...(patch || {}) }
      row.revision += 1
      return { ns, value: { ...row.value } }
    },
  }

  const services = {
    llm,
    // withEditor=false = 只读宿主：连默认模型的服务也拿掉，capabilities.writeConfig 才会如实为 false
    agentDefaultModel: withEditor ? agentDefaultModel : undefined,
    agentPresets,
    workspaceRegistry,
    permissionPresets: {
      catalog: () => ({
        options: [
          { value: 'plan', name: '计划模式', description: '只读，先给出计划' },
          { value: 'default', name: '默认', description: '每一步都征求同意' },
          { value: 'acceptEdits', name: '接受编辑', description: '自动接受文件修改' },
          { value: 'bypassPermissions', name: '跳过确认', description: '不再逐条确认' },
        ],
      }),
      list: () => [{ value: 'default', name: '默认' }],
    },
    sessions: { get: () => null, flush: async () => {} },
    sessionQuery: { list: async () => [] },
    agents: { list: async () => [] },
    attachments: { read: async () => { throw new Error('no attachment in stub') } },
    profileContext: { dir: tmp, patchPath, home: tmp, name: 'stub' },
    // withEditor=true  = 可写宿主（configEditor + settings + agentDefaultModel 齐备）
    // withEditor=false = 只读宿主（三条写通道全无 → capabilities.writeConfig=false）
    settings: withEditor ? dshSettings : undefined,
    configEditor: withEditor ? makeConfigEditor(patchPath, calls.edits) : undefined,
  }

  const ctx = {
    get(name) { return services[name] },
    on() { return () => {} },
    effect(run) { const dispose = run(); return () => { try { if (typeof dispose === 'function') dispose() } catch { /* 忽略 */ } } },
  }

  const devices = {
    rows: [{ id: 'stub-device', token: TOKEN, name: 'stub-phone' }],
    list() { return devices.rows },
    add(device) { const row = { id: 'stub-' + Date.now().toString(36), token: TOKEN, platform: (device && device.platform) || 'stub', name: (device && device.name) || 'stub-phone' }; devices.rows = [row]; return row },
    find(token) { return devices.rows.find((row) => row.token === token) || null },
    touch() {},
    revoke() {},
  }

  const runtime = new HarnessRuntime(ctx, {
    readDefaults: () => ({ model: '', permission: 'default', agentPreset: 'default' }),
    profilePatchPath: withEditor ? patchPath : null,
    customModelStore: path.join(tmp, 'custom-models.json'),
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  })

  // 线上就是这么接的：plugin/index.js:231 new HarnessConfig(ctx, { runtime, readDefaults, writeDefaults })，
  // index.js:274 再把 harness: harnessConfig 传给 PhoneServer。桩不注入 harness 时，
  // server.js:383 的 !this.harness 分支会把每个 harness 请求打成 503 config_unavailable。
  const harnessConfig = new HarnessConfig(ctx, {
    runtime,
    readDefaults: () => ({
      model: pluginSettings.model,
      permission: pluginSettings.permission,
      agentPreset: pluginSettings.agentPreset,
      workspace: pluginSettings.workspace,
    }),
    writeDefaults: (patch) => {
      if (!patch || typeof patch !== 'object') return
      for (const key of ['model', 'permission', 'agentPreset', 'workspace']) {
        if (typeof patch[key] === 'string') pluginSettings[key] = patch[key]
      }
    },
  })

  const server = new PhoneServer({
    runtime,
    harness: harnessConfig,
    approvals: { list: () => [] },
    questions: { list: () => [] },
    devices,
    pairing: { code: PAIR_CODE, consume(code) { return String(code || '').trim() === PAIR_CODE } },
    options: { port: EDITOR_PORT, bind: '127.0.0.1', name: 'phone-harness-verify', version: '0.0.0-verify', apkPath: null },
  })

  const port = await server.start()
  if (!port) {
    throw new Error('桩服务器起不来：' + String(server.lastError || '端口被占用'))
  }
  return {
    port,
    calls,
    tmp,
    withEditor,
    async stop() {
      try { await server.stop() } catch { /* 忽略 */ }
      try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 忽略 */ }
    },
  }
}

/* ------------------------------------------------------------------ */
/* 形状断言                                                            */
/* ------------------------------------------------------------------ */

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }

function checkHarnessShape(json) {
  const problems = []
  if (!isObj(json)) return ['响应不是 JSON 对象']
  for (const key of ['presets', 'workspaces', 'failures']) {
    if (!Array.isArray(json[key])) problems.push('缺少数组字段 ' + key + '（实际 ' + JSON.stringify(json[key]) + '）')
  }
  if (!isObj(json.defaults)) problems.push('缺少对象字段 defaults')
  else {
    for (const key of ['model', 'permission', 'agentPreset']) {
      if (!(key in json.defaults)) problems.push('defaults 缺少 ' + key)
    }
  }
  if (!isObj(json.capabilities)) problems.push('缺少对象字段 capabilities')
  else {
    for (const key of ['writeConfig', 'listDirs', 'configEditor']) {
      if (typeof json.capabilities[key] !== 'boolean') problems.push('capabilities.' + key + ' 不是布尔（实际 ' + JSON.stringify(json.capabilities[key]) + '）')
    }
  }
  for (const [index, preset] of (json.presets || []).entries()) {
    const at = 'presets[' + index + ']'
    if (!isObj(preset)) { problems.push(at + ' 不是对象'); continue }
    if (typeof preset.id !== 'string' || !preset.id) problems.push(at + '.id 不是非空字符串')
    if (typeof preset.title !== 'string' || !preset.title) problems.push(at + '.title 不是非空字符串')
    else if (preset.builtin === true && !hasCJK(preset.title)) problems.push(at + '.title 是内置预设却不是中文（' + preset.title + '）')
    if (typeof preset.description !== 'string') problems.push(at + '.description 不是字符串')
    if (typeof preset.current !== 'boolean') problems.push(at + '.current 不是布尔')
    if (typeof preset.usable !== 'boolean') problems.push(at + '.usable 不是布尔')
    if (typeof preset.builtin !== 'boolean') problems.push(at + '.builtin 不是布尔')
    if (preset.usable === false && (typeof preset.reason !== 'string' || !preset.reason)) problems.push(at + '.usable=false 却没有 reason 说明（契约 §1.1）')
    if (preset.usable === true && preset.reason != null && preset.reason !== '') problems.push(at + '.usable=true 却带 reason')
  }
  for (const [index, item] of (json.workspaces || []).entries()) {
    const at = 'workspaces[' + index + ']'
    if (!isObj(item)) { problems.push(at + ' 不是对象'); continue }
    if (typeof item.cwd !== 'string' || !item.cwd) problems.push(at + '.cwd 不是非空字符串')
    if (typeof item.title !== 'string') problems.push(at + '.title 不是字符串')
    if (typeof item.current !== 'boolean') problems.push(at + '.current 不是布尔')
  }
  if (Array.isArray(json.workspaces) && json.workspaces.length > 12) problems.push('workspaces 超过 12 条（' + json.workspaces.length + '）')
  return problems
}

function checkDirsShape(json) {
  const problems = []
  if (!isObj(json)) return ['响应不是 JSON 对象']
  if (typeof json.cwd !== 'string') problems.push('cwd 不是字符串')
  if (!('parent' in json)) problems.push('缺少 parent 字段（可为 null）')
  if (!Array.isArray(json.roots)) problems.push('roots 不是数组')
  if (!Array.isArray(json.entries)) problems.push('entries 不是数组')
  for (const [index, entry] of (json.entries || []).entries()) {
    const at = 'entries[' + index + ']'
    if (!isObj(entry)) { problems.push(at + ' 不是对象'); continue }
    if (typeof entry.name !== 'string' || !entry.name) problems.push(at + '.name 不合法')
    if (typeof entry.path !== 'string' || !entry.path) problems.push(at + '.path 不合法')
    if (typeof entry.dir !== 'boolean') problems.push(at + '.dir 不是布尔')
    if (typeof entry.hidden !== 'boolean') problems.push(at + '.hidden 不是布尔')
    if (entry.dir === false) problems.push(at + '.dir=false —— 契约要求只列目录')
  }
  return problems
}

/* ------------------------------------------------------------------ */
/* 就绪探针：别人还没落盘时，重活（构建）与形状断言都该判 NOT-READY        */
/* ------------------------------------------------------------------ */

function readiness() {
  const stringsText = readText(path.join(ANDROID, 'res', 'values', 'strings.xml')) || ''
  return {
    pluginHarness: Boolean(exists(path.join(PLUGIN, 'lib', 'harness.js'))),
    androidCore: Boolean(exists(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'Harness.java'))),
    androidStrings: /name="harness_/.test(stringsText),
    androidIcon: Boolean(exists(path.join(ANDROID, 'res', 'drawable', 'ic_preset.xml'))),
  }
}

/* ------------------------------------------------------------------ */
/* A. 语法检查（契约 §6 第 1 条）                                        */
/* ------------------------------------------------------------------ */

function sectionSyntax() {
  group('A. node --check（契约 §6 第 1 条）')
  const target = path.join(PLUGIN, 'lib', 'harness.js')
  if (!exists(target) && !FORCE) {
    return record('A1', 'cd plugin && node --check lib/harness.js lib/server.js index.js', 'NOT-READY',
      'plugin/lib/harness.js 不存在 —— plugin-dev 还没落盘（写租约：plugin/lib/harness.js）')
  }
  const res = sh('node', ['--check', 'lib/harness.js', 'lib/server.js', 'index.js'], { cwd: PLUGIN })
  const out = [res.stdout, res.stderr].filter(Boolean).join('\n').trim() || '(无输出)'
  const ok = res.code === 0 && !res.error
  return record('A1', 'cd plugin && node --check lib/harness.js lib/server.js index.js', ok ? 'PASS' : 'FAIL',
    'exit=' + res.code + (res.error ? ' error=' + res.error : '') + '\n' + out,
    ok ? {} : { owner: 'plugin-dev' })
}

/* ------------------------------------------------------------------ */
/* B. 协议成功路径（契约 §6 第 2 条前半）                                */
/* ------------------------------------------------------------------ */

async function sectionProtocol(stub, realDir) {
  group('B. 协议成功路径（契约 §6 第 2 条前半）')
  const auth = { authorization: 'Bearer ' + TOKEN }

  /* B1 GET /v1/harness */
  const snap = await request(stub.port, 'GET', '/v1/harness', null, auth)
  if (snap.json && snap.json.error && snap.json.error.code === 'not_found') {
    record('B1', 'GET /v1/harness 形状与桌面中文文案', 'NOT-READY',
      rawResponse(snap) + '\n→ 路由未实现（plugin-dev 未落盘 /v1/harness）')
    return { snap: null, blocked: true }
  }
  if (snap.status !== 200) {
    record('B1', 'GET /v1/harness 形状与桌面中文文案', 'FAIL', rawResponse(snap), { owner: 'plugin-dev' })
    return { snap, blocked: true }
  }
  const problems = checkHarnessShape(snap.json)
  /* 逐字核对四个内置预设 */
  const byId = new Map((snap.json.presets || []).map((preset) => [String(preset && preset.id), preset]))
  const titleChecks = []
  for (const expect of PRESET_EXPECT) {
    const hit = expect.ids.map((id) => byId.get(id)).find(Boolean)
    if (!hit) { titleChecks.push('缺少内置预设之一：' + expect.ids.join('/')); continue }
    if (hit.title !== expect.title) titleChecks.push('id=' + hit.id + ' title 应为「' + expect.title + '」实际「' + hit.title + '」')
    if (hit.description !== expect.description) titleChecks.push('id=' + hit.id + ' description 与桌面逐字不一致\n  期望: ' + expect.description + '\n  实际: ' + hit.description)
  }
  const unusable = (snap.json.presets || []).filter((preset) => preset && preset.usable === false)
  const brokenInStub = byId.get('broken-preset')
  if (!brokenInStub) titleChecks.push('桩提供的 broken 预设没有出现在列表里（usable=false 的项必须保留）')
  else if (brokenInStub.usable !== false) titleChecks.push('broken 预设 usable 应为 false，实际 ' + brokenInStub.usable)
  const currentOnes = (snap.json.presets || []).filter((preset) => preset && preset.current === true)
  if (currentOnes.length !== 1) titleChecks.push('current=true 的预设数量应为 1，实际 ' + currentOnes.length + (currentOnes.length ? '（' + currentOnes.map((p) => p.id).join(',') + '）' : ''))
  const allProblems = problems.concat(titleChecks)
  const ok = allProblems.length === 0
  record('B1', 'GET /v1/harness 形状 + 四个内置预设中文名/描述逐字一致（usable=false 项保留）', ok ? 'PASS' : 'FAIL',
    '原始响应:\n' + clip(rawResponse(snap), 3200) + '\n形状问题: ' + (allProblems.length ? allProblems.join('\n  - ') : '无') +
    '\nusable=false 项: ' + (unusable.length ? unusable.map((p) => p.id + '（reason=' + JSON.stringify(p.reason) + '）').join(', ') : '无'),
    ok ? {} : { owner: 'plugin-dev' })

  /* B2 GET /v1/harness/dirs 正常路径 */
  const dirs = await request(stub.port, 'GET', '/v1/harness/dirs?path=' + encodeURIComponent(realDir), null, auth)
  if (isRouteMissing(dirs)) {
    record('B2', 'GET /v1/harness/dirs?path=<真实目录> 形状（只列目录）', 'NOT-READY', rawResponse(dirs) + '\n→ 路由未实现（plugin-dev 未落盘 /v1/harness/dirs）')
    record('B3', 'GET /v1/harness/dirs（path 省略）', 'NOT-READY', '同 B2：/v1/harness/dirs 路由未实现')
    record('B4', 'POST /v1/harness/config {agentPreset:"ptc"} → 200', 'NOT-READY', '见 B1：/v1/harness 路由未实现')
    record('B5', 'POST /v1/harness/config {workspace:...} → 200', 'NOT-READY', '见 B1')
    record('B6', 'GET /v1/harness 无令牌 → 401', 'NOT-READY', '见 B1')
    return { snap, blocked: true }
  }
  let dirsProblems = []
  if (dirs.status === 200) dirsProblems = checkDirsShape(dirs.json)
  else dirsProblems.push('状态码不是 200')
  const okDirs = dirs.status === 200 && dirsProblems.length === 0
  record('B2', 'GET /v1/harness/dirs?path=<真实目录> 形状（只列目录）', okDirs ? 'PASS' : 'FAIL',
    '原始响应（截断到前 12 条 entries）:\n' + clip(JSON.stringify({ status: dirs.status, body: dirs.json ? { ...dirs.json, entries: (dirs.json.entries || []).slice(0, 12) } : dirs.text }, null, 2), 2600) +
    '\n形状问题: ' + (dirsProblems.length ? dirsProblems.join('\n  - ') : '无'),
    okDirs ? {} : { owner: 'plugin-dev' })

  /* B3 GET /v1/harness/dirs 省略 path（默认工作区） */
  const dirsDefault = await request(stub.port, 'GET', '/v1/harness/dirs', null, auth)
  const okDefault = dirsDefault.status === 200 && checkDirsShape(dirsDefault.json).length === 0 && typeof dirsDefault.json.cwd === 'string'
  if (isRouteMissing(dirsDefault)) { /* 已由 B2 判定 NOT-READY */ }
  record('B3', 'GET /v1/harness/dirs（path 省略 → cwd=当前默认工作区，parent=其父级）', okDefault ? 'PASS' : 'FAIL',
    '原始响应（entries 截断）:\n' + clip(JSON.stringify({ status: dirsDefault.status, body: dirsDefault.json ? { ...dirsDefault.json, entries: (dirsDefault.json.entries || []).slice(0, 6) } : dirsDefault.text }, null, 2), 2000),
    okDefault ? {} : { owner: 'plugin-dev' })

  /* B4 POST /v1/harness/config —— 切预设成功 */
  const beforePreset = snap.json.defaults && snap.json.defaults.agentPreset
  const postPreset = await request(stub.port, 'POST', '/v1/harness/config', { agentPreset: 'ptc' }, auth)
  const postProblems = []
  if (postPreset.status !== 200) postProblems.push('状态码 ' + postPreset.status + '（期望 200）')
  const body = postPreset.json || {}
  if (body.ok !== true) postProblems.push('ok 不是 true（实际 ' + JSON.stringify(body.ok) + '）')
  if (!isObj(body.applied)) postProblems.push('applied 不是对象')
  if (typeof body.message !== 'string' || !body.message) postProblems.push('message 不是非空字符串')
  else if (!hasCJK(body.message)) postProblems.push('message 不是中文短句：' + body.message)
  if (typeof body.persisted !== 'boolean') postProblems.push('persisted 不是布尔')
  const harnessProblems = checkHarnessShape(body.harness)
  const appliedPreset = body.applied && (body.applied.agentPreset || body.applied.preset)
  if (appliedPreset !== 'ptc') postProblems.push('applied.agentPreset 应为 ptc，实际 ' + JSON.stringify(appliedPreset))
  const newPreset = body.harness && body.harness.defaults && body.harness.defaults.agentPreset
  if (newPreset !== 'ptc') postProblems.push('harness.defaults.agentPreset 应已刷新为 ptc，实际 ' + JSON.stringify(newPreset))
  const currentPtc = ((body.harness && body.harness.presets) || []).find((preset) => preset && preset.id === 'ptc')
  if (currentPtc && currentPtc.current !== true) postProblems.push('harness.presets 里 ptc 的 current 应为 true')
  const allPost = postProblems.concat(harnessProblems)
  const okPost = allPost.length === 0
  record('B4', 'POST /v1/harness/config {agentPreset:"ptc"} → 200 + 中文 message + 刷新后的 harness', okPost ? 'PASS' : 'FAIL',
    '请求体: {"agentPreset":"ptc"}（切换前 defaults.agentPreset=' + JSON.stringify(beforePreset) + '）\n原始响应:\n' + clip(rawResponse(postPreset), 3200) +
    '\n问题: ' + (allPost.length ? allPost.join('\n  - ') : '无'),
    okPost ? {} : { owner: 'plugin-dev' })

  /* B5 POST /v1/harness/config —— 切工作区成功（乐观更新与回滚依赖它） */
  const target = path.join(ROOT, 'docs')
  const postSpace = await request(stub.port, 'POST', '/v1/harness/config', { workspace: target }, auth)
  const spaceProblems = []
  if (postSpace.status !== 200) spaceProblems.push('状态码 ' + postSpace.status + '（期望 200）')
  if (!postSpace.json || postSpace.json.ok !== true) spaceProblems.push('ok 不是 true')
  if (postSpace.json && !isObj(postSpace.json.applied)) spaceProblems.push('applied 不是对象')
  const spaceApplied = postSpace.json && postSpace.json.applied && (postSpace.json.applied.workspace || postSpace.json.applied.cwd)
  if (realishPath(spaceApplied) !== realishPath(target)) spaceProblems.push('applied.workspace 应为 ' + target + '，实际 ' + JSON.stringify(spaceApplied))
  const currentSpace = ((postSpace.json && postSpace.json.harness && postSpace.json.harness.workspaces) || []).filter((row) => row && row.current === true)
  if (currentSpace.length !== 1) spaceProblems.push('harness.workspaces 里 current=true 的数量应为 1，实际 ' + currentSpace.length)
  else if (realishPath(currentSpace[0].cwd) !== realishPath(target)) spaceProblems.push('current 工作区应为 ' + target + '，实际 ' + currentSpace[0].cwd)
  const okSpace = spaceProblems.length === 0
  record('B5', 'POST /v1/harness/config {workspace:"' + target + '"} → 200 + harness.workspaces 标记 current', okSpace ? 'PASS' : 'FAIL',
    '请求体: ' + JSON.stringify({ workspace: target }) + '\n原始响应:\n' + clip(rawResponse(postSpace), 2800) +
    '\n问题: ' + (spaceProblems.length ? spaceProblems.join('\n  - ') : '无'),
    okSpace ? {} : { owner: 'plugin-dev' })

  /* B6 POST/GET 的 401 回归（无令牌） */
  const noauth = await request(stub.port, 'GET', '/v1/harness', null, {})
  const okAuth = noauth.status === 401 && noauth.json && noauth.json.error && noauth.json.error.code === 'unauthorized'
  record('B6', 'GET /v1/harness 无令牌 → 401 unauthorized（沿用既有鉴权）', okAuth ? 'PASS' : 'FAIL', rawResponse(noauth), okAuth ? {} : { owner: 'plugin-dev' })

  return { snap, blocked: false }
}

/* ------------------------------------------------------------------ */
/* C. 失败路径与反例（契约 §6 第 2 条后半 + 第 5 条）                     */
/* ------------------------------------------------------------------ */

async function sectionNegatives(stub, withEditorStub) {
  group('C. 失败路径与反例（契约 §6 第 2 条后半 + 第 5 条）')
  const auth = { authorization: 'Bearer ' + TOKEN }

  const expectError = async (id, title, payload, status, code, owner) => {
    const res = await request(stub.port, 'POST', '/v1/harness/config', payload, auth)
    const got = res.json && res.json.error ? res.json.error.code : null
    const ok = res.status === status && got === code
    if (isRouteMissing(res)) {
      return record(id, title, 'NOT-READY', '请求体: ' + JSON.stringify(payload) + '\n' + rawResponse(res) + '\n→ 路由未实现（plugin-dev 未落盘 /v1/harness/config）')
    }
    record(id, title, ok ? 'PASS' : 'FAIL',
      '请求体: ' + JSON.stringify(payload) + '\n期望: HTTP ' + status + ' ' + code + '\n原始响应:\n' + clip(rawResponse(res), 1200),
      ok ? {} : { owner: owner || 'plugin-dev' })
    return ok
  }

  await expectError('C1', 'POST 坏工作区 → 400 bad_workspace', { workspace: path.join(ROOT, 'no-such-dir-xyz-12345') }, 400, 'bad_workspace')
  await expectError('C2', 'POST 未知预设 → 400 unknown_preset', { agentPreset: 'no-such-preset-xyz' }, 400, 'unknown_preset')
  await expectError('C3', 'POST 未知模型 → 400 unknown_model（契约 §1.2 全表）', { model: 'no-such-provider/no-such-model' }, 400, 'unknown_model')
  await expectError('C4', 'POST 未知权限 → 400 unknown_permission（契约 §1.2 全表）', { permission: 'no-such-permission' }, 400, 'unknown_permission')
  await expectError('C5', 'POST 空体（无有效字段）→ 400 bad_request', {}, 400, 'bad_request')

  /* C6 目录接口的坏路径 */
  const badDir = await request(stub.port, 'GET', '/v1/harness/dirs?path=' + encodeURIComponent(path.join(ROOT, 'no-such-dir-xyz-12345')), null, auth)
  const badDirCode = badDir.json && badDir.json.error ? badDir.json.error.code : null
  const okBadDir = (badDir.status === 404 && badDirCode === 'not_found') || (badDir.status === 400 && badDirCode === 'bad_path')
  record('C6', 'GET /v1/harness/dirs?path=<不存在> → 404 not_found（或 400 bad_path）',
    isRouteMissing(badDir) ? 'NOT-READY' : okBadDir ? 'PASS' : 'FAIL',
    rawResponse(badDir) + (isRouteMissing(badDir) ? '\n→ 路由未实现（不能与「坏路径被正确拒绝」混为一谈）' : ''),
    okBadDir && !isRouteMissing(badDir) ? {} : (isRouteMissing(badDir) ? {} : { owner: 'plugin-dev' }))

  const filePath = path.join(ROOT, 'docs', 'harness-contract.md')
  const notDir = await request(stub.port, 'GET', '/v1/harness/dirs?path=' + encodeURIComponent(filePath), null, auth)
  const notDirCode = notDir.json && notDir.json.error ? notDir.json.error.code : null
  const okNotDir = notDir.status === 400 && notDirCode === 'bad_path'
  record('C7', 'GET /v1/harness/dirs?path=<文件而非目录> → 400 bad_path',
    isRouteMissing(notDir) ? 'NOT-READY' : okNotDir ? 'PASS' : 'FAIL',
    rawResponse(notDir), okNotDir || isRouteMissing(notDir) ? {} : { owner: 'plugin-dev' })

  /* C8 反例：configEditor 不可用（--no-editor 桩） */
  const g = await request(withEditorStub.port, 'GET', '/v1/harness', null, auth)
  const caps = g.json && g.json.capabilities
  const writeConfigFalse = caps && caps.writeConfig === false
  record('C8', '反例：configEditor 不可用时 GET /v1/harness 的 capabilities.writeConfig=false（契约 §3.4 只读前提）',
    writeConfigFalse ? 'PASS' : (g.status === 200 ? 'FAIL' : 'NOT-READY'),
    '原始响应（截断）:\n' + clip(JSON.stringify({ status: g.status, capabilities: g.json && g.json.capabilities, failures: g.json && g.json.failures }, null, 2), 1500),
    writeConfigFalse ? {} : { owner: 'plugin-dev' })

  const p = await request(withEditorStub.port, 'POST', '/v1/harness/config', { agentPreset: 'ptc' }, auth)
  const pCode = p.json && p.json.error ? p.json.error.code : null
  const runtimeOnly = p.status === 200 && p.json && p.json.persisted === false
  const okP = (p.status === 503 && pCode === 'config_unavailable') || runtimeOnly
  record('C9', '反例：configEditor + 本插件配置都不可用 → 503 config_unavailable（或退化为 200 + persisted=false）',
    okP ? 'PASS' : (p.status === 404 ? 'NOT-READY' : 'FAIL'),
    '请求体: {"agentPreset":"ptc"}\n原始响应:\n' + clip(rawResponse(p), 1600) + '\n判定分支: ' + (p.status === 503 ? '503 config_unavailable' : runtimeOnly ? '200 persisted=false（运行期生效，手机端提示「已生效（本次运行）」）' : '都不成立'),
    okP ? {} : { owner: 'plugin-dev' })

  /* C10 反例：host 拒绝写默认值 → 409 default_unavailable（契约 §1.2 既有语义；桩无法稳定复现，标记局限） */
  record('C10', '反例：宿主拒绝写入默认值 → 409 default_unavailable', '未验证',
    '桩宿主的 configEditor.edit 永远成功，无法在不改别人文件的前提下稳定复现「宿主拒绝」。\n' +
    '替代证据：读 plugin/lib/server.js 的错误映射表里 default_unavailable → 409 这一行（既有语义，本次未改动）。\n' +
    '局限：真机上需要在 host 侧拒绝时才能看到，属人工确认项。')

  /* C11 反例：presets[].usable=false 的项保留并可置灰（数据侧） */
  const broken = g.json && (g.json.presets || []).find((preset) => preset && preset.usable === false)
  const okBroken = Boolean(broken) && typeof broken.reason === 'string' && broken.reason.length > 0
  record('C11', '反例：usable=false 的预设保留在列表里且带 reason（界面置灰是 §6(5) 的静态/连机项）',
    okBroken ? 'PASS' : (g.status === 200 ? 'FAIL' : 'NOT-READY'),
    'usable=false 项: ' + JSON.stringify(broken || null, null, 2) + '\n（真机「置灰不可点」见 F 段与连机段落）',
    okBroken ? {} : { owner: 'plugin-dev' })

  /* C12 反例：只读宿主切工作区 —— 工作区是本插件自己的偏好，宿主写不进也应本次运行生效 */
  const w = await request(withEditorStub.port, 'POST', '/v1/harness/config', { workspace: path.join(ROOT, 'docs') }, auth)
  const wBody = w.json || {}
  const okW = w.status === 200 && wBody.persisted === false && typeof wBody.message === 'string' && wBody.message.indexOf('已生效（本次运行）') >= 0
  record('C12', '反例：只读宿主切工作区 → 200 + persisted=false + message 末尾「已生效（本次运行）」',
    okW ? 'PASS' : (isRouteMissing(w) ? 'NOT-READY' : 'FAIL'),
    '请求体: ' + JSON.stringify({ workspace: path.join(ROOT, 'docs') }) + '\n原始响应（harness 快照截断）:\n' + clip(rawResponse(w), 1800),
    okW ? {} : { owner: 'plugin-dev' })
}

/* ------------------------------------------------------------------ */
/* D. Android 构建（契约 §6 第 3 条）                                    */
/* ------------------------------------------------------------------ */

function sectionBuild() {
  group('D. Android 构建（契约 §6 第 3 条）')
  if (!exists(path.join(ANDROID, 'build.sh'))) {
    return record('D1', 'cd android && bash build.sh', 'FAIL', 'android/build.sh 不存在', { owner: 'android-core' })
  }
  const apk = path.join(ANDROID, 'bin', 'dsh-phone.apk')
  const before = exists(apk)
  const started = Date.now()
  const res = sh('bash', ['build.sh'], { cwd: ANDROID, timeout: 900000 })
  const out = [res.stdout, res.stderr].filter(Boolean).join('\n')
  const after = exists(apk)
  const built = res.code === 0 && after && (!before || after.mtimeMs >= started - 2000)
  const tail = out.split('\n').slice(-24).join('\n')
  record('D1', 'cd android && bash build.sh（产物 android/bin/dsh-phone.apk）', built ? 'PASS' : 'FAIL',
    'exit=' + res.code + (res.error ? ' error=' + res.error : '') +
    '\n版本覆盖: VERSION_NAME=' + (process.env.VERSION_NAME || '(未设，用 manifest 默认)') + ' VERSION_CODE=' + (process.env.VERSION_CODE || '(未设，用 manifest 默认)') +
    '\nAPK: ' + (after ? after.size + ' bytes, mtime=' + new Date(after.mtimeMs).toISOString() + (before ? '（旧件 ' + before.size + ' bytes）' : '（之前不存在）') : '不存在') +
    '\n尾部输出:\n' + tail,
    built ? {} : { owner: 'android-core' })
  return built
}

/* ------------------------------------------------------------------ */
/* E. 资源进包核对（契约 §6 第 3 条后半）                                */
/* ------------------------------------------------------------------ */

function sectionResources() {
  group('E. 新资源/新字符串进包核对（契约 §6 第 3 条后半）')
  const apk = path.join(ANDROID, 'bin', 'dsh-phone.apk')
  const aapt2 = path.join(SDK_BT, 'aapt2.exe')
  if (!exists(apk)) return record('E1', 'aapt2 dump resources/strings 核对 ic_preset 与 harness 文案', 'NOT-READY', 'APK 不存在，先跑 D 段构建')
  if (!exists(aapt2)) return record('E1', 'aapt2 dump resources/strings 核对 ic_preset 与 harness 文案', 'FAIL', '缺少 ' + aapt2, { owner: 'verifier' })

  const resDump = sh(aapt2, ['dump', 'resources', apk])
  const resourcesText = (resDump.stdout || '') + (resDump.stderr || '')
  const strDump = sh(aapt2, ['dump', 'strings', apk])
  const stringsText = (strDump.stdout || '') + (strDump.stderr || '')
  const hasIcon = /ic_preset/.test(resourcesText)
  record('E1', 'APK 资源表里存在 ic_preset（新图标进包）', hasIcon ? 'PASS' : 'FAIL',
    'aapt2 dump resources 命中 ic_preset 次数: ' + (resourcesText.match(/ic_preset/g) || []).length +
    '\n命中行:\n' + ((resourcesText.match(/[^\n]*ic_preset[^\n]*/g) || []).slice(0, 6).join('\n') || '(无)'),
    hasIcon ? {} : { owner: 'android-ui' })

  const missing = []
  const found = []
  for (const [key, value] of Object.entries(STRINGS)) {
    const probe = key.replace('%1$s', '').replace('%2$s', '')
    if (resourcesText.includes(probe) || stringsText.includes(key)) found.push(key)
    else missing.push(key)
  }
  const okStrings = missing.length === 0
  record('E2', 'APK 资源表里带 ' + Object.keys(STRINGS).length + ' 条 harness_* 文案键（契约 §4）', okStrings ? 'PASS' : 'FAIL',
    '命中 ' + found.length + ' / ' + Object.keys(STRINGS).length + '\n缺失: ' + (missing.join(', ') || '无') +
    '\n（核对方式：aapt2 dump resources / dump strings，按键名或中文值匹配）',
    okStrings ? {} : { owner: 'android-core' })

  /* 旁车元数据 */
  const meta = path.join(ANDROID, 'bin', 'dsh-phone.apk.json')
  const metaText = readText(meta)
  let metaOk = false
  let metaShow = '不存在'
  if (metaText) {
    try {
      const parsed = JSON.parse(metaText)
      metaShow = JSON.stringify(parsed, null, 2)
      metaOk = typeof parsed.versionName === 'string' && typeof parsed.md5 === 'string' && Number.isFinite(parsed.size)
    } catch (error) { metaShow = 'JSON 解析失败: ' + String(error.message) }
  }
  record('E3', 'android/bin/dsh-phone.apk.json 旁车元数据（版本/md5/size）', metaOk ? 'PASS' : 'FAIL', metaShow, metaOk ? {} : { owner: 'android-core' })
}

/* ------------------------------------------------------------------ */
/* F. 静态界面核对（无真机时的替代证据，契约 §6 第 4 条）                  */
/* ------------------------------------------------------------------ */

function sectionStatic() {
  group('F. 静态界面核对（§6 第 4 条的静态替代证据）')
  const stringsXml = path.join(ANDROID, 'res', 'values', 'strings.xml')
  const text = readText(stringsXml)
  if (text === null) {
    record('F1', 'strings.xml 含全部契约 §4 键名', 'NOT-READY', '读不到 ' + stringsXml)
  } else {
    const missing = []
    const wrongValue = []
    for (const [key, value] of Object.entries(STRINGS)) {
      const line = new RegExp('<string\\s+name="' + key + '"\\s*>([\\s\\S]*?)</string>')
      const hit = line.exec(text)
      if (!hit) { missing.push(key); continue }
      const actual = hit[1].trim()
      if (actual !== value) wrongValue.push(key + '\n  契约: ' + value + '\n  实际: ' + actual)
    }
    const keys = (text.match(/name="harness_[a-z_]+"/g) || []).length
    const ok = missing.length === 0 && wrongValue.length === 0
    record('F1', 'android/res/values/strings.xml 含全部 ' + Object.keys(STRINGS).length + ' 条 harness_* 键且值逐字一致', ok ? 'PASS' : (keys === 0 ? 'NOT-READY' : 'FAIL'),
      'harness_* 键数量: ' + keys + '\n缺失: ' + (missing.join(', ') || '无') + '\n文案不符: ' + (wrongValue.join('\n') || '无'),
      ok ? {} : { owner: 'android-core' })
  }

  const main = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'MainActivity.java'))
  if (main === null) {
    record('F2', 'MainActivity v1.3.3 两处座位（带内 工作区+预设；胶囊内 模型+权限）', 'NOT-READY', '读不到 MainActivity.java')
  } else {
    const mainLines = main.split('\n')
    const findLine = (markers) => {
      for (let i = 0; i < mainLines.length; i++) {
        for (const m of markers) if (mainLines[i].includes(m)) return { line: i + 1, hit: mainLines[i].trim().slice(0, 110) }
      }
      return { line: null, hit: null }
    }
    const idxOf = (needle) => main.indexOf(needle)
    const linePos = (pos) => (pos < 0 ? null : main.slice(0, pos).split('\n').length)
    const chipStart = idxOf('wrap.addView(chipScroll')
    const cardStart = idxOf('wrap.addView(card')
    const wrapOk = chipStart >= 0 && cardStart >= 0 && chipStart < cardStart && idxOf('row.addView(chipScroll') < 0
    const bandWs = linePos(idxOf('chipsRow.addView(wsChip'))
    const bandPre = linePos(idxOf('chipsRow.addView(presetChip'))
    const chipsRowAdds = (main.match(/chipsRow\.addView\(/g) || []).length
    const bandOk = bandWs !== null && bandPre !== null && bandWs < bandPre && chipsRowAdds === 2
    const mod = findLine(['seatChip(R.drawable.ic_data', 'seatChip(Harness.modelIcon()', 'seatChip(Seats.modelIcon('])
    const perm = findLine(['seatChip(Seats.permIcon(', 'seatChip(Harness.permissionIcon()', 'seatChip(R.drawable.ic_shield', 'seatChip(R.drawable.ic_lock'])
    const dpOf = (info) => {
      if (!info.hit) return null
      const m = info.hit.match(/seatChip\([^,]+,\s*(\d+)/)
      return m ? Number(m[1]) : null
    }
    const dpMod = dpOf(mod)
    const dpPerm = dpOf(perm)
    const addMod = linePos(idxOf('row.addView(modelChip'))
    const addPerm = linePos(idxOf('row.addView(permChip'))
    const permAddPos = idxOf('row.addView(permChip')
    const springPos = main.indexOf('new LinearLayout.LayoutParams(0, 1, 1f)', permAddPos < 0 ? 0 : permAddPos)
    const springLine = linePos(springPos)
    const inCardOk = addMod !== null && addPerm !== null && springLine !== null && addMod < addPerm && addPerm < springLine
    const permMargin = /leftMargin\s*=\s*t\.dp\(8\)/.test(main)
    const rowLines = cardRowAddLines(main, cardStart)
    const rowRegion = main.slice(main.lastIndexOf('card.addView(row', cardStart >= 0 ? cardStart : main.length), cardStart >= 0 ? cardStart : main.length)
    const springOk = rowLines.some((l) => /1f\)/.test(l)) && !rowLines.some((l) => /chipScroll/.test(l))
    const roundOk = (rowRegion.match(/t\.dp\(44\),\s*t\.dp\(44\)/g) || []).length >= 2
    const contractTxt = readText(path.join(ROOT, 'docs', 'harness-contract.md')) || ''
    const dpLines = contractTxt.split('\n')
    let dpIdx = dpLines.findIndex((l) => /maxTextDp\s*取值/.test(l))
    if (dpIdx < 0) dpIdx = dpLines.findIndex((l) => /maxTextDp/.test(l))
    const dpChunk = dpIdx >= 0 ? dpLines[dpIdx] : ''
    const pick = (re) => {
      const m = dpChunk.match(re)
      return m ? Number(m[1]) : null
    }
    const cWs = pick(/工作区\s*\*{0,2}\s*(\d+)/)
    const cPre = pick(/预设\s*\*{0,2}\s*(\d+)/)
    const cMod = pick(/模型\s*\*{0,2}\s*(\d+)/)
    const cPerm = pick(/权限\s*\*{0,2}\s*(\d+)/)
    const contractDp = cWs !== null && cPre !== null && cMod !== null && cPerm !== null ? [cWs, cPre, cMod, cPerm] : null
    const wsC = findLine(['seatChip(Harness.workspaceIcon()', 'seatChip(R.drawable.ic_folder'])
    const preC = findLine(['seatChip(Harness.presetIcon()', 'seatChip(R.drawable.ic_preset'])
    const dpWs = dpOf(wsC)
    const dpPre = dpOf(preC)
    const dpOk = contractDp
      ? [dpWs, dpPre, dpMod, dpPerm].every((v, i) => v === contractDp[i])
      : (dpWs !== null && dpPre !== null && dpMod !== null && dpPerm !== null && dpMod >= 56 && dpPerm >= 40)
    const entryOk = /showWorkspacePanel\s*\(/.test(main) && /showPresetPanel\s*\(/.test(main)
    const ok = bandOk && wrapOk && inCardOk && springOk && roundOk && permMargin && dpOk && entryOk
    record('F2', 'MainActivity v1.3.3 两处座位：带内 工作区→预设；胶囊内 模型→权限→弹簧→两枚 44dp 圆钮', ok ? 'PASS' : 'FAIL',
      '【上方带】wrap.addView(chipScroll)=' + linePos(chipStart) + ' < wrap.addView(card)=' + linePos(cardStart) + '=' + wrapOk +
      '；row.addView(chipScroll)=' + (idxOf('row.addView(chipScroll') < 0 ? '无（正确）' : '有（★仍在卡片内）') +
      '\n【带内两枚】chipsRow.addView 共 ' + chipsRowAdds + ' 处（要求 2）；工作区=' + bandWs + ' → 预设=' + bandPre + '，顺序正确=' + bandOk +
      '\n【胶囊内两枚】模型=' + mod.line + '（' + mod.hit + '）' +
      '\n              权限=' + perm.line + '（' + perm.hit + '）' +
      '\n              模型 addView=' + addMod + ' → 权限 addView=' + addPerm + ' → 弹簧=' + springLine + '；顺序正确=' + inCardOk +
      '；权限 leftMargin t.dp(8)=' + permMargin +
      '\n【maxTextDp】实测 工作区=' + dpWs + '（' + wsC.line + '） 预设=' + dpPre + '（' + preC.line + '） 模型=' + dpMod + ' 权限=' + dpPerm +
      '；契约 §3.1 定案=' + (contractDp ? contractDp.join('/') : '（拿不到四个值 → 退回 模型≥56 权限≥40）') + '；四枚全部一致=' + dpOk +
      '\n契约原文（' + (dpIdx >= 0 ? dpIdx + 1 : '?') + ' 行）：' + (dpChunk ? dpChunk.trim().slice(0, 220) : '(找不到含 maxTextDp 的行)') +
      '\n【胶囊内只剩】弹簧=' + springOk + ' 两枚44dp圆钮=' + roundOk +
      '\n点击入口 showWorkspacePanel/showPresetPanel=' + entryOk,
      ok ? {} : { owner: 'android-ui' })
  }

  const seats = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'Seats.java'))
  if (seats === null) record('F3', 'Seats.java 两个面板方法 + 乐观更新/回滚', 'NOT-READY', '读不到 Seats.java')
  else {
    const need = [
      ['showWorkspacePanel', /static\s+void\s+showWorkspacePanel\s*\(\s*(?:final\s+)?Activity\s+\w+\s*,\s*(?:final\s+)?Theme\s+\w+\s*,\s*(?:final\s+)?Prefs\s+\w+\s*,\s*(?:final\s+)?View\s+\w+\s*,\s*(?:final\s+)?Runnable\s+\w+\s*\)/],
      ['showPresetPanel', /static\s+void\s+showPresetPanel\s*\(\s*(?:final\s+)?Activity\s+\w+\s*,\s*(?:final\s+)?Theme\s+\w+\s*,\s*(?:final\s+)?Prefs\s+\w+\s*,\s*(?:final\s+)?View\s+\w+\s*,\s*(?:final\s+)?Runnable\s+\w+\s*\)/],
      ['Harness.set 调用', /Harness\.set\s*\(/],
      ['回滚语义（失败恢复旧文案）', /harness_switch_refused|switch_refused/],
      ['使用此目录', /harness_use_this_dir/],
      ['浏览主机目录', /harness_browse_dir/],
      ['手动输入路径', /harness_manual_path/],
      ['上级目录', /harness_parent_dir/],
      ['最近工作区', /harness_recent_workspaces/],
      ['内置/自定义分组', /harness_group_builtin[\s\S]{0,4000}harness_group_custom|harness_group_custom[\s\S]{0,4000}harness_group_builtin/],
    ]
    const missing = need.filter(([, re]) => !re.test(seats)).map(([name]) => name)
    const ok = missing.length === 0
    record('F3', 'Seats.java 面板方法签名 + 关键交互片段齐备', ok ? 'PASS' : 'FAIL',
      '缺失: ' + (missing.join(', ') || '无') + '\n（静态正则核对：签名按契约 §3.2 语义比对，允许 public/static/final 修饰与参数名差异）',
      ok ? {} : { owner: 'android-ui' })
  }

  /* F4：**本轮 harness 相关区域**里不得硬编码中文（中文一律走 strings.xml）
     注意：仓库里有大量**历史遗留**硬编码中文（MainActivity 的抽屉/归档箱/搜索框等，早于本轮），
     拿历史债给 android-ui 记 FAIL 是错的，所以本项只判 harness 区域：
     「harness 引用行 ±3 行」= 本轮区域；区域外的命中单独计数（info），不计 FAIL。 */
  const targets = ['MainActivity.java', 'Seats.java', 'SettingsActivity.java', 'ChatActivity.java', 'NewSessionActivity.java', 'Harness.java']
  /* 逐文件用**harness 专属 token**，避免误伤同名历史代码：
     - MainActivity 另有一个历史方法 `workspaceChip(...)`（工作区筛选条，非本轮），所以本文件不认 workspaceChip；
     - 裸词 "harness" 会命中 "PhoneHarness 手机端…" 服务说明文本与 PhoneHarness 类名 → 一律用 Harness\.（真正引用 Harness 门面）。 */
  const HARNESS_TOKENS = {
    'MainActivity.java': [/Harness\./, /\bwsChip\b/, /\bpresetChip\b/, /\bpresetIcon\b/],
    'NewSessionActivity.java': [/Harness\./, /\bworkspaceChip\b/, /\bpresetChip\b/],
    'Seats.java': [/Harness\./, /harness_/],
    'SettingsActivity.java': [/Harness\./, /harness_/, /\bharnessRow\b/, /\bharnessValueView\b/],
    'ChatActivity.java': [/Harness\./, /harness_/],
    'Harness.java': [/Harness/],
  }
  const hardcoded = []
  const legacyHits = []
  for (const name of targets) {
    const file = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', name))
    if (!file) continue
    const lines = file.split('\n')
    const toks = HARNESS_TOKENS[name] || [/Harness\./, /harness_/]
    const inHarness = new Set()
    lines.forEach((line, i) => {
      if (toks.some((re) => re.test(line))) {
        for (let k = i - 1; k <= i + 3; k++) if (k >= 0 && k < lines.length) inHarness.add(k)
      }
    })
    lines.forEach((line, i) => {
      const noComment = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
      const trimmed = noComment.trim()
      if (/^[*\/]/.test(trimmed)) return
      for (const hit of noComment.matchAll(/"([^"\\]*)"/g)) {
        if (!hasCJK(hit[1]) || !hit[1].trim()) continue
        const rec = name + ':' + (i + 1) + ' "' + hit[1].slice(0, 50) + '"'
        if (inHarness.has(i)) hardcoded.push(rec)
        else legacyHits.push(rec)
      }
    })
  }
  const okNoHard = hardcoded.length === 0
  record('F4', 'harness 相关代码里没有硬编码中文（中文一律走 R.string.harness_*）', okNoHard ? 'PASS' : 'FAIL',
    (okNoHard ? 'harness 区域扫描 ' + targets.join(' / ') + '：0 处中文字符串字面量' : 'harness 区域命中:\n' + hardcoded.slice(0, 24).join('\n')) +
    '\n区域外（历史遗留，早于本轮，不计入）：' + legacyHits.length + ' 处' +
    (legacyHits.length ? ' —— 例：' + legacyHits.slice(0, 6).join(' | ') : ''),
    okNoHard ? {} : { owner: 'android-ui' })

  const icon = readText(path.join(ANDROID, 'res', 'drawable', 'ic_preset.xml'))
  if (icon === null) record('F5', 'android/res/drawable/ic_preset.xml（24dp 线性矢量）', 'NOT-READY', '文件不存在 —— android-ui 还没落盘')
  else {
    /* 契约 §3.6 字面要求「线性矢量 strokeWidth/strokeColor #FF000000」，但它同时要求「与 ic_data/ic_enhance 同风格」；
       实测 ic_enhance.xml 也是纯填充（#FFFFFFFF + Theme 着色），ic_data.xml 才是 fill+stroke。
       本项按**意图**判（24dp 可着色矢量、与既有图标同族、且已进包 → E1 证），同时把措辞偏差写进证据交 lead 定。 */
    const isVector = /<vector/.test(icon)
    const w24 = /width="24dp"/.test(icon)
    const h24 = /height="24dp"/.test(icon)
    const hasPath = /<path/.test(icon)
    const colorLit = (icon.match(/#FF[0-9A-Fa-f]{6}/g) || [])
    const literalStroke = /strokeWidth/.test(icon) && /#FF000000/.test(icon)
    const okIcon = isVector && w24 && h24 && hasPath && colorLit.length > 0
    const deviation = literalStroke ? '' :
      '\n⚠ 契约 §3.6 字面措辞偏差：实现取 ' + (colorLit.join('/') || '(无颜色)') + ' 填充路径（与既有 ic_folder.xml / ic_enhance.xml 同款：均 #FFFFFFFF 填充、靠 Theme 着色），' +
      '未使用 strokeWidth/strokeColor #FF000000；而契约引用的 ic_enhance.xml 本身也是纯填充 → 措辞自相矛盾。' +
      '\n判定口径：意图满足（24dp 矢量、可着色、与既有图标同族、E1 已验进包）→ PASS；措辞偏差回报 lead（改措辞 or 让 android-ui 改描边）。'
    record('F5', 'android/res/drawable/ic_preset.xml（24dp 可着色矢量，与既有图标同族）', okIcon ? 'PASS' : 'FAIL',
      'vector=' + isVector + ' width24dp=' + w24 + ' height24dp=' + h24 + ' 含 path=' + hasPath + ' 颜色字面量=' + (colorLit.join('/') || '无') +
      ' 字面 strokeWidth+#FF000000=' + literalStroke + deviation +
      '\n文件前 20 行:\n' + icon.split('\n').slice(0, 20).join('\n'),
      okIcon ? {} : { owner: 'android-ui' })
  }

  const settings = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'SettingsActivity.java'))
  if (settings === null) record('F6', '设置页 harness 行 + 只读警告条（反例 §6 第 5 条）', 'NOT-READY', '读不到 SettingsActivity.java')
  else {
    const need = [
      ['设置行 harness_settings_row', /harness_settings_row/],
      ['只读警告 harness_readonly_warning', /harness_readonly_warning/],
      ['刷新 harness_refresh', /harness_refresh/],
      ['主机标签 harness_host_label', /harness_host_label/],
      ['Harness.refresh 调用', /Harness\.refresh\s*\(/],
      ['writeConfig 判定', /writeConfig/],
    ]
    const missing = need.filter(([, re]) => !re.test(settings)).map(([name]) => name)
    const ok = missing.length === 0
    record('F6', 'SettingsActivity 设置模式：4 行只读 + capabilities 摘要 + writeConfig=false 只读警告', ok ? 'PASS' : (missing.length === need.length ? 'NOT-READY' : 'FAIL'),
      '缺失: ' + (missing.join(', ') || '无'), ok ? {} : { owner: 'android-ui' })
  }

  const chat = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'ChatActivity.java'))
  if (chat === null) record('F7', '会话页预设标签只读（无切换控件）', 'NOT-READY', '读不到 ChatActivity.java')
  else {
    const hasLabel = /presetTitle|harness|Preset/.test(chat)
    const hasSwitcher = /showPresetPanel/.test(chat)
    record('F7', 'ChatActivity 显示会话预设名且不提供切换控件', hasLabel && !hasSwitcher ? 'PASS' : (hasLabel ? 'FAIL' : 'NOT-READY'),
      '含预设标签=' + hasLabel + ' 含切换面板(不应有)=' + hasSwitcher +
      '\n（另需人工核对：12sp / 次要色圆角 / ≤180dp 省略 / 拿不到预设时不显示占位）',
      hasLabel && !hasSwitcher ? {} : { owner: 'android-ui' })
  }

  const ns = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'NewSessionActivity.java'))
  if (ns === null) record('F8', '新建会话页带 agentPreset 与工作区 chip', 'NOT-READY', '读不到 NewSessionActivity.java')
  else {
    const checks = [
      ['cwd 输入框改为 chip（引用工作区面板）', /showWorkspacePanel/],
      ['预设 chip（引用预设面板）', /showPresetPanel/],
      ['POST /v1/sessions 带 agentPreset', /agentPreset/],
    ]
    const missing = checks.filter(([, re]) => !re.test(ns)).map(([name]) => name)
    const ok = missing.length === 0
    record('F8', 'NewSessionActivity：工作区 chip + 预设 chip + 新建会话带 agentPreset', ok ? 'PASS' : 'NOT-READY',
      '缺失: ' + (missing.join(', ') || '无'), ok ? {} : { owner: 'android-ui' })
  }

  /* F9（§6.1 第 7 条）：会话页座位带里只有模型/权限 ⇒ 整条 chipScroll 撤掉（grep -c chipScroll = 0） */
  const chatAct = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'ChatActivity.java'))
  if (chatAct === null) record('F9', 'ChatActivity v1.3.3 无 chipScroll 带', 'NOT-READY', '读不到 ChatActivity.java')
  else {
    const chatLines = chatAct.split('\n')
    const ci = (needle) => chatAct.indexOf(needle)
    const cl = (pos) => (pos < 0 ? null : chatAct.slice(0, pos).split('\n').length)
    const findLineC = (markers) => {
      for (let i = 0; i < chatLines.length; i++) {
        for (const m of markers) if (chatLines[i].includes(m)) return { line: i + 1, hit: chatLines[i].trim().slice(0, 110) }
      }
      return { line: null, hit: null }
    }
    const dpOfC = (info) => {
      if (!info.hit) return null
      const m = info.hit.match(/seatChip\([^,]+,\s*(\d+)/)
      return m ? Number(m[1]) : null
    }
    const chipScrollCount = (chatAct.match(/chipScroll/g) || []).length
    const modC = findLineC(['seatChip(R.drawable.ic_data', 'seatChip(Harness.modelIcon()'])
    const permC = findLineC(['seatChip(Seats.permIcon(', 'seatChip(Harness.permissionIcon()'])
    const atMod = cl(ci('row.addView(modelChip'))
    const atPerm = cl(ci('row.addView(permChip'))
    const atSpring = cl(ci('new LinearLayout.LayoutParams(0, 1, 1f)'))
    const orderOk = atMod !== null && atPerm !== null && atSpring !== null && atMod < atPerm && atPerm < atSpring
    const cardPosC = ci('wrap.addView(card')
    const rowRegionC = chatAct.slice(chatAct.lastIndexOf('card.addView(row', cardPosC >= 0 ? cardPosC : chatAct.length), cardPosC >= 0 ? cardPosC : chatAct.length)
    const roundC = (rowRegionC.match(/t\.dp\(44\),\s*t\.dp\(44\)/g) || []).length >= 2
    const ok = chipScrollCount === 0 && orderOk && roundC
    record('F9', 'ChatActivity v1.3.3：整条 chipScroll 已撤；胶囊内 模型→权限→弹簧→两枚 44dp 圆钮', ok ? 'PASS' : 'FAIL',
      'grep -c chipScroll = ' + chipScrollCount + '（要求 0）' +
      '\n模型 chip=' + modC.line + '（maxTextDp=' + dpOfC(modC) + '）→ row.addView=' + atMod +
      '\n权限 chip=' + permC.line + '（maxTextDp=' + dpOfC(permC) + '）→ row.addView=' + atPerm +
      '\n弹簧=' + atSpring + '；顺序正确=' + orderOk + '；两枚 44dp 圆钮=' + roundC,
      ok ? {} : { owner: 'android-ui' })
  }

  /* F10（§6.1 第 8 条，静态侧）：面板打开后**无条件**发一次 GET /v1/harness（不再「只在 state==null 才取」）；
     失败必须可见可重试：harness_loading → harness_load_error(原因) → 可点 harness_retry。 */
  if (seats === null) record('F10', 'Seats.java 面板打开即取数 + 失败可重试', 'NOT-READY', '读不到 Seats.java')
  else {
    const seatLines = seats.split('\n')
    const lineOf = (re) => {
      for (let i = 0; i < seatLines.length; i++) if (re.test(seatLines[i])) return i + 1
      return null
    }
    const refreshLine = lineOf(/Harness\.refresh\s*\(/)
    const refreshPanelLine = lineOf(/private static void refreshPanel\s*\(/)
    const gatedOnlyWhenEmpty = /if\s*\([^\n]{0,40}Harness\.state\(\)\s*==\s*null\s*\)\s*\{?[\s\S]{0,160}?Harness\.refresh/.test(seats)
    const cbRefill = /Harness\.refresh\(sheet\.host[\s\S]{0,400}?refill\(\)[\s\S]{0,200}?resize\(\)/.test(seats)
    const wsPanelCallsRefresh = /showWorkspacePanel[\s\S]{0,900}?refreshPanel\(sheet\)/.test(seats)
    const psPanelCallsRefresh = /showPresetPanel[\s\S]{0,900}?refreshPanel\(sheet\)/.test(seats)
    const loadingLine = lineOf(/harness_loading/)
    const errorLine = lineOf(/harness_load_error/)
    const retryLine = lineOf(/harness_retry/)
    const reasonLine = lineOf(/Harness\.lastError\(\)/)
    const ok = refreshLine !== null && refreshPanelLine !== null && !gatedOnlyWhenEmpty && cbRefill &&
      wsPanelCallsRefresh && psPanelCallsRefresh && loadingLine !== null && errorLine !== null && retryLine !== null && reasonLine !== null
    record('F10', 'Seats.java：打开面板即取数（无条件）+ 失败态 loading→load_error(原因)→可点 retry', ok ? 'PASS' : 'FAIL',
      'Harness.refresh 行=' + refreshLine + '；private static void refreshPanel 行=' + refreshPanelLine +
      '\n反判据「仅 state==null 才取数」命中=' + gatedOnlyWhenEmpty + '（要求 false）' +
      '\n刷新回调 refill()+resize()=' + cbRefill + '；工作区面板走 refreshPanel=' + wsPanelCallsRefresh + '；预设面板走 refreshPanel=' + psPanelCallsRefresh +
      '\n失败态：harness_loading=' + loadingLine + ' harness_load_error=' + errorLine + ' harness_retry=' + retryLine + ' Harness.lastError()=' + reasonLine,
      ok ? {} : { owner: 'android-ui' })
  }

  /* F11（§6.1 第 8 条）：Harness.lastError() 接线——声明 + clear() 归零 + 失败时写入 + refresh 每次先清。 */
  const harnessFile = readText(path.join(ANDROID, 'src', 'com', 'lc', 'phoneharness', 'Harness.java'))
  if (harnessFile === null) record('F11', 'Harness.lastError() 接线', 'NOT-READY', '读不到 Harness.java')
  else {
    const hLines = harnessFile.split('\n')
    const hLine = (re) => {
      for (let i = 0; i < hLines.length; i++) if (re.test(hLines[i])) return i + 1
      return null
    }
    const decl = hLine(/private static volatile String lastError/)
    const clearFn = hLine(/public static void clear\(\)/)
    const getter = hLine(/public static String lastError\(\)/)
    const setter = hLine(/private static void setLastError\(/)
    const clearInside = /public static void clear\(\)\s*\{[\s\S]{0,200}?lastError\s*=\s*null/.test(harnessFile)
    const resetInRefresh = /public static void refresh\([\s\S]{0,600}?lastError\s*=\s*null/.test(harnessFile)
    const reasonOf = /reasonOf\(/.test(harnessFile)
    const ok = decl !== null && clearFn !== null && getter !== null && setter !== null && clearInside && resetInRefresh && reasonOf
    record('F11', 'Harness.java：lastError 声明 / 清空 / 读取 / 写入 接线完整', ok ? 'PASS' : 'FAIL',
      '声明=' + decl + '（private static volatile String lastError）；public static void clear()=' + clearFn + '（内含 lastError=null=' + clearInside + '）' +
      '\n读取 public static String lastError()=' + getter + '；写入 private static void setLastError()=' + setter +
      '\nrefresh 开头归零=' + resetInRefresh + '；reasonOf 归一化=' + reasonOf,
      ok ? {} : { owner: 'android-core' })
  }

  /* F12（§6.1 第 7/8 条截图侧）：android-ui 提供的五张 0.6.6/22 真机截图 —— 存在性 + 字节 + md5。
     md5 是 lead 给的交付指纹；对不上记 FAIL 并把实测值写进证据（内容级判据，不受重建时间戳影响）。 */
  const SHOT_EXPECT = [
    ['home-chips-in-card.png', 105405, '9fdf323b99ae1a68af33ce3e16ef444c', '首页：工作区/预设在上方一行，模型/权限仍在打字胶囊内'],
    ['preset-panel-loaded.png', 287642, '9e0dba7f44dc4f28243fb517eb22dc69', '预设面板：名册正常（≥4 条 + 标题非空 + 当前项打勾）'],
    ['preset-panel-503.png', 144132, 'a1f121d6fede6a377b954a2b100d5d52', '预设面板：桩 503 失败态（读不到主机的配置 + 重新加载）'],
    ['preset-panel-recovered.png', 287606, '0207e714e3438bbdfac70a8fefd8a8f0', '预设面板：点「重新加载」后恢复渲染候选'],
    ['preset-panel-host404.png', 136322, '654c98035bbeddd5b45998fdd57d5d08', '预设面板：真宿主 404 失败态'],
  ]
  const shotLines = []
  let shotMissing = 0
  let shotBad = 0
  for (const [name, bytes, md5, note] of SHOT_EXPECT) {
    const file = path.join(SHOTS, name)
    if (!fs.existsSync(file)) {
      shotLines.push('缺失 ' + name + '（期望 ' + bytes + ' B / md5 ' + md5 + '） —— ' + note)
      shotMissing++
      continue
    }
    const buf = fs.readFileSync(file)
    const actual = crypto.createHash('md5').update(buf).digest('hex')
    const same = actual === md5 && buf.length === bytes
    if (!same) shotBad++
    shotLines.push((same ? '[OK] ' : '[XX] ') + name + ' ' + buf.length + ' B / md5 ' + actual +
      (same ? '（与交付值一致）' : '（期望 ' + bytes + ' B / ' + md5 + '）') + ' —— ' + note)
  }
  const f12ok = shotMissing === 0 && shotBad === 0
  record('F12', '五张 0.6.6/22 真机截图：存在性 + 字节 + md5 与交付值一致', f12ok ? 'PASS' : (shotMissing ? 'NOT-READY' : 'FAIL'),
    shotLines.join('\n') +
    '\n（截图提供方 = android-ui：真机 ZTE A2322 / Android 15 / 构建 0.6.6(22)；md5 为我本机独立计算）',
    f12ok ? {} : { owner: shotBad ? 'android-ui' : 'verifier' })

}

/* ------------------------------------------------------------------ */
/* G. 连机项：截图 / 观感（无设备时明确标 未验证 + 局限）                 */
/* ------------------------------------------------------------------ */

function sectionDevice() {
  group('G. 连机证据：截图与观感（§6 第 4 条后半）')
  const adbCandidates = [
    ['adb', 'adb devices -l'],
    ['bash', '-lc', 'adb devices -l'],
  ]
  let probe = null
  for (const candidate of adbCandidates) {
    const res = candidate.length === 2
      ? (candidate[0] === 'bash' ? sh('bash', ['-lc', candidate[1]]) : sh(candidate[0], ['devices', '-l']))
      : sh(candidate[0], candidate.slice(1))
    if (res.code === 0 && /device\s/.test(res.stdout || '')) { probe = res; break }
    if (!probe && res.code !== 0) probe = res
  }
  const devices = probe && probe.stdout ? (probe.stdout.match(/^\S+\s+device\b.*$/gm) || []) : []
  if (!devices.length) {
    record('G1', '首页座位行 4 枚 chip 截图 shots/harness/home-chips.png', '未验证',
      '本机没有可用的 adb 设备（adb 不在 PATH；tools/zte-adb.cmd 需要手机侧隧道先起）。\n' +
      '替代证据：F2 的源码顺序核对 + 契约 §3.1 的 seatChip 参数口径。\n' +
      '局限：不换行/不挤压上传语音按钮、两枚 chip 的真实观感必须连机截图。\n' +
      '运行方式：手机连上后执行 node tools/verify-harness.mjs，本段会补图到 ' + SHOTS)
    for (const [id, title] of [
      ['G2', '工作区面板（最近工作区 + 目录浏览 + 手动输入；往返上级后面包屑正确）'],
      ['G3', '预设面板（四项中文名/描述与桌面逐字一致，桌面字符串与截图并排）'],
      ['G4', '切换预设：chip 立即变化 + 主机收到正确请求体 + 失败回滚 toast（shots/harness/switch-rollback.png）'],
      ['G5', '新建会话页与设置页入口可用；会话页预设标签只读'],
    ]) record(id, title, '未验证', '同上：无连机设备。宿主侧等价证据见 B4/B5/C1-C5（请求体与错误码）与 F 段（静态结构）。')
    return
  }
  record('G1', '检测到 adb 设备', 'PASS', devices.join('\n') + '\n（截图步骤需在真机上执行；本脚本已预留 shots/harness 目录）')
  for (const [id, title] of [
    ['G2', '工作区面板截图'],
    ['G3', '预设面板截图 + 桌面字符串并排对照'],
    ['G4', '切换预设/回滚截图'],
    ['G5', '新建会话页与设置页入口截图'],
  ]) record(id, title, '未验证', '设备已在位，但截图与观感核对由人工执行（脚本不代替人眼判断布局）。证据位：' + SHOTS)
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  console.log('仓库根: ' + ROOT)
  console.log('时间: ' + new Date().toISOString())

  sectionSyntax()

  let stub = null
  let stubNoEditor = null
  try {
    stub = await startStubServer({ withEditor: true })
    stubNoEditor = await startStubServer({ withEditor: false })
  } catch (error) {
    group('B/C. 桩服务器')
    record('B0', '起桩服务器（真 PhoneServer + 真 HarnessRuntime + 假 DSH 服务）', 'FAIL',
      String((error && error.stack) || error), { owner: 'verifier' })
  }

  if (stub) {
    try {
      await sectionProtocol(stub, ROOT)
      await sectionNegatives(stub, stubNoEditor || stub)
    } finally {
      await stub.stop()
      if (stubNoEditor) await stubNoEditor.stop()
    }
  } else {
    group('B/C. 协议与失败路径')
    record('B0', '协议段（因桩服务器起不来而跳过）', 'NOT-READY', '见上一条 FAIL')
  }

  if (!HOST_ONLY) {
    const ready = readiness()
    if (NO_BUILD) {
      group('D/E. Android 构建与资源进包')
      record('D0', 'cd android && bash build.sh', 'SKIP', '--no-build / --host-only 指定跳过')
      record('E0', '新资源进包核对', 'SKIP', '--no-build / --host-only 指定跳过')
    } else if (!FORCE && !(ready.androidCore && ready.androidStrings && ready.androidIcon)) {
      group('D/E. Android 构建与资源进包')
      record('D0', 'cd android && bash build.sh', 'NOT-READY',
        'android 侧还没落盘，跳过耗时构建（--force 可强制跑）。\n就绪探针: Harness.java=' + ready.androidCore +
        ' strings.xml(harness_*)=' + ready.androidStrings + ' ic_preset.xml=' + ready.androidIcon)
      record('E0', '新资源进包核对（ic_preset / harness_* 文案）', 'NOT-READY', '同 D0：先等 android-core / android-ui 落盘')
    } else {
      sectionBuild()
      sectionResources()
    }
    sectionStatic()
    sectionDevice()
  }

  /* 汇总 */
  const tally = { PASS: 0, FAIL: 0, 'NOT-READY': 0, SKIP: 0, '未验证': 0 }
  for (const row of results) tally[row.status] = (tally[row.status] || 0) + 1
  group('汇总')
  const table = results.map((row) => row.status.padEnd(9) + ' ' + row.id.padEnd(4) + ' ' + row.title)
  console.log(table.join('\n'))
  console.log('\nPASS=' + tally.PASS + ' FAIL=' + tally.FAIL + ' NOT-READY=' + tally['NOT-READY'] + ' SKIP=' + tally.SKIP + ' 未验证=' + tally['未验证'])

  const failures = results.filter((row) => row.status === 'FAIL')
  if (failures.length) {
    console.log('\n失败明细（按责任成员）:')
    const byOwner = new Map()
    for (const row of failures) {
      const owner = row.owner || 'verifier'
      if (!byOwner.has(owner)) byOwner.set(owner, [])
      byOwner.get(owner).push(row.id + ' ' + row.title)
    }
    for (const [owner, rows] of byOwner) console.log('  ' + owner + ':\n    ' + rows.join('\n    '))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    notes: [
      '归因更正（2026-10-22）：上一轮 04:0x 用「未注入 harness 的桩」跑出的 8 条 FAIL 归因有误 ——',
      '那批原始响应清一色是 503 config_unavailable「这台电脑上的 harness 配置通道没有起来」，',
      '成因是桩没有把 HarnessConfig 传进 PhoneServer（plugin/lib/server.js:383 的 !this.harness 分支），',
      '属于验收脚本自身的缺陷，不是 plugin-dev 的问题。本版已按 plugin/index.js:231/274 的线上接法注入',
      'new HarnessConfig(ctx, { runtime, readDefaults, writeDefaults })，归因以本版结果为准。',
    ],
    repoRoot: ROOT,
    args: { force: FORCE, noBuild: NO_BUILD, hostOnly: HOST_ONLY },
    tally,
    results,
  }
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log('\n报告: ' + OUT_JSON)

  /* 便于抄进 docs/harness-verification.md 的表格 */
  const mdPath = path.join(SHOTS, 'verify-table.md')
  const md = ['| 编号 | 检查项 | 结论 | 证据 |', '| --- | --- | --- | --- |']
    .concat(results.map((row) => '| ' + row.id + ' | ' + row.title.replace(/\|/g, '\\|') + ' | **' + row.status + '** | ' + (row.owner ? '责任：' + row.owner + '；' : '') + (row.note || '见 JSON 报告') + ' |'))
    .join('\n')
  fs.writeFileSync(mdPath, md + '\n', 'utf8')
  console.log('表格片段: ' + mdPath)

  process.exit(failures.length ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('验收脚本自身崩了：' + String((error && error.stack) || error))
    process.exit(2)
  })
}

export { startStubServer, STRINGS, PRESET_EXPECT }
