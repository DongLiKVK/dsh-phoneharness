/**
 * 自动更新检测 —— 面板「更新」卡片背后的逻辑。
 *
 * 三个来源，谁能给出可解析的版本号就采信谁，取最高版本：
 *   npm     registry.npmjs.org/<pkg>/latest        的 version        （包已发布到 npm 时）
 *   github  api.github.com/repos/<owner>/<repo>   releases/latest   （退化到 /tags）
 *   feed    配置项 updateFeed 指向的任意地址，返回 {"version":"x.y.z"} 即可
 *
 * 结果缓存在 <dataRoot>/update.json：面板每 5 秒轮询 /status，不能每次都打网络；
 * 默认 6 小时复查一次，点「立即检查」强制复查。任何网络失败都只是降级，不抛异常。
 */
import fs from 'node:fs'
import path from 'node:path'

const TIMEOUT_MS = 6000
const UA = 'dsh-phoneharness-update-check'

/** 6 小时：够及时，也不至于把 registry 打出限流。 */
export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000
/** 自动检查的最短间隔，防止配置写成 1 秒把网卡打满。 */
export const MIN_INTERVAL_MS = 5 * 60 * 1000

/** 'v0.4.8' / '0.4.8-rc.1' → { nums: [0,4,8], pre: 'rc.1' }；解析不出来返回 null。 */
export function parseVersion(value) {
  const text = String(value === null || value === undefined ? '' : value).trim().replace(/^v/i, '')
  if (!text) return null
  const match = /^(\d+(?:\.\d+)*)(?:[-+](.+))?$/.exec(text)
  if (!match) return null
  return { nums: match[1].split('.').map((part) => Number(part)), pre: match[2] || '' }
}

/** semver 大小比较：a>b → 1，a<b → -1，相等 → 0，任一侧解析不出来 → null。 */
export function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null
  const size = Math.max(left.nums.length, right.nums.length)
  for (let index = 0; index < size; index += 1) {
    const x = left.nums[index] || 0
    const y = right.nums[index] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  // 主版本相同：正式版 > 预发布版（0.4.8 > 0.4.8-rc.1）。
  if (!left.pre && right.pre) return 1
  if (left.pre && !right.pre) return -1
  if (left.pre === right.pre) return 0
  return left.pre > right.pre ? 1 : -1
}

function intervalOf(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < MIN_INTERVAL_MS) return DEFAULT_INTERVAL_MS
  return Math.min(number, 30 * 24 * 60 * 60 * 1000)
}

/** 带超时的 GET JSON：超时、断网、非 JSON 都变成 { ok:false }，调用方只做字符串处理。 */
async function getJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json', 'user-agent': UA },
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    return { ok: response.ok, status: response.status, body, message: response.ok ? '' : 'HTTP ' + String(response.status) }
  } catch (error) {
    const message = String((error && error.message) || error)
    return { ok: false, status: 0, body: null, message: /abort/i.test(message) ? '超时（' + String(TIMEOUT_MS / 1000) + 's）' : message }
  } finally {
    clearTimeout(timer)
  }
}

export class UpdateChecker {
  constructor(options) {
    const settings = options !== null && typeof options === 'object' ? options : {}
    this.current = String(settings.current || '')
    this.pkg = String(settings.pkg || 'dsh-phoneharness')
    this.repo = String(settings.repo || '')
    this.feed = String(settings.feed || '')
    this.file = String(settings.file || '')
    this.logger = settings.logger || null
    this.state = {
      version: 1,
      auto: settings.auto !== false,
      intervalMs: intervalOf(settings.intervalMs),
      checkedAt: 0,
      latest: '',
      source: '',
      error: '',
      sources: [],
    }
    this.inflight = null
    this.timer = null
    this.load()
  }

  /** 读上次的检查结果：宿主重启后先亮旧数据，再按需复查，面板不会空着。 */
  load() {
    if (!this.file) return
    let raw = null
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { raw = null }
    if (!raw || typeof raw !== 'object') return
    // 只信任已知字段，且版本号必须还能解析 —— 旧文件里写坏了也不至于让面板显示乱码版本。
    if (typeof raw.auto === 'boolean') this.state.auto = raw.auto
    this.state.intervalMs = intervalOf(raw.intervalMs || this.state.intervalMs)
    if (Number.isFinite(Number(raw.checkedAt))) this.state.checkedAt = Number(raw.checkedAt)
    if (parseVersion(raw.latest)) this.state.latest = String(raw.latest)
    this.state.source = typeof raw.source === 'string' ? raw.source : ''
    this.state.error = typeof raw.error === 'string' ? raw.error : ''
    this.state.sources = Array.isArray(raw.sources) ? raw.sources.slice(0, 8) : []
  }

  save() {
    if (!this.file) return
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 })
      fs.renameSync(tmp, this.file)
    } catch (error) {
      this.logger?.warn?.('dsh-phoneharness: 更新状态写盘失败：%s', String((error && error.message) || error))
    }
  }

  /** 面板与 /status 用的只读快照。 */
  snapshot() {
    const latest = this.state.latest
    const diff = latest && this.current ? compareVersions(latest, this.current) : null
    return {
      current: this.current,
      latest,
      source: this.state.source,
      updateAvailable: diff !== null && diff > 0,
      ahead: diff !== null && diff < 0,
      auto: this.state.auto,
      intervalMs: this.state.intervalMs,
      checkedAt: this.state.checkedAt,
      nextCheckAt: this.state.checkedAt ? this.state.checkedAt + this.state.intervalMs : 0,
      error: this.state.error,
      sources: this.state.sources,
      feed: Boolean(this.feed),
      repo: this.repo,
    }
  }

  setAuto(auto) {
    this.state.auto = auto !== false
    this.save()
    if (this.state.auto) void this.check(false).catch(() => undefined)
    return this.snapshot()
  }

  /** 缓存还新鲜就不用打网络。 */
  fresh() {
    return this.state.checkedAt > 0 && Date.now() - this.state.checkedAt < this.state.intervalMs
  }

  async check(force) {
    if (this.inflight) return this.inflight
    if (!force && this.fresh()) return this.snapshot()
    this.inflight = this.run().finally(() => { this.inflight = null })
    return this.inflight
  }

  async run() {
    const sources = await Promise.all([this.probeNpm(), this.probeGithub(), this.probeFeed()])
    const usable = sources
      .filter((entry) => entry.status === 'ok' && parseVersion(entry.version))
      .sort((x, y) => (compareVersions(y.version, x.version) || 0))
    const best = usable.length ? usable[0] : null
    this.state.checkedAt = Date.now()
    this.state.sources = sources.map((entry) => ({
      id: entry.id,
      status: entry.status,
      version: entry.version || '',
      message: entry.message || '',
    }))
    if (best) {
      this.state.latest = String(best.version)
      this.state.source = best.id
      this.state.error = ''
    } else {
      this.state.error = sources
        .filter((entry) => entry.message)
        .map((entry) => entry.id + ': ' + entry.message)
        .join('；') || '没有可用的发布源'
    }
    this.save()
    const snapshot = this.snapshot()
    if (snapshot.updateAvailable) {
      this.logger?.info?.('dsh-phoneharness: 发现新版本 %s（当前 %s，来源 %s）', snapshot.latest, snapshot.current, snapshot.source)
    }
    return snapshot
  }

  async probeNpm() {
    const url = 'https://registry.npmjs.org/' + encodeURIComponent(this.pkg) + '/latest'
    const result = await getJson(url)
    if (!result.ok) {
      const missing = result.status === 404
      return {
        id: 'npm',
        status: missing ? 'missing' : 'error',
        version: '',
        message: missing ? 'npm 上还没有发布 ' + this.pkg : result.message,
      }
    }
    const body = result.body || {}
    const version = String(body.version || (body['dist-tags'] && body['dist-tags'].latest) || '')
    return { id: 'npm', status: version ? 'ok' : 'error', version, message: version ? '' : 'npm 返回里没有 version' }
  }

  /** 从仓库 URL 里抠出 owner/name；占位地址（OWNER）直接跳过，不当成错误。 */
  githubRepo() {
    const match = /github\.com[/:]+([^/]+)\/([^/?#]+)/i.exec(this.repo)
    if (!match) return null
    const owner = String(match[1] || '')
    const name = String(match[2] || '').replace(/\.git$/i, '')
    if (!owner || !name) return null
    if (/^(owner|your-?name|username|example)$/i.test(owner)) return null
    return { owner, name }
  }

  async probeGithub() {
    const repo = this.githubRepo()
    if (!repo) {
      return { id: 'github', status: 'unconfigured', version: '', message: '仓库还是占位地址（OWNER），跳过 GitHub' }
    }
    const base = 'https://api.github.com/repos/' + repo.owner + '/' + repo.name
    const headers = { accept: 'application/vnd.github+json', 'user-agent': UA }
    const release = await getJsonWith(base + '/releases/latest', headers)
    if (release.ok) {
      const tag = String((release.body && (release.body.tag_name || release.body.name)) || '')
      if (parseVersion(tag)) return { id: 'github', status: 'ok', version: tag.replace(/^v/i, ''), message: '' }
    }
    const tags = await getJsonWith(base + '/tags', headers)
    if (tags.ok && Array.isArray(tags.body) && tags.body.length) {
      const tag = String(tags.body[0] && tags.body[0].name || '')
      if (parseVersion(tag)) return { id: 'github', status: 'ok', version: tag.replace(/^v/i, ''), message: '' }
    }
    const missing = (release.status === 404 || release.status === 0) && (tags.status === 404 || tags.status === 0)
    const detail = missing
      ? 'GitHub 上还没有 Release 或 Tag'
      : (release.status === 403 || tags.status === 403 ? 'GitHub API 限流（403），稍后再试' : (release.message || tags.message || 'GitHub 查询失败'))
    return { id: 'github', status: missing ? 'missing' : 'error', version: '', message: detail }
  }

  async probeFeed() {
    if (!this.feed) return { id: 'feed', status: 'skipped', version: '', message: '' }
    if (!/^https?:\/\//i.test(this.feed)) {
      return { id: 'feed', status: 'error', version: '', message: 'updateFeed 必须是 http(s) 地址' }
    }
    const result = await getJson(this.feed)
    if (!result.ok) return { id: 'feed', status: 'error', version: '', message: result.message }
    const body = result.body || {}
    const version = String(body.version || body.latest || body.tag_name || '')
    return { id: 'feed', status: parseVersion(version) ? 'ok' : 'error', version, message: parseVersion(version) ? '' : 'updateFeed 返回里没有可解析的 version' }
  }

  /** 宿主启动后延迟一次（别跟启动抢网络），之后按 intervalMs 复查。 */
  start(options) {
    this.stop()
    if (!this.state.auto) return
    const delay = Math.max(1000, Number(options && options.delayMs) || 8000)
    const kick = () => {
      if (!this.state.auto) return
      void this.check(false).catch(() => undefined)
    }
    this.timer = setTimeout(() => {
      kick()
      this.timer = setInterval(kick, this.state.intervalMs)
      if (typeof this.timer.unref === 'function') this.timer.unref()
    }, delay)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  stop() {
    if (!this.timer) return
    clearTimeout(this.timer)
    clearInterval(this.timer)
    this.timer = null
  }
}

/** getJson 的带 header 版本（GitHub 需要单独的 accept）。 */
async function getJsonWith(url, headers) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { ...headers } })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = null }
    return { ok: response.ok, status: response.status, body, message: response.ok ? '' : 'HTTP ' + String(response.status) }
  } catch (error) {
    const message = String((error && error.message) || error)
    return { ok: false, status: 0, body: null, message: /abort/i.test(message) ? '超时（' + String(TIMEOUT_MS / 1000) + 's）' : message }
  } finally {
    clearTimeout(timer)
  }
}
