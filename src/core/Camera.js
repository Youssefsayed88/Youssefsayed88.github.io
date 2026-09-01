import * as THREE from 'three'

const MIN_DISTANCE = 3
const WALL_MARGIN = 0.35

// Pitch band. The lower bound keeps the rig from dropping back into a
// third-person view; the upper stops it going fully overhead, where every
// vertical kiosk screen would vanish edge-on.
const PITCH_MIN = 0.62
const PITCH_MAX = 1.32

// Occlusion assist. Pulling the camera in was the ONLY answer to a blocked view
// here, and at a kiosk in the front half of a room that is the wrong one: the
// orbit sits behind the south wall, the ray clamps to MIN_DISTANCE, and the
// character ends up filling the frame at the exact moment the screen behind
// them is the thing worth looking at.
//
// Going OVER the wall is the answer the level actually affords — the ceilings
// were removed for the top-down view, so straight up is always clear. So before
// shortening the boom, walk the pitch up from wherever the player put it and
// take the SHALLOWEST angle that clears: shallowest, because pitch is the
// player's setting and the assist should give back as little of it as the
// geometry allows. Distance clamping stays as the fallback for a view no pitch
// can rescue.
const ASSIST_STEPS = 6
const ASSIST_ACCEPT = 0.92   // fraction of the full boom that counts as "clear"
const ASSIST_LAMBDA = 6      // how fast the assist eases in and back out

// The camera widens a little at speed. It is the cheapest way to make sprinting
// read as sprinting without a speed-line effect or a second animation — the
// walls sweep past faster at the edges of frame. Kept small; anything more and
// the kiosk screens start to distort at the corners.
const BASE_FOV = 55
const SPRINT_FOV = 60.5

// Top-down rig: the camera sits high and looks down at the player, orbiting on
// yaw so you can still read kiosks on any wall.
//
// Pitch deliberately stops short of straight down. Every screen in this level is
// a vertical plane, and at 90 degrees they would all be edge-on and invisible —
// the kiosks are the point of the room, so the view stays angled enough to read
// them. Kiosk panels are also tilted back to meet this camera halfway.
export default class Camera {
  constructor(experience) {
    this.experience = experience
    this.sizes = experience.sizes
    this.scene = experience.scene

    this.yaw = 0
    this.pitch = 0.95            // ~54 degrees above the horizon
    // The pitch actually rendered. Equal to `pitch` in the open; eased above it
    // while the assist is lifting the rig over something. Kept separate so the
    // assist never overwrites what the player chose.
    this.viewPitch = this.pitch
    this.distance = 17
    this.height = 0.9
    this.sensitivity = 0.0045

    this.target = new THREE.Vector3()
    this.desired = new THREE.Vector3()
    this.direction = new THREE.Vector3()
    this.probe = new THREE.Vector3()
    this.currentDistance = this.distance

    this.fov = BASE_FOV
    this.instance = new THREE.PerspectiveCamera(BASE_FOV, this.sizes.width / this.sizes.height, 0.1, 300)
    this.instance.position.set(0, 4, 10)
    this.scene.add(this.instance)
  }

  applyLook(look) {
    this.yaw -= look.x * this.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * this.sensitivity, PITCH_MIN, PITCH_MAX)
  }

  // Unit vector from the player out toward where the camera wants to be, at an
  // arbitrary pitch. Writes into `out` so the per-frame probing allocates
  // nothing.
  directionAt(pitch, out) {
    const horizontal = Math.cos(pitch)
    return out.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(pitch),
      Math.cos(this.yaw) * horizontal,
    )
  }

  // Distance the camera can sit back along `direction` before geometry blocks
  // the view.
  clearAlong(direction, physics, playerCollider) {
    if (!physics?.world) return this.distance

    const { RAPIER, world } = physics
    const ray = new RAPIER.Ray(
      { x: this.target.x, y: this.target.y, z: this.target.z },
      { x: direction.x, y: direction.y, z: direction.z },
    )
    // solid=true so a ray starting inside a collider reports impact at 0
    // rather than passing through it.
    const hit = world.castRay(ray, this.distance, true, undefined, undefined, playerCollider)
    if (!hit) return this.distance

    return Math.max(MIN_DISTANCE, hit.timeOfImpact - WALL_MARGIN)
  }

  // The shallowest pitch at or above the player's that clears the boom, with
  // the distance it clears. Falls back to whichever probed pitch got furthest
  // when nothing clears — a view no angle can rescue is still better taken from
  // the angle that sees most of it.
  solveView(physics, playerCollider) {
    const wanted = this.distance * ASSIST_ACCEPT

    let bestPitch = this.pitch
    let bestClear = this.clearAlong(this.directionAt(this.pitch, this.probe), physics, playerCollider)
    if (bestClear >= wanted) return { pitch: bestPitch, clear: bestClear }

    for (let i = 1; i <= ASSIST_STEPS; i++) {
      const pitch = this.pitch + (PITCH_MAX - this.pitch) * (i / ASSIST_STEPS)
      const clear = this.clearAlong(this.directionAt(pitch, this.probe), physics, playerCollider)
      if (clear > bestClear) {
        bestClear = clear
        bestPitch = pitch
      }
      // Shallowest that works wins; no reason to keep climbing.
      if (clear >= wanted) break
    }

    return { pitch: bestPitch, clear: bestClear }
  }

  update(playerPosition, delta) {
    this.target.set(playerPosition.x, playerPosition.y + this.height, playerPosition.z)

    const physics = this.experience.physics
    const collider = this.experience.world?.player?.collider

    // Solve for an angle first, then ease toward it — a pitch that snapped to
    // the solved value would jerk the whole scene the moment a doorway edge
    // crossed the ray.
    const solved = this.solveView(physics, collider)
    this.viewPitch = THREE.MathUtils.lerp(
      this.viewPitch, solved.pitch, 1 - Math.exp(-ASSIST_LAMBDA * delta),
    )

    // Re-measure at the pitch actually being rendered. The eased value is
    // somewhere between the player's angle and the solved one, so it is not
    // covered by either probe, and using the solved distance at an in-between
    // angle is what would let a wall clip through mid-ease.
    this.directionAt(this.viewPitch, this.direction)
    const clear = this.clearAlong(this.direction, physics, collider)

    // Snap inwards immediately so a wall never clips through, but ease back out
    // so leaving a tight space is not jarring.
    this.currentDistance = clear < this.currentDistance
      ? clear
      : THREE.MathUtils.lerp(this.currentDistance, clear, 1 - Math.pow(0.02, delta))

    this.desired.copy(this.target).addScaledVector(this.direction, this.currentDistance)

    // Frame-rate independent damping.
    const t = 1 - Math.pow(0.001, delta)
    this.instance.position.lerp(this.desired, t)
    this.instance.lookAt(this.target)

    this.updateFov(delta)
  }

  // Place the rig immediately rather than easing into it, for a `?project=`
  // deep link: the camera is constructed pointing at the spawn, and without
  // this the first second of a shared link is a swoop across the building.
  snapTo(playerPosition) {
    this.target.set(playerPosition.x, playerPosition.y + this.height, playerPosition.z)

    const physics = this.experience.physics
    const collider = this.experience.world?.player?.collider

    this.viewPitch = this.solveView(physics, collider).pitch
    this.directionAt(this.viewPitch, this.direction)
    this.currentDistance = this.clearAlong(this.direction, physics, collider)

    this.desired.copy(this.target).addScaledVector(this.direction, this.currentDistance)
    this.instance.position.copy(this.desired)
    this.instance.lookAt(this.target)
  }

  // Eased separately from the rig, and more slowly, so the widening trails the
  // acceleration instead of snapping with it.
  updateFov(delta) {
    const ratio = this.experience.world?.player?.speedRatio ?? 0
    const target = THREE.MathUtils.lerp(BASE_FOV, SPRINT_FOV, ratio * ratio)
    this.fov = THREE.MathUtils.lerp(this.fov, target, 1 - Math.exp(-5 * delta))

    if (Math.abs(this.fov - this.instance.fov) > 0.01) {
      this.instance.fov = this.fov
      this.instance.updateProjectionMatrix()
    }
  }

  resize() {
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.fov = this.fov
    this.instance.updateProjectionMatrix()
  }
}
