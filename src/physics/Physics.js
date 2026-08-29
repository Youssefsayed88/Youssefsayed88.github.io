import RAPIER from '@dimforge/rapier3d-compat'

// Rapier is stepped on a fixed timestep and decoupled from the render rate.
export default class Physics {
  static async init() { await RAPIER.init() }

  constructor() {
    this.RAPIER = RAPIER
    this.world = new RAPIER.World({ x: 0, y: -20, z: 0 })
    this.world.timestep = 1 / 60
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

  // Stepped once per frame, AFTER the character has queued its kinematic move.
  //
  // An accumulator loop desyncs a kinematic character: on a frame that does not
  // step, setNextKinematicTranslation never applies, so the next
  // computeColliderMovement queries a stale collider position and the character
  // drifts. One step per frame keeps the controller and the world in lockstep.
  // Revisit if dynamic props are ever added to the level.
  update(delta) {
    this.world.timestep = Math.min(delta, 1 / 30)
    this.world.step()
  }
}
