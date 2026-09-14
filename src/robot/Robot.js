import * as THREE from 'three'
import Character from './Character.js'
import { PLAYER_HEIGHT } from '../game/movement.js'

// The robot, drawn into a small transparent canvas that rides along with the
// body on the page.
//
// One canvas the size of the character rather than one over the whole screen:
// the page underneath is real HTML that has to stay clickable and selectable,
// and a full-screen WebGL layer would sit on top of all of it redrawing empty
// pixels. This is a few hundred pixels a frame.
//
// Loaded by Avatar.js with a dynamic import, after first paint. The page is
// playable before it arrives — the placeholder is the body until then, and for
// good on a device with no WebGL.

// Character.js scales the model to this many units tall, so this is the scale
// between its units and the page's pixels.
const MODEL_HEIGHT = 1.8
const PX_PER_UNIT = PLAYER_HEIGHT / MODEL_HEIGHT

// The canvas around the feet, in body heights. Room above for the arms of the
// jump pose, a sliver below so the soles are not clipped.
const FRAME = { width: 1.7, above: 1.3, below: 0.1 }

// Travel is left or right, but a robot seen exactly side-on is a silhouette. It
// turns this far toward the viewer, so the face and the stride both read.
const TURN_TOWARD_VIEWER = 0.5
const TURN_RATE = 12

export default class Robot {
  constructor(container, { onReady } = {}) {
    const width = Math.round(PLAYER_HEIGHT * FRAME.width)
    const above = Math.round(PLAYER_HEIGHT * FRAME.above)
    const below = Math.round(PLAYER_HEIGHT * FRAME.below)
    const height = above + below

    // Positioned so the avatar's origin — the feet — sits at the canvas's
    // `below` line.
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'avatar__robot'
    Object.assign(this.canvas.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${-width / 2}px`,
      top: `${-above}px`,
    })
    container.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.renderer.setClearColor(0x000000, 0)

    // Orthographic, so the robot is the same size in pixels wherever it is on
    // screen — the platforms it is standing on are flat and do not foreshorten.
    const u = (px) => px / PX_PER_UNIT
    this.camera = new THREE.OrthographicCamera(-u(width) / 2, u(width) / 2, u(above), -u(below), 0.1, 20)
    this.camera.position.set(0, 0, 10)
    this.camera.lookAt(0, 0, 0)

    this.scene = new THREE.Scene()

    // Character seats the feet half a body below its parent, so raising the
    // parent by that puts them on y = 0, the bottom line of the frame above.
    this.root = new THREE.Group()
    this.root.position.y = MODEL_HEIGHT / 2
    this.scene.add(this.root)

    this.yaw = yawFor(1)
    this.root.rotation.y = this.yaw

    this.character = new Character(this.root, { onReady })
  }

  // `speed` and `verticalVelocity` are the body's, in px/s with y down.
  // Character.js was tuned in metres per second with y up, so both are converted
  // here rather than re-tuning its blend windows.
  update(delta, { speed = 0, verticalVelocity = 0, grounded = true, facing = 1 }) {
    this.yaw = dampAngle(this.yaw, yawFor(facing), TURN_RATE, delta)
    this.root.rotation.y = this.yaw

    this.character.update(delta, {
      speed: speed / PX_PER_UNIT,
      grounded,
      verticalVelocity: -verticalVelocity,
    })
    this.renderer.render(this.scene, this.camera)
  }

  get footfalls() { return this.character.footfalls }
}

// The yaw that points the model along a travel direction. Character.js keeps
// the showroom's convention, where a direction (x, z) is aimed with
// atan2(x, z) + PI; here the direction is left or right, tipped toward +z,
// which is the viewer.
function yawFor(facing) {
  return Math.atan2(facing * Math.cos(TURN_TOWARD_VIEWER), Math.sin(TURN_TOWARD_VIEWER)) + Math.PI
}

function dampAngle(current, target, lambda, delta) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}
