// Landscape, insisted on as far as a web page is allowed to insist.
//
// There is no API that simply pins a page to landscape. `screen.orientation
// .lock()` exists, but every browser that implements it refuses unless the
// document is already fullscreen, and Safari on iOS does not implement it at
// all. So this does both halves of the honest version:
//
//  - The panel. Markup in index.html, revealed by a CSS media query — so it
//    covers the screen from the first paint, before this module or the ~800 kB
//    of engine behind it has loaded, and it cannot get out of step with what is
//    actually on screen.
//  - The lock. Offered as a button, because fullscreen needs a user gesture to
//    be granted at all. Where the API is missing the button stays hidden rather
//    than sitting there doing nothing.
//
// What is left for JavaScript is only what CSS cannot do: pause the game while
// the panel is up, and drop whatever direction the joystick was holding when
// the phone was turned.

// `pointer: coarse` keeps this to phones and tablets. A desktop window dragged
// tall and narrow is portrait too, and putting a "turn your device" panel over
// a mouse is telling someone to rotate a monitor.
const PORTRAIT = '(orientation: portrait) and (pointer: coarse)'

export default class Orientation {
  // `onChange(blocked)` fires on every transition AND once at construction, so
  // the caller never has to seed its own state from a second read of the query.
  constructor(onChange) {
    this.onChange = onChange
    this.query = window.matchMedia?.(PORTRAIT) ?? null
    this.button = document.getElementById('rotate-lock')

    this.bindLockButton()

    this.blocked = !!this.query?.matches
    this.onChange?.(this.blocked)

    this.query?.addEventListener('change', (event) => {
      this.blocked = event.matches
      this.onChange?.(this.blocked)
    })
  }

  get supportsLock() {
    return typeof screen !== 'undefined'
      && typeof screen.orientation?.lock === 'function'
      && !!document.documentElement.requestFullscreen
  }

  bindLockButton() {
    if (!this.button) return
    if (!this.supportsLock) return   // stays hidden; the panel still asks
    this.button.hidden = false
    this.button.addEventListener('click', () => this.lock())
  }

  // Fullscreen first, then lock: the lock is rejected outside fullscreen, and
  // both need to be inside the gesture that called this.
  async lock() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      }
      await screen.orientation.lock('landscape')
    } catch {
      // Refused, unsupported, or the user left fullscreen — either way the
      // panel is still up and still says which way to turn the phone, which is
      // the outcome this button was only ever a shortcut past.
    }
  }
}
