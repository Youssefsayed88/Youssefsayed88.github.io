// DOM overlay for a project. Deliberately not rendered into WebGL — a <video>
// cannot be a texture worth watching, and real DOM keeps the text selectable and
// the links reachable by keyboard.
//
// Videos play in Plyr (src/ui/player.js), fetched the first time a panel with a
// video opens. Until it arrives — and for good if it never does — the <video>
// keeps the browser's own controls, so a slow or blocked chunk costs the styling
// and never the video.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export default class Modal {
  constructor(onToggle) {
    this.onToggle = onToggle
    this.open = false
    this.player = null
    // Bumped on every open and close, so a player that finishes loading after
    // its panel has already gone is never mounted onto the next one.
    this.session = 0

    this.root = document.getElementById('modal')
    this.panel = this.root.querySelector('.modal__panel')
    this.media = this.root.querySelector('.modal__media')
    this.body = this.root.querySelector('.modal__body')

    this.root.querySelector('.modal__close').addEventListener('click', () => this.close())
    this.root.querySelector('.modal__backdrop').addEventListener('click', () => this.close())

    window.addEventListener('keydown', (e) => {
      // Escape inside a fullscreen video leaves fullscreen; only the next one
      // closes the panel.
      if (e.code === 'Escape' && this.open && !document.fullscreenElement) this.close()
    })
  }

  // `onToggle` is handed the project as well as the state: the address bar
  // tracks whichever panel is open, so the caller has to know which one it is.
  show(project) {
    if (this.open) return
    this.open = true
    this.session++

    this.media.innerHTML = this.renderMedia(project)
    this.body.innerHTML = this.renderBody(project)
    // The body is the part that scrolls, never the panel: see .modal__body.
    this.body.scrollTop = 0

    this.root.hidden = false
    // Focus the close button so Tab stays inside the dialog and Escape is obvious.
    this.root.querySelector('.modal__close').focus()
    this.mountPlayer()
    this.onToggle?.(true, project)
  }

  close() {
    if (!this.open) return
    this.open = false
    this.session++

    // Destroyed before the markup goes, so Plyr cancels the download and drops
    // its listeners rather than leaving them attached to a detached node.
    try { this.player?.destroy() } catch { /* already torn down */ }
    this.player = null

    this.root.hidden = true
    this.media.innerHTML = ''
    this.onToggle?.(false, null)
  }

  mountPlayer() {
    const video = this.media.querySelector('video')
    if (!video) return

    const session = this.session
    import('./player.js')
      .then(({ createPlayer }) => {
        if (session !== this.session || !video.isConnected) return
        this.player = createPlayer(video)
      })
      .catch((error) => {
        console.warn('[modal] video player unavailable, keeping the browser controls', error)
      })
  }

  renderMedia(p) {
    if (p.video) {
      // A hosted file plays in the player; anything else (YouTube, Drive) is an
      // embed with that host's own controls.
      if (/\.(mp4|webm)$/i.test(p.video)) {
        // The project's own screenshot stands in until play is pressed.
        // `preload="metadata"` is right — these are 3-21 MB and most visitors
        // will never play them — but on its own it opens on a black rectangle,
        // which reads as a broken video rather than a paused one. The image is
        // already downloaded for the thumbnail, so the poster costs nothing.
        const poster = p.image
          ? ` poster="${esc(import.meta.env.BASE_URL + p.image)}"`
          : ''
        return `<video class="modal__video" src="${esc(p.video)}"${poster} controls playsinline preload="metadata"></video>`
      }
      return `<iframe class="modal__video" src="${esc(p.video)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${esc(p.title)} video"></iframe>`
    }
    if (p.image) {
      return `<img class="modal__image" src="${esc(import.meta.env.BASE_URL + p.image)}" alt="${esc(p.title)}">`
    }
    return `<div class="modal__image modal__image--empty">Capture pending</div>`
  }

  renderBody(p) {
    const eyebrow = [p.company, p.tech?.[0]].filter(Boolean).join(' · ')

    const role = p.role
      ? `<p class="modal__role">${esc(p.role)}</p>`
      : ''

    const tech = p.tech?.length
      ? `<ul class="modal__tech">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
      : ''

    const links = p.links?.length
      ? `<div class="modal__links">${p.links.map((l) =>
          `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`,
        ).join('')}</div>`
      : ''

    return `
      ${eyebrow ? `<p class="modal__eyebrow">${esc(eyebrow)}</p>` : ''}
      <h2 class="modal__title" id="modal-title">${esc(p.title)}</h2>
      ${role}
      <p class="modal__blurb">${esc(p.blurb)}</p>
      ${tech}
      ${links}
    `
  }
}
