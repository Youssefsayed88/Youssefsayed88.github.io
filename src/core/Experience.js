import * as THREE from 'three'
import Sizes from './Sizes.js'
import Time from './Time.js'
import Input from './Input.js'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Physics from '../physics/Physics.js'
import World from '../world/World.js'
import { BACKGROUND } from '../world/Materials.js'
import Hud from '../ui/Hud.js'
import Modal from '../ui/Modal.js'
import Audio from '../ui/Audio.js'

export default class Experience {
  constructor(canvas) {
    this.canvas = canvas
    this.sizes = new Sizes()
    this.time = new Time()
    this.input = new Input(canvas)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(BACKGROUND, 34, 105)

    this.hud = new Hud()
    this.audio = new Audio()
    this.modal = new Modal((open) => {
      this.paused = open
      open ? this.audio.openPanel() : this.audio.closePanel()
    })
    this.paused = false

    this.camera = new Camera(this)
    this.renderer = new Renderer(this)
    this.physics = new Physics()
    this.world = new World(this)

    this.input.on('interact', () => this.interact())

    // Browsers refuse to start audio outside a user gesture.
    const wake = () => this.audio.start()
    window.addEventListener('keydown', wake, { once: true })
    window.addEventListener('pointerdown', wake, { once: true })

    this.previousPosition = this.world.player.position.clone()

    this.sizes.on('resize', () => {
      this.camera.resize()
      this.renderer.resize()
    })
    this.time.on('tick', () => this.update())
  }

  interact() {
    if (this.paused || !this.world.activeKiosk) return
    this.modal.show(this.world.activeKiosk.project)
  }

  update() {
    const delta = this.time.delta
    this.input.update()

    if (this.paused) {
      // Drop any drag accumulated behind the modal so the camera does not
      // lurch when it closes.
      this.input.consumeLook()
    } else {
      this.camera.applyLook(this.input.consumeLook())
      // Order matters: the character queues its move, THEN the world steps.
      this.world.update(delta, this.input, this.camera)
      this.physics.update(delta)

      // Footsteps are paced by distance walked, not elapsed time.
      const position = this.world.player.position
      this.audio.travel(this.previousPosition.distanceTo(position))
      this.previousPosition.copy(position)
    }

    this.camera.update(this.world.player.position, delta)
    this.renderer.update()
  }
}
