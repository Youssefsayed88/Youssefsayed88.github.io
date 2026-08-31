// The measurement behind GROUND_STICK in src/world/movement.js.
//
//   node scripts/ground-stick.mjs
//
// GROUND_STICK is zero, and a zero is the easiest constant in a codebase for
// someone to "fix" — a small downward force to hold the character against the
// floor is the obvious thing to write, and it is what used to be here. This
// script is the evidence for why not, runnable in a second, so the question
// gets settled with numbers instead of intuition.
//
// It walks the real level with the real movement model at a fixed 1/60 step —
// no browser, no frame-time noise — and counts how often Rapier's character
// controller REFUSES a frame: returns far less horizontal movement than it was
// asked for, on flat open corridor with nothing to collide with. Every refusal
// is a stutter, because a sustained refusal is indistinguishable from a wall
// and resolveVelocity has to take the player's momentum away.
//
// Uses -compat, like physics-smoke.mjs, for the same reason: Node cannot run
// Vite's WASM-ESM transform. Same version, same solver.
import RAPIER from '@dimforge/rapier3d-compat'
import { buildLayout, SPAWN, CORRIDOR } from '../src/world/layout.js'
import { stepVelocity, resolveVelocity, SPEED, GROUND_STICK } from '../src/world/movement.js'

await RAPIER.init()

// Kept in step with Player.js.
const RADIUS = 0.4
const HALF_HEIGHT = 0.5
const GRAVITY = -20
const OFFSET = 0.02          // the character controller's skin width
const DT = 1 / 60

// Frames to discard at the start of a lap. The character spawns in the air and
// has to fall; measuring vertical movement across that drop would report the
// spawn height in every row and say nothing about the walk.
const SETTLE = 120

// Walk one long lap of empty corridor and report what the controller did with it.
function lap(stick, frames = 900) {
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 })
  for (const { position, size, collide } of buildLayout()) {
    if (collide === false) continue
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2), body,
    )
  }

  // Start at the far west end so the whole lap is open floor.
  const start = -CORRIDOR.length / 2 + 4
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start, SPAWN.y, CORRIDOR.z),
  )
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), body)
  const controller = world.createCharacterController(OFFSET)
  controller.enableAutostep(0.5, 0.2, true)
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
  controller.setMinSlopeSlideAngle((30 * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.enableSnapToGround(0.4)

  let velocity = { x: 0, z: 0 }
  let vy = 0
  let grounded = false
  let blocked = false
  let refusals = 0
  let lifted = 0
  let counted = 0
  let buzz = 0                 // summed frame-to-frame |dy|
  let previousY = null

  for (let f = 0; f < frames; f++) {
    // East until the end cap is in sight, then turn round. Never touches it.
    const t = body.translation()
    const dir = t.x > CORRIDOR.length / 2 - 10 ? -1 : 1

    velocity = stepVelocity(velocity, { x: dir * SPEED, z: 0 }, DT)
    if (grounded) vy = stick
    else vy += GRAVITY * DT

    controller.computeColliderMovement(collider, {
      x: velocity.x * DT, y: vy * DT, z: velocity.z * DT,
    })
    const moved = controller.computedMovement()
    grounded = controller.computedGrounded()

    // Only judge frames where the player is up to speed and long since settled:
    // the acceleration ramp, the turn and the spawn drop are none of them what
    // is under test.
    const wanted = Math.hypot(velocity.x, velocity.z)
    if (f > SETTLE && wanted > SPEED * 0.9) {
      counted++
      if (Math.hypot(moved.x, moved.z) / DT < wanted * 0.9) refusals++
      if (moved.y > 1e-9) lifted++
      // Vertical movement from one frame to the next on dead-flat floor. A slow
      // drift is invisible; this alternating buzz is not, and it is what a
      // stick-down force fighting the controller's own skin produces.
      if (previousY !== null) buzz += Math.abs(t.y - previousY)
      previousY = t.y
    }

    body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z })
    const resolved = resolveVelocity(velocity, moved, DT, blocked)
    velocity = { x: resolved.x, z: resolved.z }
    blocked = resolved.blocked

    world.timestep = DT
    world.step()
  }

  return {
    refusals,
    counted,
    liftedPct: (100 * lifted) / counted,
    buzzMm: (1000 * buzz) / counted,
  }
}

console.log('Grounded stick-down force vs. character controller refusals.')
console.log(`The controller's skin offset is ${OFFSET} m. At 60Hz a stick-down of -1 m/s asks`)
console.log(`to move ${(1 * DT * 1000).toFixed(1)} mm down every frame — into that same skin.`)
console.log('')
console.log('  stick    refused frames    solver pushed up    vertical buzz')
console.log('  -----    --------------    ----------------    -------------')

for (const stick of [-2, -1, -0.5, -0.2, -0.1, -0.05, 0]) {
  const r = lap(stick)
  const mark = stick === GROUND_STICK ? '  <- GROUND_STICK' : ''
  console.log(
    `  ${String(stick).padStart(5)}    ${String(r.refusals).padStart(4)} / ${String(r.counted).padEnd(7)}` +
    `    ${r.liftedPct.toFixed(0).padStart(3)}% of frames    ` +
    `${r.buzzMm.toFixed(3).padStart(6)} mm/frame${mark}`,
  )
}

console.log('')
console.log('A refusal is a frame where the player asked to move at speed and the')
console.log('controller returned almost nothing, on open floor. Each one is a stutter.')
console.log('Buzz is mean frame-to-frame vertical movement on flat ground, which the')
console.log('camera target follows.')
