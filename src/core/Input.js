import Emitter from './Emitter.js'

const DEADZONE = 0.18
const TOUCH_RADIUS = 60      // px of drag for full stick deflection
const TOUCH_LOOK_SCALE = 1.4
// Drag this many stick-radii from the origin to sprint. Past full deflection,
// so the gesture is "push further" rather than a second control to discover.
const TOUCH_SPRINT_DEPTH = 1.6

// Keyboard + mouse + touch + gamepad, normalised to one axis/look/jump surface.
//
// Touch splits the screen: dragging on the left half steers the player, dragging
// on the right half moves the camera. That is the convention every mobile
// third-person game uses, so it needs no explaining.
export default class Input extends Emitter {
  constructor(canvas) {
    super()
    this.canvas = canvas
    this.keys = new Set()
    this.look = { x: 0, y: 0 }
    this.touchAxis = { x: 0, z: 0 }
    this.touchDepth = 0        // raw drag length, unclamped, for the sprint gesture
    this.touchJump = false

    this.movePointer = null   // { id, originX, originY }
    this.lookPointer = null
    this.gamepadIndex = null
    this.prevGamepadButtons = new Map()

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
      c.setPointerCapture(e.pointerId)

      if (e.pointerType === 'touch' && e.clientX < window.innerWidth / 2) {
        this.movePointer = { id: e.pointerId, originX: e.clientX, originY: e.clientY }
      } else {
        this.lookPointer = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY }
      }
    })

    c.addEventListener('pointermove', (e) => {
      if (this.movePointer?.id === e.pointerId) {
        const dx = (e.clientX - this.movePointer.originX) / TOUCH_RADIUS
        const dy = (e.clientY - this.movePointer.originY) / TOUCH_RADIUS
        const len = Math.hypot(dx, dy)
        const scale = len > 1 ? 1 / len : 1
        this.touchAxis.x = dx * scale
        this.touchAxis.z = dy * scale
        this.touchDepth = len
        return
      }

      if (this.lookPointer?.id === e.pointerId) {
        // movementX is unreliable on touch, so track deltas manually.
        this.look.x += (e.clientX - this.lookPointer.lastX) * (e.pointerType === 'touch' ? TOUCH_LOOK_SCALE : 1)
        this.look.y += (e.clientY - this.lookPointer.lastY) * (e.pointerType === 'touch' ? TOUCH_LOOK_SCALE : 1)
        this.lookPointer.lastX = e.clientX
        this.lookPointer.lastY = e.clientY
      }
    })

    const release = (e) => {
      if (this.movePointer?.id === e.pointerId) {
        this.movePointer = null
        this.touchAxis.x = 0
        this.touchAxis.z = 0
        this.touchDepth = 0
      }
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
    if (this.touchDepth > TOUCH_SPRINT_DEPTH) return true
    return !!this.gamepad?.sprint
  }

  consumeLook() {
    const l = { ...this.look }
    this.look.x = 0
    this.look.y = 0
    return l
  }
}
