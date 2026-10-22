/** 极小的 HTTP 工具集：JSON 响应、错误体、请求体读取、CORS。 */
export const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export function sendJson(res, status, value, headers) {
  if (res.writableEnded) return
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, { ...JSON_HEADERS, ...(headers || {}), 'Content-Length': String(body.length) })
  res.end(body)
}

/**
 * 304：「跟上次一样，别重发」。
 *
 * 手机开一个会话就是 2.7MB / 3445 条，重开一次全量重下太浪费；带上 ETag 后
 * 内容没变只回一个空响应，App 直接用本地缓存。
 */
export function sendNotModified(res, etag) {
  if (res.writableEnded) return
  res.writeHead(304, { ETag: etag, 'Content-Length': '0' })
  res.end()
}

export function sendError(res, status, code, message, extra) {
  sendJson(res, status, { error: { code, message, ...(extra || {}) } })
}

/** 读请求体并 JSON.parse；超过 limit 抛 {code:'body_too_large'}。 */
export async function readJson(req, limit = 1 << 20) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) {
      const error = new Error('request body too large')
      error.code = 'body_too_large'
      throw error
    }
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    const error = new Error('request body is not valid JSON')
    error.code = 'bad_json'
    throw error
  }
}

/** 允许手机端跨域（WebView 或局域网浏览器调试时用）。 */
export function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type,x-phone-harness')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Max-Age', '600')
}

export function trim(text, max) {
  const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  return value.length > max ? value.slice(0, max) + '…' : value
}
