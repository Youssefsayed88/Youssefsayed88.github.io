// The basic page's video dialog: the same Plyr player the platformer's panel
// uses (src/ui/player.js), instead of the browser's own player in a new tab.
//
// Progressive enhancement. Each "Watch video" link still points at the file, so
// with JavaScript off — or before this module arrives — it opens as it always
// did. Plyr itself is fetched on the first click, as in Modal.js, and until it
// arrives the <video> keeps the browser's controls.

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
