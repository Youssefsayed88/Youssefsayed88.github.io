// The portfolio chatbot's back end: the one thing between a visitor's question
// and a model, so the API key never reaches a browser.
//
//   POST /chat  { messages: [{ role: 'user' | 'assistant', content }] }
//   -> 200 text/plain, the reply streamed as it is written
//   -> 4xx/5xx { error }, a message fit to show the visitor
//
// Gemini first (free tier, two models), Workers AI if Gemini is rate-limited,
// overloaded or too slow to start. The
// system prompt is built here from the portfolio's own data (src/chat/context.js,
// bundled in by wrangler), never taken from the request: a page that could send
// its own prompt would be a free general-purpose model for anyone who found it.
//
// What keeps it from being abused, in order: only the portfolio's origins get a
// CORS answer; each IP gets a few questions a minute; questions, history and
// replies are all capped; and the prompt keeps the model on the portfolio.

import { systemPrompt } from '../../src/chat/context.js'

// Tried in order, from what a probe of this key found on 2026-09-23: which
// free Gemini models have room shifts by the hour. At the time 3.6 Flash and
// 3 Flash Preview answered in 1-2 s; 3.5 Flash-Lite was held for 20 s and
// more before answering at all; the 2.5 models are closed to new keys. A busy
// model usually says so (503) within a second, so trying the next one is
// cheap. Thinking at its lowest: short factual answers from a page of context.
const GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
  { id: 'gemini-3-flash-preview', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
  { id: 'gemini-3.5-flash-lite', thinkingConfig: { thinkingLevel: 'MINIMAL' } },
]
const FALLBACK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// How long one Gemini model gets to produce the first words of a reply, and
// how long all of them get together, before Workers AI answers instead. An
// overloaded model can hold a request for most of a minute, and a visitor will
// not wait that long.
const FIRST_TEXT_MS = 5000
const GEMINI_BUDGET_MS = 8000

// A model that was busy or slow is left alone for a minute, and one that is
// gone (404) for an hour, so the next visitors do not wait on it too. Per
// Worker isolate: a fresh isolate tries everything again, which is fine.
const REST_MS = 60_000
const resting = new Map()
const rest = (id, ms) => resting.set(id, Date.now() + ms)
const isResting = (id) => (resting.get(id) ?? 0) > Date.now()

// Keep in step with src/chat/session.js, which trims before sending.
const MAX_QUESTION = 500
const MAX_TURNS = 10
// Earlier replies come back as history; they are the bot's own words, but the
// page could send anything in their place.
const MAX_REPLY_ECHO = 2000
const MAX_OUTPUT_TOKENS = 500

const ERRORS = {
  origin: 'This chat only answers on the portfolio itself.',
  busy: "You're asking faster than my circuits can keep up. Give it a minute.",
  invalid: "I couldn't read that question. Try asking it another way.",
  down: 'My circuits are jammed right now. Try again in a minute, or email Youssef directly.',
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
    }

    const { pathname } = new URL(request.url)
    if (pathname !== '/chat' || request.method !== 'POST') return error(404, 'Not found.', cors)
    if (!cors) return error(403, ERRORS.origin)

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const { success } = await env.CHAT_LIMITER.limit({ key: ip })
    if (!success) return error(429, ERRORS.busy, cors)

    const messages = parseMessages(await request.json().catch(() => null))
    if (!messages) return error(400, ERRORS.invalid, cors)

    // The tests shorten every wait; nothing sets these in production.
    const firstMs = Number(env.FIRST_TEXT_MS) || FIRST_TEXT_MS
    const budgetMs = Number(env.GEMINI_BUDGET_MS) || GEMINI_BUDGET_MS
    const restMs = env.REST_MS !== undefined ? Number(env.REST_MS) : REST_MS

    const providers = [
      ...GEMINI_MODELS.map((model) => ({
        name: model.id,
        gemini: true,
        run: (signal) => gemini(messages, env, model, signal, restMs),
      })),
      { name: FALLBACK_MODEL, run: () => workersAi(messages, env) },
    ]
    const started = Date.now()
    for (const provider of providers) {
      let ms = firstMs
      if (provider.gemini) {
        if (isResting(provider.name)) continue
        ms = Math.min(firstMs, started + budgetMs - Date.now())
        // Too little of the budget left to be worth starting another model.
        if (ms < Math.min(500, firstMs / 2)) continue
      }
      try {
        const { stream, timedOut } = await firstText(provider.run, ms)
        if (timedOut && provider.gemini) rest(provider.name, restMs)
        if (stream) {
          console.log(`[chat] answered by ${provider.name}, first words after ${Date.now() - started} ms`)
          return new Response(stream, {
            headers: {
              ...cors,
              'content-type': 'text/plain; charset=utf-8',
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
            },
          })
        }
      } catch (err) {
        console.error(`[chat] ${provider.name} failed:`, err?.message ?? err)
      }
    }
    return error(503, ERRORS.down, cors)
  },
}

// ---------------------------------------------------------------------------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin')
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return null
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function error(status, message, cors) {
  return Response.json({ error: message }, { status, headers: cors ?? {} })
}

// The conversation, or null if it is not one this Worker will answer. The last
// turn must be the visitor's, within the caps; older turns are kept, trimmed.
function parseMessages(body) {
  const raw = body?.messages
  if (!Array.isArray(raw) || !raw.length) return null
  const messages = []
  for (const m of raw.slice(-MAX_TURNS * 2)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null
    const content = m.content.trim().slice(0, m.role === 'user' ? MAX_QUESTION : MAX_REPLY_ECHO)
    if (content) messages.push({ role: m.role, content })
  }
  // History that starts on a reply has lost its question; drop it.
  while (messages[0]?.role === 'assistant') messages.shift()
  const last = messages.at(-1)
  if (!last || last.role !== 'user') return null
  return messages
}

// A provider's reply, once it has produced its first words within `ms`; null
// if it has not, or said no. The words already read are put back at the front
// of the stream. Past that point the reply is the visitor's: a provider that
// stalls mid-sentence cannot be swapped for another without starting over.
async function firstText(run, ms) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve('timeout') }, ms)
  })
  try {
    const stream = await Promise.race([run(controller.signal), timeout])
    if (stream === 'timeout') {
      console.warn(`[chat] no answer within ${ms} ms`)
      return { timedOut: true }
    }
    if (!stream) return {}
    const reader = stream.getReader()
    const first = await Promise.race([reader.read(), timeout])
    if (first === 'timeout' || first.done) {
      reader.cancel().catch(() => {})
      if (first === 'timeout') console.warn(`[chat] no words within ${ms} ms`)
      return { timedOut: first === 'timeout' }
    }
    clearTimeout(timer)
    return { stream: new ReadableStream({
      start(c) { c.enqueue(first.value) },
      async pull(c) {
        const { value, done } = await reader.read()
        done ? c.close() : c.enqueue(value)
      },
      cancel(reason) { return reader.cancel(reason) },
    }) }
  } finally {
    clearTimeout(timer)
  }
}

// Gemini's streaming endpoint, as a stream of reply text. Null when Gemini says
// no (rate limit, quota, overload), so the next provider gets a turn.
async function gemini(messages, env, model, signal, restMs) {
  if (!env.GEMINI_API_KEY) return null
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          // Short factual answers from a page of context; thinking would only
          // add latency.
          ...(model.thinkingConfig && { thinkingConfig: model.thinkingConfig }),
        },
      }),
    },
  )
  if (!response.ok || !response.body) {
    console.warn(`[chat] ${model.id} ${response.status}`, (await response.text().catch(() => '')).slice(0, 300))
    // Gone for good, or busy for now. Anything else (a 400) is this code's
    // fault and resting the model would only hide it.
    if (response.status === 404) rest(model.id, restMs * 60)
    else if (response.status === 429 || response.status >= 500) rest(model.id, restMs)
    return null
  }
  return sseText(response.body, (data) =>
    (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join(''))
}

// Workers AI's Llama, the same way. Its free allocation is small (roughly
// 50-100 conversations a day), which is fine for a fallback.
async function workersAi(messages, env) {
  const stream = await env.AI.run(FALLBACK_MODEL, {
    messages: [{ role: 'system', content: systemPrompt() }, ...messages],
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    stream: true,
  })
  // The streamed chunk format is not pinned down in the docs: accept both the
  // Workers AI shape and the OpenAI one.
  return sseText(stream, (data) => data.response ?? data.choices?.[0]?.delta?.content ?? '')
}

// Server-sent events in, plain text out: each `data:` line is parsed as JSON
// and `extract` pulls the text out of it.
function sseText(body, extract) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  const emit = (line, controller) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const text = extract(JSON.parse(payload))
      if (text) controller.enqueue(encoder.encode(text))
    } catch {
      // A malformed chunk loses a few words, not the reply.
    }
  }
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop()
      for (const line of lines) emit(line, controller)
    },
    flush(controller) {
      buffer += decoder.decode()
      for (const line of buffer.split(/\r?\n/)) emit(line, controller)
    },
  }))
}
