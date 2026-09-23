// The camera is the page's scroll position.
//
// The robot is drawn inside the level, so it scrolls with the blocks it is
// standing on for free — there is no frame where the two disagree. All this has
// to do is decide how far down the page to be.
//
// The page cannot be scrolled by hand while playing (see `is-playing` in the
// stylesheet); the camera owns it.

// How quickly the view closes on the robot, per second. Brisk enough that a fall
// never leaves the robot below the fold.
const FOLLOW = 7

// The portal's flight to the top: slower, so the whole page is seen going past.
const FLY = 3.2

// Within this many pixels of its target the camera counts as arrived.
const ARRIVED = 40

// Screen kept clear below the feet while the camera holds a bubble in view: the
// touch controls on a phone, a margin elsewhere.
const RESERVE_TOUCH = 190
const RESERVE = 28

// And above the bubble: the corner controls and section label on a phone, a
// margin elsewhere.
const RESERVE_TOP_TOUCH = 120
const RESERVE_TOP = 24

export default class Camera {
  constructor(level) {
    this.level = level
    this.y = window.scrollY
    this.lambda = FOLLOW
    this.settled = true
    // { top, bottom } in level coordinates — a speech bubble that should stay
    // on screen along with the robot. Set by Game.js each frame.
    this.keepVisible = null
    // Screen to keep clear below the feet instead of the default, in px: the
    // chat's input bar while it is open. Set by Game.js.
    this.reserveBottom = null
  }

  // Where the scroll position wants to be for this body.
  //
  // The feet sit a little below the middle of the screen — the page is read
  // downward, and down is where the next platform is — and the view leans the
  // way the body is moving vertically: well ahead of a fall, a little ahead of
  // a jump.
  targetFor(body) {
    const vh = window.innerHeight
    const origin = this.level.origin.top
    const lean = Math.max(-vh * 0.12, Math.min(vh * 0.22, body.verticalVelocity * 0.2))
    let y = origin + body.y - vh * 0.55 + lean

    // The bubble over the robot's head can reach above the top of the screen,
    // or under the corner controls on a phone. Scroll up just far enough to
    // show it, but never so far that the feet drop under the touch controls
    // or past the bottom of the screen.
    const keep = this.keepVisible
    if (keep) {
      const reserve = this.reserveBottom ?? (this.touch ? RESERVE_TOUCH : RESERVE)
      if (keep.top >= body.y) {
        // A bubble below the feet (the chat's, when there is no room above the
        // robot): scroll down just far enough to show its bottom.
        y = Math.max(y, origin + keep.bottom + reserve - vh)
      } else {
        const wanted = origin + keep.top - this.reserveTop
        const lowest = origin + body.y + reserve - vh
        y = Math.min(y, Math.max(wanted, lowest))
      }
    }

    return this.clamp(y)
  }

  get touch() {
    return document.body.classList.contains('has-touch-controls')
  }

  // Screen kept clear above a bubble: under the corner controls.
  get reserveTop() {
    return this.touch ? RESERVE_TOP_TOUCH : RESERVE_TOP
  }

  clamp(y) {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return Math.max(0, Math.min(max, y))
  }

  update(body, delta) {
    const target = this.targetFor(body)
    this.y += (target - this.y) * (1 - Math.exp(-this.lambda * delta))

    this.settled = Math.abs(target - this.y) < ARRIVED
    if (this.settled) this.lambda = FOLLOW

    this.apply()
  }

  snap(body) {
    this.y = this.targetFor(body)
    this.settled = true
    this.apply()
  }

  // A long, visible glide to wherever the body now is.
  fly() {
    this.lambda = FLY
    this.settled = false
  }

  apply() {
    const y = Math.round(this.y)
    if (y !== Math.round(window.scrollY)) window.scrollTo(0, y)
  }
}
