import { placeBubble } from '../game/bubble.js'

// The speech bubble: the robot saying what it is standing on.
//
// A chat message over the robot's head, inside the level so it scrolls with the
// page, and moved along with the robot every frame while it walks the length
// of a thumbnail. It opens with a moment of typing dots, then the title, where
// it was built, the role line, and an Open button. Opening is still one step
// more than landing — E, the button, the touch Open button, or standing still
// while the bar along the bottom fills (see DWELL in Game.js) — so dropping
// through a shelf on the way down never throws a panel in anyone's face.

// How long the typing dots show, in game seconds. Short: it is a flourish, not
// a wait, and dropping down a shelf passes through several of these.
export const TYPING = 0.35

export default class Bubble {
  // `onTarget` mirrors the bubble onto the touch Open button, which is the same
  // affordance. `onActivate` fires when the bubble's own button is pressed.
  constructor(root, { onTarget, onActivate } = {}) {
    this.el = root.querySelector('#bubble')
    this.onTarget = onTarget
    this.onActivate = onActivate
    this.key = null
    this.dwell = -1
    this.typing = 0
    // The bubble's size, measured when its content or state changes rather than
    // every frame.
    this.size = null
    this.placed = ''
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

  // `target` is { key, kind, verb, eyebrow, title, detail }; `speaker` is
  // { x, top }, the robot's middle and the top of its head.
  show(target, speaker, bounds) {
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

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      this.typing = reduced ? 0 : TYPING
      this.el.classList.toggle('is-typing', this.typing > 0)
      // Pop in again even when it goes straight from one target to the next:
      // the animation only restarts if a style pass sees it hidden in between.
      if (!this.el.hidden) {
        this.el.hidden = true
        void this.el.offsetWidth
      }
      this.el.hidden = false
      this.measure()
      this.onTarget?.(target)
    }
    this.place(speaker, bounds)
  }

  // Game time, so the dots last as long at any frame rate and in a test.
  tick(delta) {
    if (!this.visible || this.typing <= 0) return
    this.typing -= delta
    if (this.typing > 0) return
    this.el.classList.remove('is-typing')
    this.measure()
  }

  measure() {
    this.size = { width: this.el.offsetWidth, height: this.el.offsetHeight }
    this.placed = ''
  }

  // Every frame while it is up, and whenever the layout moves under it.
  place(speaker, bounds) {
    if (!this.visible || !speaker || !this.size) return
    const at = placeBubble(speaker, this.size.width, bounds)
    const left = Math.round(at.left)
    const bottom = Math.round(at.bottom)
    const tail = Math.round(at.tail)
    this.box = { top: bottom - this.size.height, bottom }

    // Standing still is most of the time a bubble is up; write nothing then.
    const key = `${left},${bottom},${tail}`
    if (key === this.placed) return
    this.placed = key
    this.el.style.left = `${left}px`
    this.el.style.top = `${bottom}px`
    this.el.style.setProperty('--tail', `${tail}px`)
  }

  hide() {
    if (!this.el || this.key === null) return
    this.key = null
    this.box = null
    this.typing = 0
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
