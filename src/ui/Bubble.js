import { placeBubble } from '../game/bubble.js'

// The speech bubble: what a project says when the robot lands on it.
//
// It lives inside the level, next to the thumbnail it belongs to, so it scrolls
// with it and its tail can point at it. Title, where it was built, the role
// line, and an Open button. Opening is still one step more than landing — E,
// the button, the touch Open button, or standing still while the bar along the
// bottom fills (see DWELL in Game.js) — so dropping through a shelf on the way
// down never throws a panel in anyone's face.
export default class Bubble {
  // `onTarget` mirrors the bubble onto the touch Open button, which is the same
  // affordance. `onActivate` fires when the bubble's own button is pressed.
  constructor(root, { onTarget, onActivate } = {}) {
    this.el = root.querySelector('#bubble')
    this.onTarget = onTarget
    this.onActivate = onActivate
    this.key = null
    this.dwell = -1
    // The bubble's vertical extent in level coordinates, for the camera.
    this.box = null

    if (!this.el) return
    this.parts = {
      eyebrow: this.el.querySelector('.bubble__eyebrow'),
      title: this.el.querySelector('.bubble__title'),
      detail: this.el.querySelector('.bubble__detail'),
      verb: this.el.querySelector('.bubble__verb'),
      open: this.el.querySelector('.bubble__open'),
    }
    this.parts.open.addEventListener('click', (event) => {
      event.preventDefault()
      // Focus straight back to the game: a focused button takes the next Space
      // as another click instead of a jump.
      this.parts.open.blur()
      this.onActivate?.()
    })
  }

  get visible() {
    return !!this.el && !this.el.hidden
  }

  // `target` is { key, kind, verb, eyebrow, title, detail }; `anchor` is the
  // platform or portal it belongs to.
  show(target, anchor, bounds) {
    if (!this.el) return
    if (target.key !== this.key) {
      this.key = target.key
      // textContent, not interpolation: titles and roles are data.
      for (const name of ['eyebrow', 'title', 'detail', 'verb']) {
        this.parts[name].textContent = target[name] ?? ''
        this.parts[name].hidden = !target[name]
      }
      this.el.classList.toggle('is-portal', target.kind === 'portal')
      this.parts.open.setAttribute('aria-label', `${target.verb} ${target.title}`)
      this.dwell = -1
      this.setDwell(0)
      this.el.hidden = false
      this.onTarget?.(target)
    }
    this.place(anchor, bounds)
  }

  // Re-run on every show and whenever the layout moves under it.
  place(anchor, bounds) {
    if (!this.visible || !anchor) return
    const size = { width: this.el.offsetWidth, height: this.el.offsetHeight }
    const at = placeBubble(anchor, size, bounds)
    this.el.style.left = `${at.left}px`
    this.el.style.top = `${at.top}px`
    this.el.style.setProperty('--tail', `${at.tail}px`)
    this.el.dataset.side = at.side
    this.box = { top: at.top, bottom: at.top + size.height }
  }

  hide() {
    if (!this.el || this.key === null) return
    this.key = null
    this.box = null
    // A hidden button that still holds focus would keep Space bound to it.
    if (this.el.contains(document.activeElement)) document.activeElement.blur()
    this.el.hidden = true
    this.onTarget?.(null)
  }

  // 0..1, how close standing still is to opening the project.
  setDwell(fraction) {
    if (!this.el) return
    const value = Math.round(Math.min(1, Math.max(0, fraction)) * 200) / 200
    if (value === this.dwell) return
    this.dwell = value
    this.el.style.setProperty('--dwell', String(value))
  }
}
