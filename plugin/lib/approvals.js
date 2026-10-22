import crypto from 'node:crypto'

/**
 * 把 DSH 官方的 `approval/request` waterfall 接到手机上。
 *
 * 关键契约（从 app.asar 里 @deepseek-ai/dsh-user-approval 抽出来的）：
 *  - ApprovalService.decide() 用 `ctx.waterfall(scopeTarget(agent, agent), 'approval/request', req, () => 'unavailable')`
 *    发问；返回值必须是 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' 之一；
 *  - 监听者签名是 `(request, next) => outcome`；不调 next() 就"否决"后续监听者（包括浏览器 UI）；
 *  - 没人回答、回答抛错、或回答不在词表里 → 一律 'unavailable'（fail closed）；
 *  - request 形状：{ agent, toolName, callId?, reason?, signal? }，agent.id 就是会话 id。
 *
 * 所以这里注册一个 waterfall 监听者，行为分三种：
 *  1. 没有手机在线（没有 SSE 客户端）→ 直接 next()，桌面浏览器 UI 照常弹审批，零干扰；
 *  2. 有手机在线 → 接管：推给手机，等手机 POST /v1/sessions/{id}/answer；
 *  3. 手机超时没答 → 标记过期并把问题交回给下一个监听者（UI），最终仍没人答就是 'unavailable'。
 */

const DEFAULT_TIMEOUT_MS = 120000
const MAX_PENDING = 32

function signalOf(request) {
  const signal = request && request.signal
  return signal && typeof signal.addEventListener === 'function' ? signal : null
}

export class ApprovalBridge {
  /**
   * @param ctx cordis context
   * @param hooks.onNotice 把审批通知推给手机
   * @param hooks.hasPhone 是否有手机连着（决定接管还是让位给浏览器 UI）
   * @param hooks.timeoutMs 等手机回答的超时
   */
  constructor(ctx, hooks) {
    this.ctx = ctx
    this.hooks = hooks
    this.entries = new Map()
    this.waiters = new Map()
    this.registered = false
    this.dispose = null
    this.stats = { asked: 0, answered: 0, deferred: 0, expired: 0, closed: 0 }
  }

  /** 已经挂上 waterfall 监听者（与 DSH 版本强相关，注册失败会降级为 false）。 */
  get available() {
    return this.registered
  }

  get timeoutMs() {
    const value = Number(this.hooks.timeoutMs)
    return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_TIMEOUT_MS
  }

  start() {
    this.dispose = this.ctx.effect(() => {
      const off = this.ctx.on('approval/request', (request, next) => this.answer(request, next), { global: true })
      this.registered = true
      return () => {
        this.registered = false
        this.closed()
        try { off?.() } catch { /* 忽略 */ }
      }
    }, 'phone-harness: approval answerer')
  }

  /** 是否有手机在线。hook 缺失时按"有"处理（插件本来就是为了手机）。 */
  hasPhone() {
    try {
      const decide = this.hooks.hasPhone
      return typeof decide === 'function' ? decide() !== false : true
    } catch {
      return true
    }
  }

  /** waterfall 监听者本体。同步返回 Promise，绝不抛（抛了就是 fail closed）。 */
  answer(request, next) {
    try {
      this.stats.asked += 1
      if (!request || typeof request !== 'object') return Promise.resolve(next())
      if (!this.hasPhone()) {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }
      const agent = request.agent
      const sessionId = agent && typeof agent.id === 'string' ? agent.id : undefined
      if (!sessionId || typeof request.toolName !== 'string') {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }
      if (this.entries.size >= MAX_PENDING) {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }

      const eventId = crypto.randomUUID()
      const entry = {
        eventId,
        sessionId,
        toolName: request.toolName,
        callId: typeof request.callId === 'string' ? request.callId : undefined,
        reason: typeof request.reason === 'string' ? request.reason : '',
        status: 'open',
        revision: 1,
        createdAt: Date.now(),
      }
      this.entries.set(eventId, entry)
      this.publish(entry)

      return new Promise((resolve) => {
        let settled = false
        const signal = signalOf(request)
        const finish = (outcome) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          try { signal?.removeEventListener('abort', onAbort) } catch { /* 忽略 */ }
          this.waiters.delete(eventId)
          if (outcome === 'answered') return
          // 没拿到手机回答：把问题交回给下一个监听者（通常是浏览器 UI）。
          try { resolve(next()) } catch { resolve('unavailable') }
        }
        const onAbort = () => {
          const waiting = this.entries.get(eventId)
          if (waiting && waiting.status === 'open') {
            waiting.status = 'expired'
            waiting.revision += 1
            this.publish(waiting)
          }
          this.stats.closed += 1
          finish('aborted')
        }
        const timer = setTimeout(() => {
          const waiting = this.entries.get(eventId)
          if (waiting && waiting.status === 'open') {
            waiting.status = 'expired'
            waiting.revision += 1
            this.publish(waiting)
          }
          this.stats.expired += 1
          finish('timeout')
        }, this.timeoutMs)
        timer.unref?.()
        try { signal?.addEventListener('abort', onAbort, { once: true }) } catch { /* 忽略 */ }
        this.waiters.set(eventId, (outcome) => {
          const waiting = this.entries.get(eventId)
          if (waiting) {
            waiting.status = 'resolved'
            waiting.outcome = outcome
            waiting.revision += 1
            this.publish(waiting)
          }
          this.stats.answered += 1
          if (settled) return
          settled = true
          clearTimeout(timer)
          try { signal?.removeEventListener('abort', onAbort) } catch { /* 忽略 */ }
          this.waiters.delete(eventId)
          resolve(outcome)
        })
      })
    } catch {
      // 任何意外都 fail closed 到"交给下一个监听者"，不能把工具调用打死。
      try { return Promise.resolve(next()) } catch { return Promise.resolve('unavailable') }
    }
  }

  publish(entry) {
    try {
      this.hooks.onNotice?.({
        eventId: entry.eventId,
        sessionId: entry.sessionId,
        title: '请求批准：' + entry.toolName,
        toolName: entry.toolName,
        callId: entry.callId,
        reason: entry.reason || '这个操作需要你在手机上点一下。',
        status: entry.status,
        outcome: entry.outcome,
        revision: entry.revision,
        createdAt: entry.createdAt,
        actions: entry.status === 'open'
          ? [{ actionId: 'allow-once', label: '允许一次' }, { actionId: 'reject', label: '拒绝' }]
          : [],
      })
    } catch { /* 手机没连也不影响 DSH */ }
  }

  pending(eventId) {
    const entry = this.entries.get(eventId)
    return entry && entry.status === 'open' ? entry : null
  }

  /** 手机点了「允许一次 / 拒绝」。 */
  decide(eventId, action) {
    const entry = this.pending(eventId)
    if (!entry) {
      const error = new Error('这条审批已经处理过或已失效')
      error.code = 'approval_not_pending'
      throw error
    }
    const wait = this.waiters.get(eventId)
    if (!wait) {
      const error = new Error('DSH 已经不再等待这条审批了')
      error.code = 'approval_not_pending'
      throw error
    }
    const outcome = action === 'allow-once' ? 'allowed-once' : 'rejected'
    wait(outcome)
    return outcome
  }

  /** 手机拉取还没处理的审批（重连后补状态用）。 */
  listPending(sessionId) {
    const rows = []
    for (const entry of this.entries.values()) {
      if (entry.status !== 'open') continue
      if (sessionId && entry.sessionId !== sessionId) continue
      rows.push({ ...entry, actions: [{ actionId: 'allow-once', label: '允许一次' }, { actionId: 'reject', label: '拒绝' }] })
    }
    return rows
  }

  /** 会话被中断/结束：把还挂着的审批收掉。 */
  expireSession(sessionId) {
    for (const entry of this.entries.values()) {
      if (entry.sessionId !== sessionId || entry.status !== 'open') continue
      entry.status = 'expired'
      entry.revision += 1
      this.publish(entry)
    }
  }

  closed() {
    for (const entry of this.entries.values()) {
      if (entry.status === 'open') entry.status = 'expired'
    }
    // 让所有等待中的 waterfall 立刻退化为 next()，不要把插件卸载拖成工具超时。
    for (const [eventId, settle] of [...this.waiters]) {
      try { settle('cancelled') } catch { /* 忽略 */ }
      this.waiters.delete(eventId)
    }
  }

  close() {
    this.closed()
    return this.dispose ? Promise.resolve(this.dispose()) : Promise.resolve()
  }
}
