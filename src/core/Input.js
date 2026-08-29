import Emitter from './Emitter.js'

// Keyboard + pointer-drag look. Touch joystick lands in M5.
export default class Input extends Emitter {
  constructor(canvas) {
    super()
    this.canvas = canvas
    this.keys = new Set()
    this.look = { x: 0, y: 0 }   // consumed and zeroed each frame
    this.dragging = false

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (e.code === 'KeyE') this.trigger('interact')
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true
      canvas.setPointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointerup', (e) => {
      this.dragging = false
      canvas.releasePointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      this.look.x += e.movementX
      this.look.y += e.movementY
    })
  }

  // Movement intent in local space: x = strafe, z = forward.
  get axis() {
    const k = this.keys
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    const z = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
    const len = Math.hypot(x, z)
    return len > 1 ? { x: x / len, z: z / len } : { x, z }
  }

  get jump() { return this.keys.has('Space') }

  consumeLook() {
    const l = { ...this.look }
    this.look.x = 0
    this.look.y = 0
    return l
  }
}
