// The rail down the right side: a dot per section, and a fill that runs down the
// track as the robot makes its way down the page. Clicking a section hands its id
// to Game.js, which teleports the robot there.
//
// The markup is railMarkup in src/level/markup.js. classic.html carries the same
// logic inline (see build-classic.mjs), driven by the scroll position instead of
// the robot, and scrolls smoothly where this teleports.

// How long the current section's label shows after it changes, on a screen with
// no hover to show it.
const ANNOUNCE = 1.5

// Where `y` is along the sections whose tops are `tops`: the index of the one it
// is in, and how far down the track that puts the fill, from 0 at the first dot
// to 1 at the last. Between two dots the fill moves in proportion. Pure.
export function railProgress(y, tops) {
  const last = tops.length - 1
  if (last < 1) return { index: 0, progress: 0 }
  let index = 0
  for (let i = 0; i <= last; i++) if (tops[i] <= y + 1) index = i
  const span = index < last ? tops[index + 1] - tops[index] : 0
  const along = span > 0 ? Math.min(1, Math.max(0, (y - tops[index]) / span)) : 0
  return { index, progress: Math.min(1, (index + along) / last) }
}

export default class Rail {
  constructor(el, { onSelect }) {
    this.el = el
    this.items = el ? [...el.querySelectorAll('[data-section-id]')] : []
    this.ids = this.items.map((a) => a.dataset.sectionId)
    this.index = -1
    this.progress = -1
    this.timer = 0

    el?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-section-id]')
      if (!item) return
      event.preventDefault()
      // Focus left on the link would take the next Enter as another teleport.
      if (event.detail > 0) item.blur()
      onSelect(item.dataset.sectionId)
    })
  }

  // `y` and the section tops are in the same space: the level's.
  update(y, sections) {
    if (!this.el) return
    const top = new Map(sections.map((s) => [s.id, s.top]))
    const tops = this.ids.map((id) => top.get(id) ?? 0)
    const { index, progress } = railProgress(y, tops)

    const rounded = Math.round(progress * 1000) / 1000
    if (rounded !== this.progress) {
      this.progress = rounded
      this.el.style.setProperty('--progress', rounded)
    }

    if (index !== this.index) {
      this.items[this.index]?.classList.remove('is-active')
      this.items[this.index]?.removeAttribute('aria-current')
      this.items[index].classList.add('is-active')
      this.items[index].setAttribute('aria-current', 'true')
      // Not on the first frame: arriving at the top is not news.
      if (this.index !== -1) this.announce()
      this.index = index
    }
  }

  announce() {
    this.el.classList.add('is-announcing')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.el.classList.remove('is-announcing'), ANNOUNCE * 1000)
  }
}
