import * as THREE from 'three'
import { MATERIALS } from './Materials.js'
import Character from './Character.js'
import {
  desiredVelocity, stepVelocity, resolveVelocity, stepJump,
  SPEED, SPRINT_MULTIPLIER,
} from './movement.js'

const RADIUS = 0.4
const HALF_HEIGHT = 0.5        // half of the cylindrical section

// Below this speed the player is treated as stopped, so the nose cone does not
// keep swinging on the last scraps of decaying velocity.
const FACING_EPSILON = 0.2

export default class Player {
  constructor(scene, physics, spawn = new THREE.Vector3(0, 1.5, 7)) {
    const { RAPIER, world } = physics
    this.physics = physics

    // `mesh` is the root the rest of the app steers and reads a position from
    // (World, Camera and the capture script all go through it). What hangs off
    // it is a presentation detail.
    this.mesh = new THREE.Group()
    this.mesh.position.copy(spawn)
    scene.add(this.mesh)

    // The greybox capsule, kept as the stand-in until the character GLB lands —
    // and permanently if it never does. The model is ~460 kB fetched after
    // first paint, so there are real frames where this is what you see.
    this.placeholder = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HALF_HEIGHT * 2, 6, 16),
      MATERIALS.player(),
    )
    this.mesh.add(this.placeholder)

    // A nose cone so facing direction is readable in greybox.
    this.nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), MATERIALS.accent())
    this.nose.rotation.x = Math.PI / 2
    this.nose.position.set(0, 0.35, -RADIUS - 0.1)
    this.placeholder.add(this.nose)

    this.character = new Character(this.mesh, {
      onReady: () => { this.placeholder.visible = false },
    })

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
    // Whether the solver refused to move us last frame. resolveVelocity wants
    // two in a row before it believes there is a wall there.
    this.blocked = false
    this.coyote = 0
    this.jumpBuffer = 0
    this.jumpHeld = false
    this.jumped = false
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

    const resolved = resolveVelocity(this.velocity, corrected, delta, this.blocked)
    this.velocity = { x: resolved.x, z: resolved.z }
    this.blocked = resolved.blocked

    // Face the direction of travel.
    if (this.speed > FACING_EPSILON) {
      const target = Math.atan2(this.velocity.x, this.velocity.z)
      this.mesh.rotation.y = dampAngle(this.mesh.rotation.y, target + Math.PI, 14, delta)
    }

    // Animation is driven by what the solver actually produced, not by what was
    // asked for — walk into a wall and the character stops striding, because
    // `velocity` has already been folded back by resolveVelocity above.
    this.character.update(delta, {
      speed: this.speed,
      grounded: this.grounded,
      verticalVelocity: this.verticalVelocity,
    })
  }

  // Coyote time, jump buffering, the release cut and the two gravities all live
  // in movement.js, so the smoke test drives this exact model rather than a
  // copy of it. `jumped` is kept for whatever wants to sound or animate a
  // takeoff.
  updateJump(delta, wantsJump) {
    const next = stepJump(this, { delta, wantsJump, grounded: this.grounded })

    this.verticalVelocity = next.verticalVelocity
    this.coyote = next.coyote
    this.jumpBuffer = next.jumpBuffer
    this.jumpHeld = next.jumpHeld
    this.jumped = next.jumped
  }

  get position() { return this.mesh.position }

  // Drop the player somewhere without walking them there, for `?project=` deep
  // links. `setTranslation` rather than `setNextKinematicTranslation`: the
  // latter is interpolated toward over the next step, which would slide the
  // character across the whole showroom instead of placing them.
  //
  // Velocity is cleared too. Landing at a kiosk carrying the momentum from
  // wherever the spawn was would walk them straight back out of the trigger
  // radius they were placed inside.
  teleport(position, facingY) {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true)
    this.mesh.position.set(position.x, position.y, position.z)
    this.velocity = { x: 0, z: 0 }
    this.verticalVelocity = 0
    this.blocked = false
    if (facingY !== undefined) this.mesh.rotation.y = facingY
  }

  // Footfalls the animated gait landed this frame, for the audio to sound. It
  // comes off the character rather than off distance travelled so a step is
  // heard exactly when a foot is planted, at any speed.
  get footfalls() { return this.character.footfalls }
}

function dampAngle(current, target, lambda, delta) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}
