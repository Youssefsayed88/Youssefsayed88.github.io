// On-screen controls for touch.
//
// What was here before was a split screen: drag the left half to walk, the
// right half to look. That reads fine in a design document and fails on a real
// phone, because nothing on screen says it exists — there is no thumb rest, no
// feedback, and the two invisible halves have a seam down the middle you
// discover by walking the wrong way. Jumping was not reachable at all: `Input`
// had a `touchJump` flag that nothing ever set.
//
// So: a real floating joystick, a jump button, and an interact button that
// takes over from the "press E" prompt. All DOM — it costs no draw calls, it
// scales with the device's own font settings, and the buttons are real
// <button>s, so they are focusable and announced.

const STICK_RADIUS = 54     // px of travel to full deflection

// Deflection at which the sprint kicks in, in stick radii. Deliberately GREATER
// than 1: the stick is analogue, so everything up to the rim is already a speed
// control, and sprint has to be a deliberate push past it rather than something
// you trip over every time you walk briskly. Input.js reads this same constant,
// so the ring cannot light at a different point from the one that sprints.
export const SPRINT_AT = 1.25

// How far past the rim the knob is allowed to travel, so crossing SPRINT_AT is
// something you can see happen rather than guess at. Kept just past the sprint
// threshold: further and the knob detaches from its base entirely.
const RECENTRE = 0.35

export default class TouchControls {
  constructor(input) {
    this.input = input
    this.enabled = false
    this.visible = true
    this.pointer = null

    this.build()

    // Show immediately on a phone or tablet. On a hybrid — a Windows laptop
    // with a touchscreen, which is what this was developed on — `pointer:
    // coarse` is false and a joystick would be wrong, so wait until something
    // is actually touched. `Input` calls reveal() on the first touch pointer.
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
  }

  reveal() {
    if (this.enabled) return
    this.enabled = true
    this.root.hidden = false
    document.body.classList.add('has-touch-controls')
  }

  // Hidden behind the project modal, which covers the screen and whose own
  // controls are the only ones that should be reachable there.
  setVisible(visible) {
    this.visible = visible
    if (this.enabled) this.root.hidden = !visible
    if (!visible) this.release()
  }

  // Fed by the HUD: the interact button is the touch equivalent of the "press
  // E" prompt, so it enables and takes the kiosk's name from the same signal.
  setPrompt(title) {
    this.openBtn.disabled = !title
    this.openBtn.classList.toggle('is-live', !!title)
    this.openBtn.setAttribute(
      'aria-label',
      title ? `Open ${title}` : 'Walk up to a kiosk to open it',
    )
  }

  // --- joystick -----------------------------------------------------------

  // Clearing the inline anchors drops the base back to the CSS resting spot at
  // the centre of the thumb zone.
  homeBase() {
    this.base.style.left = ''
    this.base.style.top = ''
    this.base.classList.remove('is-active')
    this.knob.style.transform = ''
  }

  bindStick() {
    const pad = this.pad

    pad.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      pad.setPointerCapture(event.pointerId)
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }

      // A floating stick: the base jumps to wherever the thumb landed. Fixed
      // bases are the single most common reason a mobile joystick feels wrong
      // — the thumb never lands on the same pixel twice.
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

      this.input.touchAxis.x = dx * clamp
      this.input.touchAxis.z = dy * clamp
      // Unclamped, because sprint is "push further" past full deflection.
      this.input.touchDepth = length

      // The knob is allowed a little past the base so the sprint threshold is
      // something you can see yourself crossing rather than guess at.
      const travel = Math.min(1 + RECENTRE, length) * STICK_RADIUS
      const angle = Math.atan2(dy, dx)
      this.knob.style.transform =
        `translate(calc(-50% + ${Math.cos(angle) * travel}px), calc(-50% + ${Math.sin(angle) * travel}px))`
      this.base.classList.toggle('is-sprinting', length > SPRINT_AT)
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
    this.input.touchAxis.z = 0
    this.input.touchDepth = 0
    this.input.touchJump = false
    this.base.classList.remove('is-sprinting')
    this.homeBase()
  }

  // --- buttons ------------------------------------------------------------

  bindButtons() {
    // Jump is held, not tapped, so it feeds the same edge-triggered buffer the
    // spacebar does — Player.js handles coyote time and buffering from there.
    const press = (down) => (event) => {
      event.preventDefault()
      this.input.touchJump = down
    }
    this.jumpBtn.addEventListener('pointerdown', press(true))
    this.jumpBtn.addEventListener('pointerup', press(false))
    this.jumpBtn.addEventListener('pointercancel', press(false))
    this.jumpBtn.addEventListener('pointerleave', press(false))

    // `click`, not `pointerdown`: it is the one event a tap, a mouse and the
    // keyboard all produce, and the viewport meta tag already rules out the
    // 300ms tap delay that would otherwise make it feel slow.
    this.openBtn.addEventListener('click', (event) => {
      event.preventDefault()
      this.input.trigger('interact')
    })
  }
}
