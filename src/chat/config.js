// Where the chatbot's Worker is, given to the build as CHAT_URL: a repository
// variable on deploy (.github/workflows/deploy.yml), or on the command line to
// try it against `wrangler dev`:
//
//   CHAT_URL=http://127.0.0.1:8787/chat npm run dev
//
// Unset, neither page carries the chat at all — no button, no panel, no
// script — so the site still builds and deploys before the Worker exists.
//
// The URL is not a secret; it is in the page for anyone to read. What guards
// the Worker is the Worker: see worker/src/index.js.

// Its own escape, not markup.js's: markup.js imports this file.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const env = globalThis.process?.env ?? {}

export const CHAT_URL = (env.CHAT_URL ?? '').trim()

// Goes in each page's head; src/chat/session.js reads it.
export function chatMeta() {
  return CHAT_URL ? `<meta name="chat-endpoint" content="${esc(CHAT_URL)}">` : ''
}
