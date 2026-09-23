import { PROJECT_REF } from './refs.js'

// A reply as DOM, never as HTML: the text comes from a model, and a model can
// be talked into writing a <script> tag. So this builds nodes and sets
// textContent, and understands only what the prompt allows — paragraphs, "- "
// bullets, **bold** — plus the project references, emails and links.
//
// Called again on every streamed chunk with the whole text so far. A reference
// or a bold still being typed is held back until it is complete, so the reader
// never sees a stray "[[lu-" flicker into a link.

// Anything clickable inside a line: a project reference, a URL, an email.
const TOKENS = new RegExp(
  `${PROJECT_REF.source}|(https?://[^\\s)]+)|([\\w.+-]+@[\\w-]+\\.[\\w.-]+)`,
  'g',
)

// `projects` maps id -> title. `hrefFor(id)` is where a reference points with
// JavaScript's click handler aside; `onProject(id)` is what a click does.
export function renderReply(el, text, { projects, hrefFor, onProject }) {
  // An unfinished reference at the very end.
  let settled = text.replace(/\[\[?[a-z0-9-]*\]?$/, '')
  // An odd number of ** means the last one is still waiting for its pair.
  if ((settled.match(/\*\*/g)?.length ?? 0) % 2) {
    const at = settled.lastIndexOf('**')
    settled = settled.slice(0, at) + settled.slice(at + 2)
  }

  const blocks = []
  let list = null
  for (const raw of settled.split('\n')) {
    const line = raw.trim()
    if (!line) { list = null; continue }
    const bullet = /^[-*•]\s+/.exec(line)
    if (bullet) {
      if (!list) { list = document.createElement('ul'); blocks.push(list) }
      const li = document.createElement('li')
      inline(li, line.slice(bullet[0].length), { projects, hrefFor, onProject })
      list.append(li)
    } else {
      list = null
      const p = document.createElement('p')
      inline(p, line, { projects, hrefFor, onProject })
      blocks.push(p)
    }
  }
  el.replaceChildren(...blocks)
}

function inline(parent, line, ctx) {
  // Bold first, then links inside each run of text.
  const parts = line.split(/\*\*(.+?)\*\*/)
  parts.forEach((part, i) => {
    if (!part) return
    const into = i % 2 ? document.createElement('strong') : parent
    if (into !== parent) parent.append(into)
    links(into, part, ctx)
  })
}

function links(parent, text, { projects, hrefFor, onProject }) {
  let at = 0
  for (const match of text.matchAll(TOKENS)) {
    parent.append(text.slice(at, match.index))
    at = match.index + match[0].length
    const [whole, id, url, email] = match
    if (id) {
      // A reference to a project that does not exist is dropped, not shown.
      if (!projects.has(id)) continue
      const a = document.createElement('a')
      a.className = 'chat__ref'
      a.href = hrefFor(id)
      a.dataset.project = id
      a.textContent = 'Show me'
      a.setAttribute('aria-label', `Show ${projects.get(id)}`)
      a.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        onProject(id)
      })
      parent.append(' ', a)
    } else if (url || email) {
      const a = document.createElement('a')
      // A sentence's full stop is not part of the address.
      const clean = (url ?? email).replace(/[.,;:!?]+$/, '')
      a.href = url ? clean : `mailto:${clean}`
      if (url) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
      a.textContent = clean
      parent.append(a, whole.slice(clean.length))
    }
  }
  parent.append(text.slice(at))
}
