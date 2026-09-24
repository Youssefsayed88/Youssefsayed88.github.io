// The basic page's video dialog: the same Plyr player the platformer's panel
// uses (src/ui/player.js), instead of the browser's own player in a new tab.
//
// Progressive enhancement. Each "Watch video" link still points at the file, so
// with JavaScript off — or before this module arrives — it opens as it always
// did. Plyr itself is fetched on the first click, as in Modal.js, and until it
// arrives the <video> keeps the browser's controls.
//
// Also the page's analytics events that are not a link being followed (those
// are attributes in the markup, see src/core/analytics.js): a video played, a
// project link arrived by, and how far down the page a visitor read.

import { track } from './core/analytics.js'
import ChatSession from './chat/session.js'
import { renderReply } from './chat/render.js'
import ChatNudge from './chat/nudge.js'
import { PROJECT_PARAM } from './core/params.js'

const dialog = document.getElementById('video')
const media = dialog?.querySelector('.video__media')
let player = null
// Bumped on every open and close, so a player that finishes loading after its
// dialog has already closed is never mounted onto the next one.
let session = 0

function open(link) {
  session++
  const video = document.createElement('video')
  video.className = 'video__el'
  video.src = link.href
  if (link.dataset.poster) video.poster = link.dataset.poster
  video.controls = true
  video.playsInline = true
  video.preload = 'metadata'
  video.addEventListener('play', () => track('play-video', { project: link.dataset.project }), { once: true })
  media.replaceChildren(video)
  dialog.setAttribute('aria-label', link.dataset.title ? `${link.dataset.title} video` : 'Project video')
  dialog.showModal()

  const current = session
  import('./ui/player.js')
    .then(({ createPlayer }) => {
      if (current !== session || !video.isConnected) return
      player = createPlayer(video)
    })
    .catch((error) => {
      console.warn('[classic] video player unavailable, keeping the browser controls', error)
    })
}

function teardown() {
  session++
  // Destroyed before the markup goes, so Plyr cancels the download and drops its
  // listeners rather than leaving them attached to a detached node.
  try { player?.destroy() } catch { /* already torn down */ }
  player = null
  media.replaceChildren()
}

if (dialog && media) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-video]')
    // A modified click still means "open it somewhere else".
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    open(link)
  })

  dialog.querySelector('.video__close').addEventListener('click', () => dialog.close())
  // A click on the backdrop lands on the <dialog> itself; one on the panel does not.
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })
  dialog.addEventListener('close', teardown)
}

// Each section counts once, the first time its top comes a third of the way up
// the screen: the same line the rail marks the current section by. The rail
// lists the sections, by the element ids the level's sections share.
if ('IntersectionObserver' in window) {
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      seen.unobserve(entry.target)
      track('reach-section', { section: entry.target.id })
    }
  }, { rootMargin: '0px 0px -66% 0px' })
  for (const item of document.querySelectorAll('#rail [data-section-id]')) {
    const el = document.getElementById(item.dataset.sectionId)
    if (el) seen.observe(el)
  }
}

// Arrived by a project link, as a job application would send it. Only an id
// this page has, so a stale link is not counted as a project.
{
  const id = new URLSearchParams(location.search).get(PROJECT_PARAM)
  if (id && document.getElementById(`project-${id}`)) track('deep-link', { project: id })
}

// The chatbot, when the build has one: a panel down the side with the whole
// conversation. The same session and renderer as the level's (src/chat/), so
// only the drawing differs. A "Show me" in a reply scrolls to that project's
// card and marks it, as a ?project= link does.
{
  const panel = document.getElementById('chat-panel')
  const opener = document.getElementById('chat-open')
  if (panel && opener && ChatSession.available) {
    const log = panel.querySelector('.chat-panel__log')
    const greeting = log.firstElementChild
    const form = panel.querySelector('.chat__form')
    const input = panel.querySelector('.chat__input')
    const send = panel.querySelector('.chat__send')
    const suggestions = panel.querySelector('.chat__suggestions')
    const error = panel.querySelector('.chat-panel > .chat__error')
    const narrow = matchMedia('(max-width: 560px)')
    const projects = new Map([...document.querySelectorAll('.card[id^="project-"]')]
      .map((card) => [card.id.slice('project-'.length), card.querySelector('h3')?.textContent ?? '']))

    const showProject = (id) => {
      track('chat-project', { project: id })
      const card = document.getElementById(`project-${id}`)
      if (!card) return
      // On a phone the panel covers the page it would be pointing at.
      if (narrow.matches) close()
      document.querySelectorAll('.card.is-target').forEach((c) => c.classList.remove('is-target'))
      card.classList.add('is-target')
      card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    }

    const session = new ChatSession({ onChange: render })

    function render() {
      const nodes = [greeting]
      session.messages.forEach((m, i) => {
        const el = document.createElement('div')
        if (m.role === 'user') {
          el.className = 'chat-msg chat-msg--user'
          el.append(Object.assign(document.createElement('p'), { textContent: m.content }))
        } else if (!m.content && session.busy && i === session.messages.length - 1) {
          el.className = 'chat-msg chat-msg--bot'
          el.innerHTML = '<span class="chat-typing" aria-label="Typing"><i></i><i></i><i></i></span>'
        } else {
          el.className = 'chat-msg chat-msg--bot chat__reply'
          renderReply(el, m.content, { projects, hrefFor: (id) => `#project-${id}`, onProject: showProject })
        }
        nodes.push(el)
      })
      log.replaceChildren(...nodes)
      log.scrollTop = log.scrollHeight

      error.hidden = !session.error
      error.textContent = session.error ?? ''
      if (session.failed) {
        if (!input.value) input.value = session.failed
        session.failed = null
      }
      send.disabled = session.busy
      suggestions.hidden = session.messages.length > 0 || session.busy
    }

    const ask = (text) => {
      if (!text.trim() || session.busy) return
      input.value = ''
      session.send(text)
    }

    function open(from = 'button') {
      nudge.chatOpened()
      panel.hidden = false
      opener.setAttribute('aria-expanded', 'true')
      document.documentElement.classList.add('is-chatting')
      if (!matchMedia('(pointer: coarse)').matches) input.focus()
      track('chat-open', { from })
    }

    function close() {
      panel.hidden = true
      opener.setAttribute('aria-expanded', 'false')
      document.documentElement.classList.remove('is-chatting')
      opener.focus({ preventScroll: true })
    }

    // A few seconds in, a callout over the button offers the chat, and once
    // more after a video is closed.
    const nudge = new ChatNudge(document.getElementById('chat-nudge'), {
      open,
      isOpen: () => !panel.hidden,
      blocked: () => !!document.querySelector('dialog[open]'),
    })
    document.getElementById('video')?.addEventListener('close', () => nudge.again())

    opener.addEventListener('click', () => open())
    // The same offer in the header, for a visitor who reads before scrolling.
    // Hidden in the markup, since it does nothing without this script.
    const headerAsk = document.getElementById('ask-robot')
    if (headerAsk) {
      headerAsk.hidden = false
      headerAsk.addEventListener('click', () => open('header'))
    }
    panel.querySelector('.chat__close').addEventListener('click', close)
    panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') close() })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      ask(input.value)
    })
    suggestions.addEventListener('click', (event) => {
      const chip = event.target.closest('.chat__suggestion')
      if (chip) ask(chip.textContent)
    })
  }
}
