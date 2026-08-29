import * as THREE from 'three'

const MIN_DISTANCE = 3
const WALL_MARGIN = 0.35

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
    this.distance = 17
    this.height = 0.9
    this.sensitivity = 0.0045

    this.target = new THREE.Vector3()
    this.desired = new THREE.Vector3()
    this.direction = new THREE.Vector3()
    this.currentDistance = this.distance

    this.instance = new THREE.PerspectiveCamera(55, this.sizes.width / this.sizes.height, 0.1, 300)
    this.instance.position.set(0, 4, 10)
    this.scene.add(this.instance)
  }

  applyLook(look) {
    this.yaw -= look.x * this.sensitivity
    // Clamped to a top-down band. The lower bound keeps it from dropping back
    // into a third-person view; the upper stops it going fully overhead, where
    // every vertical kiosk screen would vanish edge-on.
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * this.sensitivity, 0.62, 1.32)
  }

  // Distance the camera can sit back before geometry blocks the view.
  clearDistance(physics, playerCollider) {
    if (!physics?.world) return this.distance

    const { RAPIER, world } = physics
    const ray = new RAPIER.Ray(
      { x: this.target.x, y: this.target.y, z: this.target.z },
      { x: this.direction.x, y: this.direction.y, z: this.direction.z },
    )
    // solid=true so a ray starting inside a collider reports impact at 0
    // rather than passing through it.
    const hit = world.castRay(ray, this.distance, true, undefined, undefined, playerCollider)
    if (!hit) return this.distance

    return Math.max(MIN_DISTANCE, hit.timeOfImpact - WALL_MARGIN)
  }

  update(playerPosition, delta) {
    this.target.set(playerPosition.x, playerPosition.y + this.height, playerPosition.z)

    // Unit vector from the player out toward where the camera wants to be.
    const horizontal = Math.cos(this.pitch)
    this.direction.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * horizontal,
    )

    const clear = this.clearDistance(
      this.experience.physics,
      this.experience.world?.player?.collider,
    )

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
  }

  resize() {
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
  }
}
