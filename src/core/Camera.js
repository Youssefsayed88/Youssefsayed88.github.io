import * as THREE from 'three'

// Third-person orbit rig that trails the player with damping.
export default class Camera {
  constructor(experience) {
    this.experience = experience
    this.sizes = experience.sizes
    this.scene = experience.scene

    this.yaw = 0
    this.pitch = 0.32
    this.distance = 7
    this.height = 1.6
    this.sensitivity = 0.0045

    this.target = new THREE.Vector3()
    this.desired = new THREE.Vector3()

    this.instance = new THREE.PerspectiveCamera(55, this.sizes.width / this.sizes.height, 0.1, 300)
    this.instance.position.set(0, 4, 10)
    this.scene.add(this.instance)
  }

  applyLook(look) {
    this.yaw -= look.x * this.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * this.sensitivity, -0.15, 1.1)
  }

  update(playerPosition, delta) {
    this.target.lerp(
      this.target.set(playerPosition.x, playerPosition.y + this.height, playerPosition.z),
      1,
    )

    const horizontal = Math.cos(this.pitch) * this.distance
    this.desired.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontal,
    )

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
