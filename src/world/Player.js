import * as THREE from 'three'
import { MATERIALS } from './Materials.js'
import { moveVector, SPEED } from './movement.js'

const RADIUS = 0.4
const HALF_HEIGHT = 0.5        // half of the cylindrical section
const GRAVITY = -20
const JUMP = 7.5

export default class Player {
  constructor(scene, physics, spawn = new THREE.Vector3(0, 1.5, 7)) {
    const { RAPIER, world } = physics
    this.physics = physics

    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HALF_HEIGHT * 2, 6, 16),
      MATERIALS.player(),
    )
    this.mesh.position.copy(spawn)
    scene.add(this.mesh)

    // A nose cone so facing direction is readable in greybox.
    this.nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), MATERIALS.accent())
    this.nose.rotation.x = Math.PI / 2
    this.nose.position.set(0, 0.35, -RADIUS - 0.1)
    this.mesh.add(this.nose)

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    )
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS),
      this.body,
    )

    this.controller = world.createCharacterController(0.02)
    this.controller.enableAutostep(0.5, 0.2, true)
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
    this.controller.setMinSlopeSlideAngle((30 * Math.PI) / 180)
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.controller.enableSnapToGround(0.4)

    this.verticalVelocity = 0
    this.grounded = false
    this._move = new THREE.Vector3()
  }

  update(delta, axis, wantsJump, cameraYaw) {
    // Rotate movement intent into camera space.
    const move = moveVector(axis, cameraYaw)
    const dx = move.x * SPEED * delta
    const dz = move.z * SPEED * delta

    if (this.grounded) {
      this.verticalVelocity = wantsJump ? JUMP : -1   // small stick-down force
    } else {
      this.verticalVelocity += GRAVITY * delta
    }

    this._move.set(dx, this.verticalVelocity * delta, dz)
    this.controller.computeColliderMovement(this.collider, this._move)

    const corrected = this.controller.computedMovement()
    this.grounded = this.controller.computedGrounded()

    const t = this.body.translation()
    const next = {
      x: t.x + corrected.x,
      y: t.y + corrected.y,
      z: t.z + corrected.z,
    }
    this.body.setNextKinematicTranslation(next)
    this.mesh.position.set(next.x, next.y, next.z)

    // Face the direction of travel.
    if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
      const target = Math.atan2(dx, dz)
      this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, target + Math.PI, 14, delta)
    }
  }

  get position() { return this.mesh.position }
}

function dampAngle(current, target, lambda, delta) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}
