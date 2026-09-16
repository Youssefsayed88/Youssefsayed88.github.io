import Emitter from '../core/Emitter.js'

// Reads the platforms off the page.
//
// Every element marked `data-platform` in src/level/markup.js is measured from
// the real layout, in pixels relative to the level's own top-left corner. Those
// coordinates do not change when the page scrolls, which is what lets the body
// and the camera ignore each other: the robot lives in level space, the camera
// decides which part of it is on screen.
//
// Re-measured whenever the layout can have moved — a resize, a phone turned
// sideways, a font arriving late — and announced as `remeasure` with the old
// positions, so Game.js can keep the robot standing on the block it was on.
export default class Level extends Emitter {
  constructor(root) {
    super()
    this.root = root
    this.platforms = []
    this.byId = new Map()
    this.sections = []
    this.bounds = { left: 0, right: 0, top: 0, bottom: 0 }
    this.origin = { top: 0 }
    this.spawn = null
    this.portal = null

    this.measure()

    // The root's size is the one signal every reflow shares. A window resize is
    // listened to as well, because a width change that wraps no text leaves the
    // height — and so the observer — alone while every block moves sideways.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.remeasure()).observe(root)
    }
    window.addEventListener('resize', () => this.remeasure())
    document.fonts?.ready?.then(() => this.remeasure())
  }

  measure() {
    const origin = this.root.getBoundingClientRect()
    const relative = (el) => {
      const r = el.getBoundingClientRect()
      return {
        left: r.left - origin.left,
        right: r.right - origin.left,
        top: r.top - origin.top,
        bottom: r.bottom - origin.top,
      }
    }

    this.platforms = []
    for (const el of this.root.querySelectorAll('[data-platform]')) {
      const box = relative(el)
      // Hidden by a breakpoint: not a platform at this width.
      if (box.right - box.left < 1 || box.bottom - box.top < 1) continue
      this.platforms.push({
        id: el.dataset.platform,
        el,
        left: box.left,
        right: box.right,
        top: box.top,
        // Not used by the physics — a platform is only its top edge — but the
        // speech bubble hangs off the whole thumbnail.
        bottom: box.bottom,
        solid: el.hasAttribute('data-solid'),
        spawn: el.hasAttribute('data-spawn'),
        project: el.dataset.project ?? null,
      })
    }
    this.byId = new Map(this.platforms.map((p) => [p.id, p]))

    // The level's own box is the world: its sides are the walls, and the ground
    // at its foot spans it edge to edge.
    this.bounds = { left: 0, right: origin.width, top: 0, bottom: origin.height }
    this.origin = { top: origin.top + window.scrollY }

    this.sections = [...this.root.querySelectorAll('[data-section]')]
      .map((el) => ({ id: el.id, label: el.dataset.section, top: relative(el).top }))
      .sort((a, b) => a.top - b.top)

    this.spawn = this.platforms.find((p) => p.spawn) ?? this.platforms[0] ?? null

    const portal = this.root.querySelector('#portal')
    this.portal = portal ? relative(portal) : null
  }

  remeasure() {
    const before = this.byId
    this.measure()
    this.trigger('remeasure', before)
  }

  // The label of the section the feet are in, for the HUD.
  sectionAt(y) {
    let label = this.sections[0]?.label ?? ''
    for (const s of this.sections) if (s.top <= y + 1) label = s.label
    return label
  }

  platformForProject(projectId) {
    return this.platforms.find((p) => p.project === projectId) ?? null
  }
}
