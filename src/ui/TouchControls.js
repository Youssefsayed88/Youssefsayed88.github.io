// On-screen controls for touch.
//
// A floating joystick, a jump button, and an Open button that takes over from
// the "press E" part of the HUD card. All DOM — it costs nothing to draw, it
// scales with the device's own font settings, and the buttons are real
// <button>s, so they are focusable and announced.
//
// The stick is read side-on now: its horizontal deflection runs, and a firm
// push DOWN drops through the platform underfoot (see DROP_AT in Input.js).
// Jumping stays on its own button, because a platformer jump has to be pressed
// while the other thumb is still steering.

const STICK_RADIUS = 54     // px of travel to full deflection

// Horizontal deflection at which the sprint kicks in, in stick radii. Greater
// than 1 on purpose: the stick is analogue, so everything up to the rim is
// already a speed control, and sprint has to be a deliberate push past it.
// Input.js reads this same constant, so the ring cannot light at a different
// point from the one that sprints.
export const SPRINT_AT = 1.25

// How far past the rim the knob may travel, so crossing SPRINT_AT is visible.
const RECENTRE = 0.35

// How far down the stick has to be pushed to drop through a platform. Well past
// the deadzone: a thumb pushing sideways drifts down a little, and falling
// through a thumbnail you meant to run along is the worst misread this input can
// make. Input.js reads the same constant for a gamepad stick.
export const DROP_AT = 0.6

export default class TouchControls {
  constructor(input) {
    this.input = input
    this.enabled = false
    this.visible = true
    this.pointer = null

    this.build()

    // Show immediately on a phone or tablet. A hybrid waits for a real touch;
    // `Input` calls reveal() on the first touch pointer.
    if (window.matchMedia?.('(pointer: coarse)').matches) this.reveal()
  }

  build() {
    const root = document.createElement('div')
    root.className = 'touch'
    root.hidden = true
    root.innerHTML = `
      <div class="touch__pad" aria-hidden="true">
        <div class="touch__base">
          <div class="touch__ring"></div>
          <div class="touch__knob"></div>
        </div>
      </div>
      <div class="touch__actions">
        <button class="touch__btn touch__btn--jump" type="button">Jump</button>
        <button class="touch__btn touch__btn--open" type="button" disabled>Open</button>
      </div>
    `
    document.body.appendChild(root)

    this.root = root
    this.pad = root.querySelector('.touch__pad')
    this.base = root.querySelector('.touch__base')
    this.knob = root.querySelector('.touch__knob')
    this.jumpBtn = root.querySelector('.touch__btn--jump')
    this.openBtn = root.querySelector('.touch__btn--open')

    this.homeBase()
    this.bindStick()
    this.bindButtons()
    this.setPrompt(null)
  }

  reveal() {
    if (this.enabled) return
    this.enabled = true
    this.root.hidden = !this.visible
    document.body.classList.add('has-touch-controls')
  }

  // Hidden behind the project panel, whose own controls are the only ones that
  // should be reachable there.
  setVisible(visible) {
    this.visible = visible
    if (this.enabled) this.root.hidden = !visible
    if (!visible) this.release()
  }

  // Fed by the HUD: lit, and named, while the robot stands on something that
  // opens. `target` is the HUD card's description, or null.
  setPrompt(target) {
    this.openBtn.disabled = !target
    this.openBtn.classList.toggle('is-live', !!target)
    this.openBtn.textContent = target?.verb ?? 'Open'
    this.openBtn.setAttribute(
      'aria-label',
      target ? `${target.verb} ${target.title}` : 'Stand on a project to open it',
    )
  }

  // --- joystick -----------------------------------------------------------

  homeBase() {
    this.base.style.left = ''
    this.base.style.top = ''
    this.base.classList.remove('is-active', 'is-dropping', 'is-sprinting')
    this.knob.style.transform = ''
  }

  bindStick() {
    const pad = this.pad

    pad.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      pad.setPointerCapture(event.pointerId)
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }

      // A floating stick: the base jumps to wherever the thumb landed.
      const rect = pad.getBoundingClientRect()
      this.base.style.left = `${event.clientX - rect.left}px`
      this.base.style.top = `${event.clientY - rect.top}px`
      this.base.classList.add('is-active')
    })

    pad.addEventListener('pointermove', (event) => {
      if (this.pointer?.id !== event.pointerId) return
      event.preventDefault()

      const dx = (event.clientX - this.pointer.x) / STICK_RADIUS
      const dy = (event.clientY - this.pointer.y) / STICK_RADIUS
      const length = Math.hypot(dx, dy)
      const clamp = length > 1 ? 1 / length : 1

      this.input.touchAxis.x = Math.abs(dx) < 0.12 ? 0 : dx * clamp
      // Unclamped, because sprint is "push further" past full deflection — and
      // horizontal only, so pushing down to drop can never also sprint.
      this.input.touchDepth = Math.abs(dx)
      this.input.touchDrop = dy * clamp > DROP_AT

      const travel = Math.min(1 + RECENTRE, length) * STICK_RADIUS
      const angle = Math.atan2(dy, dx)
      this.knob.style.transform =
        `translate(calc(-50% + ${Math.cos(angle) * travel}px), calc(-50% + ${Math.sin(angle) * travel}px))`
      this.base.classList.toggle('is-sprinting', Math.abs(dx) > SPRINT_AT)
      this.base.classList.toggle('is-dropping', this.input.touchDrop)
    })

    const end = (event) => {
      if (this.pointer?.id !== event.pointerId) return
      this.release()
    }
    pad.addEventListener('pointerup', end)
    pad.addEventListener('pointercancel', end)
  }

  release() {
    this.pointer = null
    this.input.touchAxis.x = 0
    this.input.touchDepth = 0
    this.input.touchJump = false
    this.input.touchDrop = false
    this.homeBase()
  }

  // --- buttons ------------------------------------------------------------

  bindButtons() {
    // Held, not tapped, so it feeds the same edge-triggered buffer the spacebar
    // does — and holding it longer jumps higher, as it does on a keyboard.
    const press = (down) => (event) => {
      event.preventDefault()
      this.input.touchJump = down
    }
    this.jumpBtn.addEventListener('pointerdown', press(true))
    this.jumpBtn.addEventListener('pointerup', press(false))
    this.jumpBtn.addEventListener('pointercancel', press(false))
    this.jumpBtn.addEventListener('pointerleave', press(false))

    // `click`: the one event a tap, a mouse and the keyboard all produce.
    this.openBtn.addEventListener('click', (event) => {
      event.preventDefault()
      this.input.trigger('interact')
    })
  }
}
