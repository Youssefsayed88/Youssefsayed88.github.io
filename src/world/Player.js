import * as THREE from 'three'
import { MATERIALS } from './Materials.js'
import {
  desiredVelocity, stepVelocity, resolveVelocity, SPEED, SPRINT_MULTIPLIER,
} from './movement.js'

const RADIUS = 0.4
const HALF_HEIGHT = 0.5        // half of the cylindrical section
const GRAVITY = -20
const JUMP = 7.5

// Jump forgiveness. Both windows are short enough to be invisible and long
// enough to cover the two ways a jump gets eaten: pressing a few frames after
// walking off an edge, and pressing a few frames before landing.
const COYOTE_TIME = 0.12       // still jumpable this long after leaving ground
const JUMP_BUFFER = 0.15       // a press this long before landing still fires

// Below this speed the player is treated as stopped, so the nose cone does not
// keep swinging on the last scraps of decaying velocity.
const FACING_EPSILON = 0.2

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

    // Horizontal velocity persists across frames — this is what carries the
    // momentum. Vertical stays separate: gravity and jumps are not damped.
    this.velocity = { x: 0, z: 0 }
    this.verticalVelocity = 0
    this.grounded = false
    this.coyote = 0
    this.jumpBuffer = 0
    this.jumpHeld = false
    this._move = new THREE.Vector3()
  }

  // Current planar speed in m/s. The camera reads this for its sprint framing
  // and the HUD could too; nothing else needs to know about `velocity`.
  get speed() {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  // 0 at a standstill, 1 at full sprint. Kept here so consumers do not have to
  // re-derive the top speed.
  get speedRatio() {
    return Math.min(1, this.speed / (SPEED * SPRINT_MULTIPLIER))
  }

  update(delta, axis, wantsJump, cameraYaw, sprinting = false) {
    // Rotate movement intent into camera space, then ease toward it rather than
    // snapping. Instant velocity is what made the walk feel like a cursor.
    const desired = desiredVelocity(axis, cameraYaw, sprinting)
    this.velocity = stepVelocity(this.velocity, desired, delta)
    const dx = this.velocity.x * delta
    const dz = this.velocity.z * delta

    this.updateJump(delta, wantsJump)

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

    this.velocity = resolveVelocity(this.velocity, corrected, delta)

    // Face the direction of travel.
    if (this.speed > FACING_EPSILON) {
      const target = Math.atan2(this.velocity.x, this.velocity.z)
      this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, target + Math.PI, 14, delta)
    }
  }

  // Coyote time and jump buffering, both counted in seconds.
  updateJump(delta, wantsJump) {
    this.coyote = this.grounded ? COYOTE_TIME : Math.max(0, this.coyote - delta)

    // Edge-triggered: holding the key does not re-arm the buffer, so resting a
    // finger on space no longer auto-hops on every landing.
    if (wantsJump && !this.jumpHeld) this.jumpBuffer = JUMP_BUFFER
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - delta)
    this.jumpHeld = wantsJump

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.verticalVelocity = JUMP
      this.jumpBuffer = 0
      this.coyote = 0            // no double jump off one window
    } else if (this.grounded) {
      this.verticalVelocity = -1 // small stick-down force
    } else {
      this.verticalVelocity += GRAVITY * delta
    }
  }

  get position() { return this.mesh.position }
}

function dampAngle(current, target, lambda, delta) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}
