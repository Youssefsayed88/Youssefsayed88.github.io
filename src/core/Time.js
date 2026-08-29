import Emitter from './Emitter.js'

export default class Time extends Emitter {
  constructor() {
    super()
    this.start = performance.now()
    this.current = this.start
    this.elapsed = 0
    this.delta = 1 / 60

    window.requestAnimationFrame(() => this.tick())
  }

  tick() {
    const current = performance.now()
    // Clamp delta so an alt-tab does not teleport the player through a wall.
    this.delta = Math.min((current - this.current) / 1000, 1 / 20)
    this.current = current
    this.elapsed = (this.current - this.start) / 1000

    this.trigger('tick')
    window.requestAnimationFrame(() => this.tick())
  }
}
