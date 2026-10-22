import crypto from 'node:crypto'

/**
 * 把 DSH 的 `user-questions/request` waterfall 接到手机上。
 *
 * 契约来源（app.asar 原文，别猜）：
 *  - @deepseek-ai/dsh-user-questions/lib/index.js 的 UserQuestionService.ask()：
 *      `ctx.waterfall(scopeTarget(agent, agent), 'user-questions/request', {...request, agent}, noAnswerer)`
 *    监听者签名 `(request, next) => Promise<answer>`；返回的 answer 必须是
 *    `{ answers: [{ id, selected: string[], custom?: string }] }`，
 *    并且要**恰好覆盖 request.questions 的每个 id 一次**，否则工具侧校验失败。
 *    跳过某题 = `selected: []` 且不带 custom。
 *  - request 形状：`{ questions, agent, signal, wait?: { callId, timed? } }`，
 *    `agent.id` 就是会话 id。
 *  - 两种模式（@deepseek-ai/dsh-tool-ask-user/lib/index.js）：
 *      legacy：`ask({ ...request, wait: { callId } })` —— 阻塞等待，我们 resolve
 *              出来的 answer 直接变成 tool result，模型继续往下走；
 *      timed ：`askTimed(request, callId, timeoutMs)` —— 同一个 waterfall，
 *              但 request.signal 会在窗口到期时 abort；超时后工具返回
 *              `{ pending: true, callId }`，此时题目仍处于 continued 状态，
 *              唯一合法的补答是 `ctx.userQuestions.answer(agent, callId, answer)`
 *              （它会 steer 一条 user-question-reply 用户消息进 agent）。
 *
 * 所以这个桥做两件事：
 *  1. waterfall 内回答（两种模式都覆盖）；
 *  2. 超时之后手机才点答案时，走 `userQuestions.answer(agent, callId, answer)` 补答
 *     （只对带 callId 且窗口已过、agent 还活着的条目生效）。
 *
 * 绝不能做的事：把工具调用打死。超时 / abort / 手机断线 / 任何异常都必须
 * `resolve(next())` 让位给浏览器 UI（最终没人答就是服务端的 NO_PROVIDER）。
 */

const DEFAULT_TIMEOUT_MS = 120000
const MAX_PENDING = 32
const KEEP_SETTLED = 64

function signalOf(request) {
  const signal = request && request.signal
  return signal && typeof signal.addEventListener === 'function' ? signal : null
}

/** 请求里的问题列表 → 手机端形状（multiSelect → multi_select，与工具 schema 同名）。 */
function normalizeQuestions(questions) {
  const list = Array.isArray(questions) ? questions : []
  return list.map((question) => {
    const id = String((question && question.id) || '')
    const row = {
      id,
      question: String((question && question.question) || ''),
    }
    if (question && typeof question.header === 'string' && question.header) row.header = question.header
    if (question && typeof question.detail === 'string' && question.detail) row.detail = question.detail
    if (question && Array.isArray(question.options)) {
      row.options = question.options
        .filter((option) => option && typeof option.label === 'string')
        .map((option) => (typeof option.description === 'string' && option.description
          ? { label: option.label, description: option.description }
          : { label: option.label }))
    }
    const multi = question && (question.multiSelect === true || question.multi_select === true)
    if (multi) row.multi_select = true
    return row
  })
}

export class QuestionBridge {
  /**
   * @param ctx cordis context
   * @param hooks.onNotice 把问题推给手机（runtime.emit）
   * @param hooks.hasPhone 是否有手机连着（server.clients.size > 0）
   * @param hooks.timeoutMs 等手机回答的超时
   */
  constructor(ctx, hooks) {
    this.ctx = ctx
    this.hooks = hooks || {}
    this.entries = new Map()
    this.waiters = new Map()
    this.registered = false
    this.dispose = null
    this.goneTimer = null
    this.stats = { asked: 0, answered: 0, deferred: 0, expired: 0, late: 0, closed: 0 }
  }

  get available() {
    return this.registered
  }

  get timeoutMs() {
    const value = Number(this.hooks.timeoutMs)
    return Number.isFinite(value) && value >= 1000 ? value : DEFAULT_TIMEOUT_MS
  }

  start() {
    this.dispose = this.ctx.effect(() => {
      const off = this.ctx.on('user-questions/request', (request, next) => this.answer(request, next), { global: true })
      this.registered = true
      return () => {
        this.registered = false
        this.closed()
        try { off?.() } catch { /* 忽略 */ }
      }
    }, 'phone-harness: user-questions answerer')
  }

  hasPhone() {
    try {
      const decide = this.hooks.hasPhone
      return typeof decide === 'function' ? decide() !== false : true
    } catch {
      return true
    }
  }

  /** waterfall 监听者本体。同步返回 Promise，绝不抛。 */
  answer(request, next) {
    try {
      this.stats.asked += 1
      if (!request || typeof request !== 'object') return Promise.resolve(next())
      const questions = normalizeQuestions(request.questions)
      if (!questions.length) return Promise.resolve(next())
      if (!this.hasPhone()) {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }
      const agent = request.agent
      const sessionId = agent && typeof agent.id === 'string' ? agent.id : undefined
      if (!sessionId) {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }
      if (this.openCount() >= MAX_PENDING) {
        this.stats.deferred += 1
        return Promise.resolve(next())
      }
      this.prune()

      const wait = request.wait && typeof request.wait === 'object' ? request.wait : null
      const timed = wait && wait.timed === true
      const callId = wait && typeof wait.callId === 'string' ? wait.callId : undefined
      const eventId = crypto.randomUUID()
      const entry = {
        eventId,
        sessionId,
        callId,
        timed,
        questions,
        status: 'open',
        revision: 1,
        createdAt: Date.now(),
      }
      this.entries.set(eventId, entry)
      this.publish(entry)

      return new Promise((resolve) => {
        let settled = false
        const signal = signalOf(request)
        const release = () => {
          clearTimeout(timer)
          try { signal?.removeEventListener('abort', onAbort) } catch { /* 忽略 */ }
          this.waiters.delete(eventId)
        }
        const giveUp = (status) => {
          if (settled) return
          settled = true
          release()
          const waiting = this.entries.get(eventId)
          if (waiting && waiting.status === 'open') {
            // timed 模式：窗口过了但题还 answerable，标成 pending 好让手机补答。
            waiting.status = timed && callId ? 'pending' : status
            waiting.revision += 1
            this.publish(waiting)
          }
          if (status === 'expired') this.stats.expired += 1
          else this.stats.closed += 1
          // 让位给下一个监听者（浏览器 UI）；没人接就是服务端的 NO_PROVIDER。
          try { resolve(next()) } catch { resolve(undefined) }
        }
        const onAbort = () => giveUp('aborted')
        const timer = setTimeout(() => giveUp('expired'), this.timeoutMs)
        timer.unref?.()
        try { signal?.addEventListener('abort', onAbort, { once: true }) } catch { /* 忽略 */ }
        this.waiters.set(eventId, {
          // 手机答了：resolve 成 answer 形状。
          deliver: (answers) => {
            const waiting = this.entries.get(eventId)
            if (waiting) {
              waiting.status = 'resolved'
              waiting.revision += 1
              this.publish(waiting)
            }
            this.stats.answered += 1
            if (settled) return
            settled = true
            release()
            resolve({ answers: answers.map((item) => ({
              id: item.id,
              selected: [...item.selected],
              ...(item.custom === undefined ? {} : { custom: item.custom }),
            })) })
          },
          // 会话被中断 / 插件卸载：让位给下一个监听者，绝不塞一个空答案（那会 BAD_ANSWER）。
          giveUp: () => giveUp('aborted'),
        })
      })
    } catch {
      try { return Promise.resolve(next()) } catch { return Promise.resolve(undefined) }
    }
  }

  openCount() {
    let count = 0
    for (const entry of this.entries.values()) {
      if (entry.status === 'open' || entry.status === 'pending') count += 1
    }
    return count
  }

  /** 推给手机。形状就是 SSE 'question' 的 payload，也是 GET /v1/questions 的一行。 */
  publish(entry) {
    try {
      const row = this.view(entry)
      this.hooks.onNotice?.(row)
    } catch { /* 手机没连也不影响 DSH */ }
  }

  view(entry) {
    return {
      eventId: entry.eventId,
      sessionId: entry.sessionId,
      callId: entry.callId,
      timed: entry.timed === true,
      status: entry.status,
      revision: entry.revision,
      createdAt: entry.createdAt,
      questions: entry.questions.map((question) => ({ ...question })),
    }
  }

  /** 手机拉当前还开着的问题（重连后补显示用）。 */
  listPending(sessionId) {
    const rows = []
    for (const entry of this.entries.values()) {
      if (entry.status !== 'open' && entry.status !== 'pending') continue
      if (sessionId && entry.sessionId !== sessionId) continue
      rows.push(this.view(entry))
    }
    rows.sort((left, right) => left.createdAt - right.createdAt)
    return rows
  }

  /**
   * 手机提交答案。
   *
   * 三种结局：
   *  - 还在 waterfall 窗口内 → 直接 resolve，本轮 tool result 就是答案；
   *  - 窗口已过、但 timed + callId 且 agent 还活着 → userQuestions.answer() 补答，
   *    以 steer 的用户消息形式进 agent；
   *  - 其余 → 抛 question_not_pending。
   */
  submit(sessionId, eventId, answers, signal) {
    const entry = this.entries.get(eventId)
    if (!entry) {
      const error = new Error('这个提问已经处理过或已失效')
      error.code = 'question_not_pending'
      throw error
    }
    if (sessionId && entry.sessionId !== sessionId) {
      const error = new Error('这个提问不属于该会话')
      error.code = 'question_not_pending'
      throw error
    }
    if (entry.status === 'resolved' || entry.status === 'expired') {
      const error = new Error('这个提问已经处理过或已失效')
      error.code = 'question_not_pending'
      throw error
    }
    const batch = validateAnswers(entry.questions, answers)

    const wait = this.waiters.get(eventId)
    if (wait && entry.status === 'open') {
      wait.deliver(batch)
      return { ok: true, delivered: 'inline' }
    }

    // 窗口已过：只能走 continued 补答（timed + callId）。
    const live = entry.timed && entry.callId ? this.liveAgent(entry.sessionId) : undefined
    const service = this.ctx.get('userQuestions')
    if (!live || !service || typeof service.answer !== 'function') {
      const error = new Error(entry.callId && entry.timed
        ? '这个话题的等待窗口已经结束，且会话当前不在运行，答案送不进去了'
        : '这个提问已经处理过或已失效')
      error.code = 'question_not_pending'
      throw error
    }
    let accepted = false
    try {
      accepted = service.answer(live, entry.callId, {
        answers: batch.map((item) => ({
          id: item.id,
          selected: [...item.selected],
          ...(item.custom === undefined ? {} : { custom: item.custom }),
        })),
      })
    } catch (error) {
      const failed = new Error('补答失败：' + String((error && error.message) || error))
      failed.code = 'question_not_pending'
      throw failed
    }
    if (!accepted) {
      const error = new Error('这个提问已经不再接受回答')
      error.code = 'question_not_pending'
      throw error
    }
    entry.status = 'resolved'
    entry.revision += 1
    this.publish(entry)
    this.stats.late += 1
    return { ok: true, delivered: 'continuation' }
  }

  liveAgent(sessionId) {
    try {
      const agents = this.ctx.get('agents')
      if (!agents || typeof agents.get !== 'function') return undefined
      const agent = agents.get(sessionId)
      return agent && typeof agent.steer === 'function' ? agent : undefined
    } catch {
      return undefined
    }
  }

  /**
   * 手机 SSE 全断了。
   *
   * 不能立刻放弃：手机只是切了个后台，重连后还会 GET /v1/questions 补显示、再 POST
   * 答案。所以给一个宽限期（默认 10 秒），期间连回来就取消；宽限期过了还没连上，
   * 才把还开着的问题让位给下一个监听者（浏览器 UI）。
   */
  phoneDetached(graceMs = 10000) {
    if (this.goneTimer) return
    this.goneTimer = setTimeout(() => {
      this.goneTimer = null
      if (this.hasPhone()) return
      this.abandonAll('aborted')
    }, Math.max(1000, Number(graceMs) || 10000))
    this.goneTimer.unref?.()
  }

  /** 手机连回来了：取消宽限期。 */
  phoneAttached() {
    if (!this.goneTimer) return
    clearTimeout(this.goneTimer)
    this.goneTimer = null
  }

  /** 把所有还开着的问题让位给下一个监听者（会话中断 / 手机长时间离线 / 卸载）。 */
  abandonAll(status = 'aborted') {
    for (const entry of this.entries.values()) {
      if (entry.status !== 'open') continue
      entry.status = entry.timed && entry.callId ? 'pending' : status
      entry.revision += 1
      this.publish(entry)
    }
    for (const [eventId, handle] of [...this.waiters]) {
      try { handle.giveUp() } catch { /* 忽略 */ }
      this.waiters.delete(eventId)
    }
  }

  /** 会话被中断/结束：把还挂着的问题收掉（已经 answerable 的保留成 pending 不动）。 */
  expireSession(sessionId) {
    for (const entry of this.entries.values()) {
      if (entry.sessionId !== sessionId || entry.status !== 'open') continue
      entry.status = 'expired'
      entry.revision += 1
      this.publish(entry)
    }
    for (const [eventId, handle] of [...this.waiters]) {
      const entry = this.entries.get(eventId)
      if (!entry || entry.sessionId !== sessionId) continue
      try { handle.giveUp() } catch { /* 忽略 */ }
    }
  }

  closed() {
    for (const entry of this.entries.values()) {
      if (entry.status === 'open') entry.status = 'expired'
    }
    for (const [eventId, handle] of [...this.waiters]) {
      try { handle.giveUp() } catch { /* 忽略 */ }
      this.waiters.delete(eventId)
    }
    this.prune()
  }

  /** 已完成/失效的条目留一小截，够手机补答和排查就行。 */
  prune() {
    if (this.entries.size <= KEEP_SETTLED) return
    const settled = [...this.entries.values()]
      .filter((entry) => entry.status !== 'open' && entry.status !== 'pending')
      .sort((left, right) => left.createdAt - right.createdAt)
    for (const entry of settled) {
      if (this.entries.size <= KEEP_SETTLED) break
      this.entries.delete(entry.eventId)
    }
  }

  close() {
    this.phoneAttached()
    this.closed()
    return this.dispose ? Promise.resolve(this.dispose()) : Promise.resolve()
  }
}

/**
 * 手机提交的答案必须恰好覆盖每个问题一次（服务端 BAD_ANSWER 的同一判据）。
 * 跳过的题给 selected: [] 且不带 custom。
 */
export function validateAnswers(questions, answers) {
  const list = Array.isArray(answers) ? answers : null
  if (!list) {
    const error = new Error('answers 必须是数组')
    error.code = 'bad_answer'
    throw error
  }
  const seen = new Set()
  const output = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      const error = new Error('answers 里每一项都必须是对象')
      error.code = 'bad_answer'
      throw error
    }
    const id = String(item.id == null ? '' : item.id)
    const known = questions.find((question) => question.id === id)
    if (!known) {
      const error = new Error('答案里的问题 id 不属于这次提问：' + (id || '(空)'))
      error.code = 'bad_answer'
      throw error
    }
    if (seen.has(id)) {
      const error = new Error('同一个问题被回答了两次：' + id)
      error.code = 'bad_answer'
      throw error
    }
    seen.add(id)
    const selected = Array.isArray(item.selected) ? item.selected.map((value) => String(value)) : null
    if (!selected) {
      const error = new Error('答案缺少 selected 数组：' + id)
      error.code = 'bad_answer'
      throw error
    }
    // 只有单选时允许多选才有意义；这里不强校验数量（模型侧自己看 multi_select）。
    const row = { id, selected }
    if (typeof item.custom === 'string' && item.custom.trim()) row.custom = item.custom.trim()
    output.push(row)
  }
  for (const question of questions) {
    if (seen.has(question.id)) continue
    const error = new Error('缺少问题的答案：' + question.id + '（跳过请给 selected: []）')
    error.code = 'bad_answer'
    throw error
  }
  // 保持请求里的问题顺序，模型看起来更顺。
  return questions.map((question) => output.find((item) => item.id === question.id))
}
