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
