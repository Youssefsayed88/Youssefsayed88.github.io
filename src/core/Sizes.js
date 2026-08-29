import Emitter from './Emitter.js'

export default class Sizes extends Emitter {
  constructor() {
    super()
    this.update()
    window.addEventListener('resize', () => {
      this.update()
      this.trigger('resize')
    })
  }

  update() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    // Cap DPR: past 2 the cost is real and the gain is not.
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)
  }
}
