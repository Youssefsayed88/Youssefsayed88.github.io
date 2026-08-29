import RAPIER from '@dimforge/rapier3d-compat'

// Rapier is stepped on a fixed timestep and decoupled from the render rate.
export default class Physics {
  static async init() { await RAPIER.init() }

  constructor() {
    this.RAPIER = RAPIER
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 })
    this.world.timestep = 1 / 60
    this.accumulator = 0
  }

  // A static piece of level geometry: fixed body + cuboid collider.
  addStaticBox(position, size) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
      body,
    )
    return body
  }

  update(delta) {
    this.accumulator += delta
    // Cap the catch-up work so a long frame cannot spiral.
    let steps = 0
    while (this.accumulator >= this.world.timestep && steps < 5) {
      this.world.step()
      this.accumulator -= this.world.timestep
      steps++
    }
  }
}
