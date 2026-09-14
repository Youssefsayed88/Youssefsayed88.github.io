import Emitter from './Emitter.js'
import TouchControls, { SPRINT_AT, DROP_AT } from '../ui/TouchControls.js'

const DEADZONE = 0.18

const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']
const JUMP = ['Space', 'KeyW', 'ArrowUp']
const DROP = ['KeyS', 'ArrowDown']
const SPRINT = ['ShiftLeft', 'ShiftRight']

// Keys the game answers, and so takes from the page: arrows and Space would
// otherwise scroll it out from under the camera.
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...JUMP, ...DROP])

// Keyboard + touch + gamepad, normalised to move / jump / drop / sprint.
//
// Side-on now, so there is one axis instead of two, and no look: the camera
// follows the robot and nothing else. Touch movement comes from the on-screen
// joystick in TouchControls, which writes into `touchAxis`, `touchDepth`,
// `touchJump` and `touchDrop` here.
export default class Input extends Emitter {
  constructor() {
    super()
    this.keys = new Set()
    this.touchAxis = { x: 0 }
    this.touchDepth = 0        // raw horizontal stick deflection, unclamped, for sprint
    this.touchJump = false
    this.touchDrop = false

    this.gamepad = null
    this.gamepadIndex = null
    this.prevGamepadButtons = new Map()

    this.touch = new TouchControls(this)

    this.bindKeyboard()
    this.bindTouchReveal()
    this.bindGamepad()
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Let the browser have its shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target instanceof Element ? e.target : null

      // Keys typed into the project panel belong to it. The video controls answer Space
      // and the arrows while they have focus, and a jump queued behind the
      // panel would fire the moment it closed.
      if (target?.closest('.modal, input, textarea, select')) return

      // Space and Enter on a focused link or button keep their meaning. Someone
      // who tabbed to the CV link and pressed Enter wants the CV, not a jump —
      // the page is a document as well as a level.
      if ((e.code === 'Space' || e.code === 'Enter') && target?.closest('a, button')) return

      this.keys.add(e.code)
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) this.trigger('interact')
      if (GAME_KEYS.has(e.code)) e.preventDefault()
    })
    // Always released, wherever focus went in between, so no key sticks down.
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  // A hybrid device only earns its on-screen controls once something is actually
  // touched; a laptop with a touchscreen should not get a joystick for owning one.
  bindTouchReveal() {
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touch.reveal()
    })
  }

  bindGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index
      this.trigger('gamepad', true)
    })
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null
      this.trigger('gamepad', false)
    })
  }

  // Gamepads are polled, not evented, so this runs once per frame.
  pollGamepad() {
    if (this.gamepadIndex === null || !navigator.getGamepads) return null
    const pad = navigator.getGamepads()[this.gamepadIndex]
    if (!pad) return null

    const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : v)
    const held = (i) => !!pad.buttons[i]?.pressed

    // Face button 2 (X / square) interacts, edge-triggered.
    const interact = held(2)
    if (interact && !this.prevGamepadButtons.get(2)) this.trigger('interact')
    this.prevGamepadButtons.set(2, interact)

    return {
      // Stick first, then the d-pad (14 left, 15 right).
      move: dz(pad.axes[0] ?? 0) || (held(15) ? 1 : 0) - (held(14) ? 1 : 0),
      // A / cross, or d-pad up.
      jump: held(0) || held(12),
      // Stick pushed down, or d-pad down.
      drop: (pad.axes[1] ?? 0) > DROP_AT || held(13),
      // L3 or the left trigger, whichever the pad has.
      sprint: held(10) || (pad.buttons[6]?.value ?? 0) > 0.5,
    }
  }

  update() {
    this.gamepad = this.pollGamepad()
  }

  // -1 is left, 1 is right. The first source with anything to say wins, so a
  // resting thumb on the stick cannot cancel a held arrow key.
  get move() {
    const k = this.keys
    let x = (RIGHT.some((c) => k.has(c)) ? 1 : 0) - (LEFT.some((c) => k.has(c)) ? 1 : 0)
    if (!x && this.touchAxis.x) x = this.touchAxis.x
    if (!x && this.gamepad) x = this.gamepad.move
    return Math.max(-1, Math.min(1, x))
  }

  get jump() {
    return JUMP.some((c) => this.keys.has(c)) || this.touchJump || !!this.gamepad?.jump
  }

  get drop() {
    return DROP.some((c) => this.keys.has(c)) || this.touchDrop || !!this.gamepad?.drop
  }

  // Held, not toggled — sprint is a modifier on whatever the axis already says.
  get sprint() {
    if (SPRINT.some((c) => this.keys.has(c))) return true
    if (this.touchDepth > SPRINT_AT) return true
    return !!this.gamepad?.sprint
  }
}
