// DOM overlay for a project. Deliberately not rendered into WebGL — an iframe
// or <video> cannot be a texture, and real DOM keeps the text selectable and
// the links reachable by keyboard.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

export default class Modal {
  constructor(onToggle) {
    this.onToggle = onToggle
    this.open = false

    this.root = document.getElementById('modal')
    this.panel = this.root.querySelector('.modal__panel')
    this.media = this.root.querySelector('.modal__media')
    this.body = this.root.querySelector('.modal__body')

    this.root.querySelector('.modal__close').addEventListener('click', () => this.close())
    this.root.querySelector('.modal__backdrop').addEventListener('click', () => this.close())

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.close()
    })
  }

  show(project) {
    if (this.open) return
    this.open = true

    this.media.innerHTML = this.renderMedia(project)
    this.body.innerHTML = this.renderBody(project)

    this.root.hidden = false
    // Focus the close button so Tab stays inside the dialog and Escape is obvious.
    this.root.querySelector('.modal__close').focus()
    this.onToggle?.(true)
  }

  close() {
    if (!this.open) return
    this.open = false
    this.root.hidden = true
    // Drop the iframe/video so audio cannot keep playing behind the scene.
    this.media.innerHTML = ''
    this.onToggle?.(false)
  }

  renderMedia(p) {
    if (p.video) {
      // A hosted file plays inline; anything else (YouTube, Drive) is an embed.
      if (/\.(mp4|webm)$/i.test(p.video)) {
        return `<video class="modal__video" src="${esc(p.video)}" controls playsinline preload="metadata"></video>`
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
