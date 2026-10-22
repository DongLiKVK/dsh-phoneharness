import fs from 'node:fs'
import os from 'node:os'

/**
 * 手机端抽屉底部那一列「是谁在用这台电脑」。
 *
 * 真源是电脑端 harness 登录的 DeepSeek 账号（platform 的 /auth-api/v0/users/current，
 * 由 DSH 的 deepseekAccount 服务投影成 {id, name, contact, avatarUrl}）。
 * 没登录 / 服务不在时退到操作系统用户名（<user> 之类），头像留空由手机画字母头像。
 *
 * 头像 URL 是平台 CDN 的地址，手机不一定能直连：这里把字节抓回来缓存在 dataRoot 下，
 * 手机走 /v1/me/avatar 取（带 Bearer 令牌），不吃手机的网络与证书差异。
 */

const CACHE_TTL_MS = 5 * 60 * 1000
const AVATAR_TTL_MS = 24 * 60 * 60 * 1000
const MAX_AVATAR_BYTES = 4 << 20
const AVATAR_TIMEOUT_MS = 8000

function sniffImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.length >= 6 && buffer.toString('latin1', 0, 3) === 'GIF') return 'image/gif'
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

function readJson(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function writeJson(file, value) {
  try {
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch { /* 写不了就只在内存里好使 */ }
}

function osUser() {
  try {
    const info = os.userInfo()
    const name = String(info.username || '').trim() || 'user'
    return { id: name, name, contact: null, avatarUrl: null, source: 'host' }
  } catch {
    return { id: 'user', name: 'user', contact: null, avatarUrl: null, source: 'host' }
  }
}

function pickProfile(result) {
  if (!result || typeof result !== 'object') return null
  // getProfile 的形状是 {status:'ready', value:{...}}；也兼容直接给 profile 的实现。
  const value = result.value && typeof result.value === 'object' ? result.value : result
  if (!value || typeof value !== 'object') return null
  if (result.status && result.status !== 'ready') return null
  const id = value.id == null ? '' : String(value.id)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const contact = typeof value.contact === 'string' ? value.contact : null
  const avatarUrl = typeof value.avatarUrl === 'string' && value.avatarUrl.startsWith('http') ? value.avatarUrl : null
  if (!id && !name && !avatarUrl) return null
  return { id: id || name, name: name || id, contact, avatarUrl, source: 'account' }
}

export class Identity {
  constructor({ ctx, file, version, logger }) {
    this.ctx = ctx
    this.file = file
    this.version = version
    this.logger = logger
    this.cached = null
    this.cachedAt = 0
    this.inflight = null
    this.avatarCache = null
  }

  /** 账号服务在不在：插件装在没登录的机器上时它就是 undefined。 */
  accountService() {
    for (const name of ['deepseekAccount', 'accountController']) {
      try {
        const service = this.ctx.get(name)
        if (service && typeof service === 'object') return service
      } catch { /* 没注册 */ }
    }
    return null
  }

  async fromAccount() {
    const service = this.accountService()
    if (!service || typeof service.getProfile !== 'function') return null
    const client = {
      version: this.version,
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const result = await service.getProfile(client)
    return pickProfile(result)
  }

  /** 当前用户：{id,name,contact,avatarUrl,source}；永不抛。 */
  async current(options) {
    const force = !!(options && options.force)
    const now = Date.now()
    if (!force && this.cached && now - this.cachedAt < CACHE_TTL_MS) return this.cached
    if (!force && this.inflight) return this.inflight
    const disk = force ? null : readJson(this.file)
    if (!force && !this.cached && disk && disk.user && now - Number(disk.at || 0) < CACHE_TTL_MS) {
      this.cached = disk.user
      this.cachedAt = Number(disk.at) || 0
      return this.cached
    }
    this.inflight = (async () => {
      let user = null
      try {
        user = await this.fromAccount()
      } catch (error) {
        this.logger?.warn?.('dsh-phoneharness: 读账号资料失败 %s', String((error && error.message) || error))
      }
      if (!user) {
        // 账号读不到时沿用上次的（登录过就有头像），否则退到系统用户名。
        const previous = this.cached || (disk && disk.user)
        user = previous && previous.source === 'account' ? previous : osUser()
      }
      this.cached = user
      this.cachedAt = Date.now()
      writeJson(this.file, { at: this.cachedAt, user })
      return user
    })()
    try {
      return await this.inflight
    } finally {
      this.inflight = null
    }
  }

  /** 头像字节：{bytes, type} 或 null。按 URL 缓存一天。 */
  async avatar() {
    const user = await this.current({})
    const url = user && user.avatarUrl
    if (!url) return null
    const now = Date.now()
    if (this.avatarCache && this.avatarCache.url === url && now - this.avatarCache.at < AVATAR_TTL_MS) return this.avatarCache
    const binFile = this.file.replace(/[^/\\]+$/, 'avatar.bin')
    const metaFile = this.file.replace(/[^/\\]+$/, 'avatar.json')
    const meta = readJson(metaFile)
    if (meta && meta.url === url && fs.existsSync(binFile) && now - Number(meta.at || 0) < AVATAR_TTL_MS) {
      try {
        const bytes = fs.readFileSync(binFile)
        if (bytes.length > 0) {
          this.avatarCache = { url, type: String(meta.type || 'image/png'), at: Number(meta.at) || 0, bytes }
          return this.avatarCache
        }
      } catch { /* 读不到就重新抓 */ }
    }
    const fetched = await this.download(url)
    if (!fetched) return null
    this.avatarCache = { url, type: fetched.type, at: now, bytes: fetched.bytes }
    try {
      fs.writeFileSync(binFile, fetched.bytes, { mode: 0o600 })
      writeJson(metaFile, { url, type: fetched.type, at: now })
    } catch { /* 缓存失败不影响本次返回 */ }
    return this.avatarCache
  }

  async download(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS)
    timer.unref?.()
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'image/*', 'user-agent': 'dsh-phoneharness/' + this.version },
      })
      if (!response.ok) return null
      const declared = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const length = Number(response.headers.get('content-length') || 0)
      if (length > MAX_AVATAR_BYTES) return null
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) return null
      // 平台 CDN 把 JPEG 标成 binary/octet-stream，按魔数认，别信 content-type。
      const type = sniffImage(buffer)
      if (!type) return null
      if (declared && !declared.startsWith('image/') && declared !== 'binary/octet-stream' && declared !== 'application/octet-stream') return null
      return { bytes: buffer, type }
    } catch (error) {
      this.logger?.warn?.('dsh-phoneharness: 取头像失败 %s', String((error && error.message) || error))
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
