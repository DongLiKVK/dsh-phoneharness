/**
 * DSH 事件 → 手机时间线（TimelineItem）。
 *
 * 只做「手机要看到的东西」：用户消息、助手文本、工具调用、系统标记、审批留痕。
 * 事件形状来自 DSH 会话日志（session/event 与 sessionQuery 读出来的 events 同构），
 * 与 @agents-anywhere/dsh-bridge-next 的 projection 对齐但刻意更小：
 * 手机屏幕不需要 reasoning 全文，也不需要 draft 级别的哈希校验。
 */

const PREVIEW = 400

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/** 手机上能直接看图：把 image block 的描述信息抽出来，正文不塞 base64。 */
function imageOf(block) {
  const ref = block && block.attachment
  if (!ref || typeof ref !== 'object') return null
  const attachmentId = String(ref.attachmentId || '')
  if (!attachmentId) return null
  return {
    attachmentId,
    mediaType: String(ref.mediaType || 'image/jpeg'),
    width: Number(ref.width) || 0,
    height: Number(ref.height) || 0,
    bytes: Number(ref.bytes) || 0,
    name: typeof ref.name === 'string' ? ref.name : '',
  }
}

function blockToItem(block, sessionId, key, index, role, status, seq) {
  if (!block || typeof block !== 'object') return null
  const id = sessionId + '|' + role + '|' + key + '|' + index
  const base = { id, seq, role, status }
  if (block.type === 'text') {
    return { ...base, kind: 'text', text: String(block.text || '') }
  }
  if (block.type === 'reasoning') {
    return { ...base, kind: 'marker', title: '思考', text: String(block.text || '').slice(0, PREVIEW) }
  }
  if (block.type === 'tool-call') {
    return {
      ...base,
      kind: 'tool',
      tool: {
        callId: String(block.id || id),
        name: String(block.name || 'tool'),
        status: status === 'running' ? 'running' : 'done',
        preview: previewOf(block.arguments),
      },
    }
  }
  if (block.type === 'image') {
    const image = imageOf(block)
    if (!image) return { ...base, kind: 'marker', title: '图片', text: '[图片]' }
    return { ...base, kind: 'image', text: '', image }
  }
  if (block.type === 'file') {
    const name = (block.attachment && block.attachment.name) || '文件'
    return { ...base, kind: 'marker', title: name, text: '[文件 ' + name + ']' }
  }
  return null
}

function previewOf(value) {
  if (value == null) return ''
  let text
  if (typeof value === 'string') text = value
  else {
    try { text = JSON.stringify(value) } catch { text = String(value) }
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > PREVIEW ? text.slice(0, PREVIEW) + '…' : text
}

/** 一个会话的时间线。append 事件、按 seq 覆盖、对外给 snapshot。 */
export class Timeline {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.items = new Map()
    this.throughSeq = -1
    this.turnStartSeq = -1
    this.turnId = null
    this.steps = new Map()
    this.drafts = new Map()
    this.status = 'idle'
    this.updatedAt = 0
    /** 会话标题：来自 session/title 事件（自动生成或用户改名都走它）。 */
    this.title = ''
    this.titleSeq = -1
  }

  set(id, item) {
    const previous = this.items.get(id)
    if (previous && previous === item) return null
    this.items.set(id, item)
    return item
  }

  remove(id) {
    return this.items.delete(id)
  }

  /** 事件入口。返回本次真正变化的 item 列表（供 SSE 增量推送）。 */
  apply(event) {
    if (!event || typeof event !== 'object') return []
    const seq = Number(event.seq)
    if (Number.isFinite(seq)) {
      if (seq <= this.throughSeq) return []
      this.throughSeq = seq
    }
    const changed = []
    const data = event.data || {}
    const stepKey = String(data.turn) + ':' + String(data.step)

    switch (event.type) {
      // 标题不在 header 里，而是以 session/title 事件存在日志里：
      //   data = { title, messageSeqs, source: {kind:'user'|'provider'|'fallback'} }
      // 改名会追加同样形状的新事件，所以「最后一条」就是当前标题。
      case 'session/title': {
        const title = String(data.title == null ? '' : data.title).replace(/\s+/g, ' ').trim()
        if (!title) break
        this.title = title
        this.titleSeq = Number.isFinite(seq) ? seq : this.titleSeq
        break
      }
      case 'turn/start': {
        this.turnStartSeq = seq
        this.turnId = this.sessionId + '|turn|' + String(seq)
        this.status = 'running'
        const item = { id: this.turnId, seq, role: 'system', kind: 'marker', status: 'done', title: '开始处理', text: '' }
        if (this.set(this.turnId, item)) changed.push(item)
        break
      }
      case 'turn/end': {
        const reason = (data.reason && data.reason.kind) || 'completed'
        this.status = reason === 'completed' ? 'idle' : reason === 'error' ? 'failed' : 'idle'
        for (const [id, item] of this.items) {
          if (item.status !== 'running') continue
          const closed = { ...item, status: reason === 'error' ? 'failed' : 'done' }
          this.items.set(id, closed)
          changed.push(closed)
        }
        if (this.turnId) {
          const item = { id: this.turnId, seq, role: 'system', kind: 'marker', status: 'done', title: reason === 'completed' ? '处理完成' : reason === 'error' ? '处理出错' : '已中断（' + reason + '）', text: '' }
          if (this.set(this.turnId, item)) changed.push(item)
        }
        this.turnId = null
        this.drafts.clear()
        break
      }
      case 'step/start': {
        this.steps.set(stepKey, seq)
        break
      }
      case 'user/message': {
        const source = data.source || {}
        if (source.kind !== 'user') break
        const content = Array.isArray(data.content) ? data.content : []
        const text = textOf(content)
        const id = this.sessionId + '|user|' + String(data.id || seq)
        // 纯图片、纯文件消息没有文本，也要落在时间线上。
        if (!text) {
          const images = content.filter((block) => block && block.type === 'image').map(imageOf).filter(Boolean)
          if (!images.length) {
            const files = content.filter((block) => block && block.type === 'file')
            if (!files.length) break
            const item = { id, seq, role: 'user', kind: 'marker', status: 'done', title: '发来文件', text: files.map((block) => (block.attachment && block.attachment.name) || '文件').join('、') }
            if (this.set(id, item)) changed.push(item)
            break
          }
          const item = { id, seq, role: 'user', kind: 'image', status: 'done', text: '', image: images[0] }
          if (this.set(id, item)) changed.push(item)
          break
        }
        const item = { id, seq, role: 'user', kind: 'text', status: 'done', text, images: content.filter((block) => block && block.type === 'image').map(imageOf).filter(Boolean) }
        if (!item.images.length) delete item.images
        if (this.set(id, item)) changed.push(item)
        break
      }
      case 'assistant/chunk': {
        const chunk = data.chunk || {}
        if (typeof chunk.index !== 'number') break
        const key = String(this.turnStartSeq) + ':' + String(this.steps.get(stepKey) || stepKey)
        const slots = this.drafts.get(key) || new Map()
        this.drafts.set(key, slots)
        const previous = slots.get(chunk.index)
        let block = previous && previous.block
        if (chunk.type === 'text-delta') {
          block = { type: 'text', text: ((block && block.type === 'text') ? block.text : '') + String(chunk.text || '') }
        } else if (chunk.type === 'reasoning-delta') {
          block = { type: 'reasoning', text: ((block && block.type === 'reasoning') ? block.text : '') + String(chunk.text || '') }
        } else if (chunk.type === 'tool-call-delta') {
          const old = block && block.type === 'tool-call' ? block : null
          block = {
            type: 'tool-call',
            id: chunk.id,
            name: chunk.name || (old && old.name) || 'tool',
            arguments: (old ? old.arguments : '') + String(chunk.argumentsDelta || ''),
          }
        } else if (chunk.type === 'block-end') {
          block = chunk.block
        }
        if (!block) break
        slots.set(chunk.index, { block, seq: previous ? previous.seq : seq })
        const item = blockToItem(block, this.sessionId, key, chunk.index, 'assistant', 'running', previous ? previous.seq : seq)
        if (item && this.set(item.id, item)) changed.push(item)
        break
      }
      case 'assistant/attempt': {
        const key = String(this.turnStartSeq) + ':' + String(this.steps.get(stepKey) || stepKey)
        for (const [index, value] of this.drafts.get(key) || []) {
          const item = blockToItem(value.block, this.sessionId, key, index, 'assistant', 'running', value.seq)
          if (item && this.remove(item.id)) changed.push({ id: item.id, removed: true })
        }
        this.drafts.delete(key)
        break
      }
      case 'assistant/message': {
        const key = String(this.turnStartSeq) + ':' + String(this.steps.get(stepKey) || stepKey)
        const message = data.message || {}
        const content = Array.isArray(message.content) ? message.content : []
        const drafts = this.drafts.get(key)
        const finals = new Set(content.filter((block) => block && block.type === 'tool-call').map((block) => block.id))
        for (const [index, value] of drafts || []) {
          if (value.block && value.block.type === 'tool-call' && !finals.has(value.block.id)) {
            const item = blockToItem(value.block, this.sessionId, key, index, 'assistant', 'done', value.seq)
            if (item && this.remove(item.id)) changed.push({ id: item.id, removed: true })
          }
        }
        content.forEach((block, index) => {
          const anchor = (drafts && drafts.get(index) && drafts.get(index).seq) || seq
          const item = blockToItem(block, this.sessionId, key, index, 'assistant', data.interrupted ? 'interrupted' : 'done', anchor)
          if (item && this.set(item.id, item)) changed.push(item)
        })
        this.drafts.delete(key)
        break
      }
      case 'tool/call': {
        const callId = String(data.callId || '')
        if (!callId) break
        const item = {
          id: this.sessionId + '|tool|' + callId,
          seq,
          role: 'tool',
          kind: 'tool',
          status: 'running',
          tool: { callId, name: String(data.name || 'tool'), status: 'running', preview: previewOf(data.arguments), resultPreview: '' },
        }
        if (this.set(item.id, item)) changed.push(item)
        break
      }
      case 'tool/result': {
        const message = data.message || {}
        const callId = String((data.meta && data.meta.callId) || message.toolCallId || '')
        const content = textOf(message.content) || previewOf(message.content)
        const key = callId ? 'tool|' + callId : 'tool|' + String(seq)
        const previous = this.items.get(this.sessionId + '|' + key)
        const isError = Boolean(data.error) || Boolean(message.isError)
        const item = {
          id: this.sessionId + '|' + key,
          seq,
          role: 'tool',
          kind: 'tool',
          status: isError ? 'failed' : 'done',
          tool: {
            callId: callId || key,
            name: (previous && previous.tool && previous.tool.name) || String(message.name || 'tool'),
            status: isError ? 'failed' : 'done',
            preview: (previous && previous.tool && previous.tool.preview) || '',
            resultPreview: previewOf(content),
          },
        }
        if (this.set(item.id, item)) changed.push(item)
        break
      }
      case 'approval/asked':
      case 'approval/decided': {
        const key = String(data.id || seq)
        const id = this.sessionId + '|approval|' + key
        const previous = this.items.get(id)
        const item = {
          id,
          seq,
          role: 'system',
          kind: 'permission',
          status: 'done',
          title: event.type === 'approval/asked' ? '请求批准' : '授权结果',
          text: previewOf(data),
          tool: previous && previous.tool ? previous.tool : undefined,
        }
        if (this.set(id, item)) changed.push(item)
        break
      }
      default: {
        if (String(event.type).startsWith('compaction/')) {
          const id = this.sessionId + '|compact|' + String(seq)
          const item = { id, seq, role: 'system', kind: 'marker', status: 'done', title: '上下文压缩', text: previewOf(data) }
          if (this.set(id, item)) changed.push(item)
        }
      }
    }
    if (Number.isFinite(seq) && seq > this.updatedAt) this.updatedAt = seq
    return changed
  }

  snapshot() {
    return [...this.items.values()].sort((left, right) => (left.seq || 0) - (right.seq || 0) || String(left.id).localeCompare(String(right.id)))
  }

  /** 只要 seq 大于 since 的条目（手机断线续传）。 */
  since(seq) {
    return this.snapshot().filter((item) => (item.seq || 0) > seq)
  }

  lastText() {
    const items = this.snapshot()
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if (item.kind === 'text' && item.text) return previewOf(item.text).slice(0, 160)
    }
    return ''
  }
}
