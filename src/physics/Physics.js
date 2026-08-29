import RAPIER from '@dimforge/rapier3d'

// Rapier is stepped once per frame and decoupled from the render rate.
//
// This uses @dimforge/rapier3d, not -compat: the compat build inlines a 2MB
// WASM binary as base64, which inflates it ~33% and buries it inside the JS
// bundle. The plain build ships the .wasm as its own file — smaller, cacheable
// on its own, and downloadable in parallel with the JS.
export default class Physics {
  // Kept as a hook so callers do not need to know how the WASM arrives. The
  // ESM build instantiates at import time, so by here it is already live.
  static async init() {}

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
