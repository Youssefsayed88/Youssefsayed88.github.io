import Emitter from './Emitter.js'
import TouchControls, { SPRINT_AT } from '../ui/TouchControls.js'

const DEADZONE = 0.18
const TOUCH_LOOK_SCALE = 1.4

// Keyboard + mouse + touch + gamepad, normalised to one axis/look/jump surface.
//
// Touch movement comes from the on-screen joystick in TouchControls, which
// writes into `touchAxis` / `touchDepth` / `touchJump` here. That leaves the
// canvas free to mean one thing on every device: dragging it looks around.
export default class Input extends Emitter {
  constructor(canvas) {
    super()
    this.canvas = canvas
    this.keys = new Set()
    this.look = { x: 0, y: 0 }
    this.touchAxis = { x: 0, z: 0 }
    this.touchDepth = 0        // raw stick deflection, unclamped, for sprint
    this.touchJump = false

    this.lookPointer = null
    this.gamepadIndex = null
    this.prevGamepadButtons = new Map()

    this.touch = new TouchControls(this)

    this.bindKeyboard()
    this.bindPointer()
    this.bindGamepad()
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Let the browser have its shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      this.keys.add(e.code)
      if (e.code === 'KeyE' || e.code === 'Enter') this.trigger('interact')
      if (e.code === 'Space') e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
  }

  bindPointer() {
    const c = this.canvas

    c.addEventListener('pointerdown', (e) => {
      // A hybrid device only earns its on-screen controls once something is
      // actually touched; a laptop with a touchscreen should not get a joystick
      // for owning one.
      if (e.pointerType === 'touch') this.touch.reveal()

      c.setPointerCapture(e.pointerId)
      this.lookPointer = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY }
    })

    c.addEventListener('pointermove', (e) => {
      if (this.lookPointer?.id === e.pointerId) {
        // movementX is unreliable on touch, so track deltas manually.
        this.look.x += (e.clientX - this.lookPointer.lastX) * (e.pointerType === 'touch' ? TOUCH_LOOK_SCALE : 1)
        this.look.y += (e.clientY - this.lookPointer.lastY) * (e.pointerType === 'touch' ? TOUCH_LOOK_SCALE : 1)
        this.lookPointer.lastX = e.clientX
        this.lookPointer.lastY = e.clientY
      }
    })

    const release = (e) => {
      if (this.lookPointer?.id === e.pointerId) this.lookPointer = null
    }
    c.addEventListener('pointerup', release)
    c.addEventListener('pointercancel', release)
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

    // Face button 0 (A / cross) jumps; 2 (X / square) interacts.
    const interact = pad.buttons[2]?.pressed
    if (interact && !this.prevGamepadButtons.get(2)) this.trigger('interact')
    this.prevGamepadButtons.set(2, interact)

    return {
      axis: { x: dz(pad.axes[0] ?? 0), z: dz(pad.axes[1] ?? 0) },
      look: { x: dz(pad.axes[2] ?? 0) * 9, y: dz(pad.axes[3] ?? 0) * 9 },
      jump: !!pad.buttons[0]?.pressed,
      // L3 (click the stick) or the left trigger, whichever the pad has.
      sprint: !!pad.buttons[10]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.5,
    }
  }

  // Called once per frame before reading axis/look/jump.
  update() {
    this.gamepad = this.pollGamepad()
    if (this.gamepad) {
      this.look.x += this.gamepad.look.x
      this.look.y += this.gamepad.look.y
    }
  }

  // Movement intent in local space: x = strafe, z = forward (negative).
  get axis() {
    const k = this.keys
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    let z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)

    if (!x && !z && (this.touchAxis.x || this.touchAxis.z)) {
      x = this.touchAxis.x
      z = this.touchAxis.z
    }
    if (!x && !z && this.gamepad) {
      x = this.gamepad.axis.x
      z = this.gamepad.axis.z
    }

    const len = Math.hypot(x, z)
    return len > 1 ? { x: x / len, z: z / len } : { x, z }
  }

  get jump() {
    return this.keys.has('Space') || this.touchJump || !!this.gamepad?.jump
  }

  // Held, not toggled — sprint is a modifier on whatever the axis already says.
  get sprint() {
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) return true
    if (this.touchDepth > SPRINT_AT) return true
    return !!this.gamepad?.sprint
  }

  consumeLook() {
    const l = { ...this.look }
    this.look.x = 0
    this.look.y = 0
    return l
  }
}
