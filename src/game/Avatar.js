// What the body looks like on the page.
//
// A positioned element inside the level whose origin is the feet. Until the
// robot arrives it shows a placeholder the size of the body, which is the whole
// character on a device without WebGL — the platformer does not need 3D to be
// played, only to look like itself.

// Below this horizontal speed the robot keeps facing the way it last moved,
// instead of flicking round on the last scraps of a stop.
const TURN_EPSILON = 25

function webglAvailable() {
  try {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

export default class Avatar {
  constructor(root) {
    this.el = root.querySelector('#avatar')
    this.facing = 1
    this.robot = null

    if (!webglAvailable()) return

    // Dynamic, so Three.js and the model are fetched after the page is already
    // on screen and playable.
    import('../robot/Robot.js')
      .then(({ default: Robot }) => {
        this.robot = new Robot(this.el, {
          onReady: () => this.el.classList.add('has-robot'),
        })
      })
      .catch((error) => {
        console.warn('[avatar] could not load the robot, keeping the placeholder', error)
      })
  }

  update(body, delta) {
    this.el.style.transform = `translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0)`

    if (Math.abs(body.vx) > TURN_EPSILON) this.facing = Math.sign(body.vx)
    this.el.classList.toggle('is-facing-left', this.facing < 0)

    this.robot?.update(delta, {
      speed: Math.abs(body.vx),
      verticalVelocity: body.verticalVelocity,
      grounded: body.grounded,
      facing: this.facing,
    })
  }

  // Footfalls the robot's gait landed this frame. None before it has loaded:
  // the placeholder has no legs to time them from.
  get footfalls() { return this.robot?.footfalls ?? 0 }

  get ready() { return this.el.classList.contains('has-robot') }

  setWarping(warping) {
    this.el.classList.toggle('is-warping', warping)
  }
}
