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
import Orientation from '../ui/Orientation.js'

// The query parameter that names a single kiosk. `?project=lu-run` is the
// shareable form of one project: it is what goes into a job application when the
// point is that ONE piece of work, not the whole building. classic.html answers
// the same parameter, and main.js carries it through the no-WebGL redirect, so
// one link resolves on every route.
const PROJECT_PARAM = 'project'

export default class Experience {
  constructor(canvas) {
    this.canvas = canvas
    this.sizes = new Sizes()
    this.time = new Time()
    this.input = new Input(canvas)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(BACKGROUND, 34, 105)

    // The touch Open button is the E key's counterpart, so it lights up off the
    // same prompt the HUD does rather than polling the world for a kiosk.
    this.hud = new Hud({
      onPrompt: (title) => this.input.touch.setPrompt(title),
      onActivate: () => this.interact(),
    })
    this.audio = new Audio()
    this.modal = new Modal((open, project) => {
      this.panelOpen = open
      // The panel covers the screen; leaving a joystick under it would both
      // show through the backdrop blur and hold whatever direction the thumb
      // was last pushing.
      this.input.touch.setVisible(!open)
      // Keep the address bar pointing at whatever is on screen, so copying the
      // URL of an open panel shares that project. No pushState: a back button
      // that stepped through every kiosk someone opened while wandering would
      // be a worse back button, not a better one.
      this.setUrlProject(open ? project.id : null)
      open ? this.audio.openPanel() : this.audio.closePanel()
    })
    this.panelOpen = false
    this.portrait = false

    // Held sideways is a hard requirement of the top-down camera, so portrait
    // pauses the game the same way an open panel does — see `paused`. The
    // "turn your device" panel itself is CSS over markup in index.html; this
    // only stops the world running behind it, and drops whatever direction the
    // joystick was holding when the phone was turned.
    this.orientation = new Orientation((portrait) => {
      this.portrait = portrait
      if (portrait) this.input.touch.release()
    })

    this.camera = new Camera(this)
    this.renderer = new Renderer(this)
    this.physics = new Physics()
    this.world = new World(this)

    this.input.on('interact', () => this.interact())

    // Browsers refuse to start audio outside a user gesture.
    const wake = () => this.audio.start()
    window.addEventListener('keydown', wake, { once: true })
    window.addEventListener('pointerdown', wake, { once: true })

    this.sizes.on('resize', () => {
      this.camera.resize()
      this.renderer.resize()
    })
    this.time.on('tick', () => this.update())

    // After the world and camera exist: a deep link places the player before
    // the first frame is drawn, so a shared link opens ON its kiosk rather than
    // walking there in front of the visitor.
    this.openDeepLink()
  }

  // Two things stop the world: an open project panel, and a phone held in
  // portrait. Both want exactly the same thing from the update loop, and
  // neither may clear the other's reason for pausing — a panel closing while
  // the phone is still upright must not start the game up behind the rotate
  // screen. So this is derived rather than assigned.
  get paused() {
    return this.panelOpen || this.portrait
  }

  interact() {
    if (this.paused || !this.world.activeKiosk) return
    this.modal.show(this.world.activeKiosk.project)
  }

  openDeepLink() {
    const id = new URLSearchParams(window.location.search).get(PROJECT_PARAM)
    if (!id) return

    const kiosk = this.world.goToProject(id, this.camera)
    // An id that is not in the data leaves the player at the spawn and drops the
    // parameter. A renamed or mistyped project should land someone in the
    // corridor with a showroom to walk around, not on an error.
    if (kiosk) this.modal.show(kiosk.project)
    else this.setUrlProject(null)
  }

  setUrlProject(id) {
    try {
      const url = new URL(window.location.href)
      if (id) url.searchParams.set(PROJECT_PARAM, id)
      else url.searchParams.delete(PROJECT_PARAM)
      window.history.replaceState(null, '', url)
    } catch {
      // Some contexts (an opaque origin, a sandboxed frame) refuse
      // replaceState. The showroom does not depend on the URL for anything, so
      // losing it is not worth an error.
    }
  }

  update() {
    const delta = this.time.delta
    this.input.update()

    if (this.paused) {
      // Drop any drag accumulated while paused so the camera does not lurch
      // when the panel closes or the phone comes back to landscape.
      this.input.consumeLook()
    } else {
      this.camera.applyLook(this.input.consumeLook())
      // Order matters: the character queues its move, THEN the world steps.
      this.world.update(delta, this.input, this.camera)
      this.physics.update(delta)

      // Footsteps are fired by the animation's own gait, so the sound lands on
      // the frame the foot does — walking or sprinting.
      for (let i = 0; i < this.world.player.footfalls; i++) this.audio.footstep()
    }

    this.camera.update(this.world.player.position, delta)
    this.renderer.update()
  }
}
