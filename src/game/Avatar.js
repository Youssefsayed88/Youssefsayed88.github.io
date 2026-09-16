// What the body looks like on the page.
//
// A positioned element inside the level whose origin is the feet. Nothing is
// drawn until the robot arrives — a stand-in capsule that is then swapped out
// reads as a glitch. The capsule is shown only where the robot can never
// arrive (no WebGL, or the model failed to load): there it is the whole
// character, and an invisible player would be worse.

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

    const fallBack = () => this.el.classList.add('no-robot')
    if (!webglAvailable()) {
      fallBack()
      return
    }

    // Dynamic, so Three.js and the model are fetched after the page is already
    // on screen and playable.
    import('../robot/Robot.js')
      .then(({ default: Robot }) => {
        this.robot = new Robot(this.el, {
          onReady: () => this.el.classList.add('has-robot'),
          onError: fallBack,
        })
      })
      .catch((error) => {
        console.warn('[avatar] could not load the robot, showing the capsule', error)
        fallBack()
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
