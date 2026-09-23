import { track } from '../core/analytics.js'

// One conversation, shared by both pages' chat UIs: the history, sending a
// question to the Worker, and the reply as it streams in. The UIs only draw
// what `onChange` hands them.
//
// Where the Worker is comes from <meta name="chat-endpoint">, which the build
// writes only when CHAT_URL is set (see src/chat/config.js). No meta, no chat:
// `ChatSession.available` is false and neither page shows it.

// The Worker enforces the same caps; these keep the page from sending what it
// would refuse. Keep in step with worker/src/index.js.
export const MAX_QUESTION = 500
const MAX_TURNS = 10

const FALLBACK_ERROR = 'My circuits are jammed right now. Try again in a minute, or email Youssef directly.'

export default class ChatSession {
  static get endpoint() {
    return document.querySelector('meta[name="chat-endpoint"]')?.content || null
  }

  static get available() {
    return !!ChatSession.endpoint
  }

  constructor({ onChange }) {
    this.onChange = onChange
    // { role: 'user' | 'assistant', content }
    this.messages = []
    this.busy = false
    this.error = null
    // The question whose answer failed, for the UI to put back in the field
    // once. The UI clears it.
    this.failed = null
    this.controller = null
  }

  get last() {
    return this.messages.at(-1) ?? null
  }

  async send(text) {
    const question = text.trim().slice(0, MAX_QUESTION)
    if (!question || this.busy) return

    this.messages.push({ role: 'user', content: question })
    const reply = { role: 'assistant', content: '' }
    this.messages.push(reply)
    this.busy = true
    this.error = null
    this.changed()

    // The question itself, capped, so the owner can see what visitors ask. The
    // panel says so. Never the answer.
    track('chat-question', {
      question: question.slice(0, 300),
      turn: this.messages.filter((m) => m.role === 'user').length,
    })

    this.controller = new AbortController()
    try {
      const response = await fetch(ChatSession.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The reply slot is not sent, and only the last few turns are.
        body: JSON.stringify({ messages: this.messages.slice(0, -1).slice(-MAX_TURNS * 2) }),
        signal: this.controller.signal,
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || FALLBACK_ERROR)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        reply.content += decoder.decode(value, { stream: true })
        this.changed()
      }
      reply.content += decoder.decode()
      if (!reply.content.trim()) throw new Error(FALLBACK_ERROR)
    } catch (error) {
      if (error.name === 'AbortError') return
      // A failed turn leaves no half-answer in the history the next question
      // would be sent with.
      this.messages.splice(-2, 2)
      this.error = error.message || FALLBACK_ERROR
      this.failed = question
      console.warn('[chat]', error)
    } finally {
      this.busy = false
      this.controller = null
      this.changed()
    }
  }

  stop() {
    this.controller?.abort()
  }

  changed() {
    this.onChange?.(this)
  }
}
