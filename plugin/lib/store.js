import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const randomToken = () => crypto.randomBytes(32).toString('hex')

/** 设备令牌仓库：<dataRoot>/devices.json，权限 0600。 */
export class DeviceStore {
  constructor(file) {
    this.file = file
    this.devices = []
    this.load()
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (raw && Array.isArray(raw.devices)) {
        this.devices = raw.devices.filter((entry) => entry && typeof entry.token === 'string' && typeof entry.id === 'string')
      }
    } catch { /* 首次运行或文件损坏都从空开始 */ }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const temp = this.file + '.' + process.pid + '.tmp'
    fs.writeFileSync(temp, JSON.stringify({ version: 1, devices: this.devices }, null, 2), { mode: 0o600 })
    fs.renameSync(temp, this.file)
  }

  list() {
    return this.devices.map((entry) => ({
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      lastSeenAt: entry.lastSeenAt || null,
    }))
  }

  /**
   * 新设备：一个设备一条令牌，重新配对不覆盖旧设备。
   *
   * 入参既可能是字符串（"Xiaomi 14"），也可能是对象（{name,model,android}）——
   * 老客户端传对象时 String(对象) 会变成 "[object Object]"，面板上就没法认设备了。
   */
  add(input) {
    const source = input && typeof input === 'object' ? (input.name || input.model || input.label || '') : input
    const name = String(source == null ? '' : source).trim()
    const device = {
      id: 'dev_' + crypto.randomBytes(6).toString('hex'),
      name: (name || '手机').slice(0, 80),
      token: randomToken(),
      createdAt: Date.now(),
      lastSeenAt: null,
    }
    this.devices.push(device)
    this.save()
    return device
  }

  find(token) {
    if (typeof token !== 'string' || token.length < 32) return null
    return this.devices.find((entry) => entry.token === token) || null
  }

  touch(device) {
    const now = Date.now()
    if (device.lastSeenAt && now - device.lastSeenAt < 60000) return
    device.lastSeenAt = now
    try { this.save() } catch { /* 心跳失败不影响请求 */ }
  }

  revoke(id) {
    const before = this.devices.length
    this.devices = this.devices.filter((entry) => entry.id !== id)
    if (this.devices.length !== before) this.save()
    return this.devices.length !== before
  }
}

/** 一次性 6 位配对码，带 TTL。 */
export class PairingCode {
  constructor(ttlMs) {
    this.ttlMs = ttlMs
    this.code = null
    this.expiresAt = 0
    this.rotate()
  }

  rotate() {
    this.code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    this.expiresAt = Date.now() + this.ttlMs
    return this.code
  }

  get valid() {
    return this.code !== null && Date.now() < this.expiresAt
  }

  /** 校验并作废：一次配对成功后立刻换新码。 */
  consume(input) {
    if (!this.valid) return false
    const given = String(input == null ? '' : input).trim()
    if (given.length !== 6 || !/^\d{6}$/.test(given)) return false
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(this.code))) return false
    this.rotate()
    return true
  }
}
