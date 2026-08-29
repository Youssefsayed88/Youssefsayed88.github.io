import * as THREE from 'three'
import Sizes from './Sizes.js'
import Time from './Time.js'
import Input from './Input.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Physics from '../physics/Physics.js'
import World from '../world/World.js'

export default class Experience {
  constructor(canvas) {
    this.canvas = canvas
    this.sizes = new Sizes()
    this.time = new Time()
    this.input = new Input(canvas)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog('#1d1f2b', 40, 110)

    this.camera = new Camera(this)
    this.renderer = new Renderer(this)
    this.physics = new Physics()
    this.world = new World(this)

    this.sizes.on('resize', () => {
      this.camera.resize()
      this.renderer.resize()
    })
    this.time.on('tick', () => this.update())
  }

  update() {
    const delta = this.time.delta

    this.camera.applyLook(this.input.consumeLook())
    // Order matters: the character queues its move, THEN the world steps.
    this.world.update(delta, this.input, this.camera)
    this.physics.update(delta)
    this.camera.update(this.world.player.position, delta)
    this.renderer.update()
  }
}
