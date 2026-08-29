// Headless check: drives the real level layout and the real character-controller
// config through Rapier in Node, so the walk can be verified without a browser.
//
//   node physics-smoke.mjs
//
// Uses -compat here (not the app's plain build): Node cannot run Vite's WASM-ESM
// transform. Both packages are 0.20.0, so the API under test is identical.
import RAPIER from '@dimforge/rapier3d-compat'
import {
  buildLayout, SPAWN, CORRIDOR, WINGS, ROOM,
  kioskPlacements, triggerPointFor, TRIGGER_RADIUS,
} from './src/world/layout.js'
import { byWing } from './src/data/projects.js'
import { moveVector, cameraOffset, SPEED } from './src/world/movement.js'

await RAPIER.init()

const RADIUS = 0.4
const HALF_HEIGHT = 0.5
const GRAVITY = -20
const REST_Y = 0 + HALF_HEIGHT + RADIUS   // floor top is y = 0

const world = new RAPIER.World({ x: 0, y: -20, z: 0 })

const layout = buildLayout()
for (const { position, size, collide } of layout) {
  if (collide === false) continue
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
    body,
  )
}

function spawnCharacter(x = SPAWN.x, z = SPAWN.z) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, SPAWN.y, z),
  )
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), body)
  const controller = world.createCharacterController(0.02)
  controller.enableAutostep(0.5, 0.2, true)
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180)
  controller.setMinSlopeSlideAngle((30 * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.enableSnapToGround(0.4)
  return { body, collider, controller }
}

// Characters collide with each other, so a leftover body from an earlier check
// blocks the next one that spawns on the same tile. Every test must clean up.
function despawn(actor) {
  world.removeCharacterController(actor.controller)
  world.removeRigidBody(actor.body)
}

// Walks a character for `frames` along a per-frame direction, returns the trace.
function walk(actor, frames, dirFn) {
  const delta = 1 / 60
  let vy = 0
  let grounded = false
  let minY = Infinity

  for (let f = 0; f < frames; f++) {
    const dir = dirFn(f)
    if (grounded) vy = -1
    else vy += GRAVITY * delta

    actor.controller.computeColliderMovement(actor.collider, {
      x: dir.x * SPEED * delta,
      y: vy * delta,
      z: dir.z * SPEED * delta,
    })
    const moved = actor.controller.computedMovement()
    grounded = actor.controller.computedGrounded()

    const t = actor.body.translation()
    actor.body.setNextKinematicTranslation({
      x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z,
    })

    world.timestep = delta
    world.step()
    minY = Math.min(minY, actor.body.translation().y)
  }

  const p = actor.body.translation()
  const result = { x: +p.x.toFixed(2), y: +p.y.toFixed(3), z: +p.z.toFixed(2), grounded, minY: +minY.toFixed(3) }
  despawn(actor)
  return result
}

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

console.log(`corridor.z = ${CORRIDOR.z}, floor z extent = [${CORRIDOR.z - CORRIDOR.width / 2}, ${CORRIDOR.z + CORRIDOR.width / 2}]`)
console.log(`spawn = (${SPAWN.x}, ${SPAWN.y}, ${SPAWN.z}), ${layout.length} static boxes, ${WINGS.length} wings\n`)

// 1. Spawn and settle.
{
  const a = spawnCharacter()
  const r = walk(a, 120, () => ({ x: 0, z: 0 }))
  check('spawns on the floor and settles',
    Math.abs(r.y - REST_Y) < 0.06 && r.grounded,
    `rest y=${r.y} (expected ~${REST_Y}), grounded=${r.grounded}`)
}

const northZ = CORRIDOR.z - CORRIDOR.width / 2

// 2. Walking north from BETWEEN two rooms must hit the gap wall, not fall through.
//    x is derived from the layout so this holds at any wing count.
{
  const gapX = (WINGS[0].x + ROOM.width / 2 + (WINGS[1].x - ROOM.width / 2)) / 2
  const a = spawnCharacter(gapX)
  const r = walk(a, 240, () => ({ x: 0, z: -1 }))
  check('blocked by the corridor north wall between wings',
    r.minY > 0.5 && r.z > northZ - 0.5,
    `started x=${gapX}, ended (${r.x}, ${r.y}, ${r.z}), wall at z=${northZ}, lowest y=${r.minY}`)
}

// 3. Walking north from a wing's centre must pass through the doorway into the room.
for (const wing of WINGS) {
  const a = spawnCharacter(wing.x)
  const r = walk(a, 300, () => ({ x: 0, z: -1 }))
  check(`walks through the "${wing.label}" doorway`,
    r.minY > 0.5 && r.z < northZ,
    `ended (${r.x}, ${r.y}, ${r.z}), doorway at z=${northZ}, lowest y=${r.minY}`)
}

// 4. Walking east must stop at the corridor end cap.
{
  const a = spawnCharacter()
  const r = walk(a, 900, () => ({ x: 1, z: 0 }))
  check('stopped by the corridor end cap',
    r.minY > 0.5 && r.x < CORRIDOR.length / 2,
    `ended x=${r.x}, cap at ${CORRIDOR.length / 2}, lowest y=${r.minY}`)
}

// 4b. Camera-relative movement. W must walk AWAY from the camera at every yaw —
//     the bug this guards against had forward and back swapped.
{
  const yaws = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3, 2.7]
  const dot = (a, b) => a.x * b.x + a.z * b.z
  const near = (a, b) => Math.abs(a - b) < 1e-9

  const bad = []
  for (const yaw of yaws) {
    const toCamera = cameraOffset(yaw)
    const w = moveVector({ x: 0, z: -1 }, yaw)   // forward
    const s = moveVector({ x: 0, z: 1 }, yaw)    // back
    const d = moveVector({ x: 1, z: 0 }, yaw)    // strafe right

    if (!near(dot(w, toCamera), -1)) bad.push(`yaw ${yaw.toFixed(2)}: W dot toCamera = ${dot(w, toCamera).toFixed(3)}, want -1`)
    if (!near(dot(s, toCamera), 1)) bad.push(`yaw ${yaw.toFixed(2)}: S dot toCamera = ${dot(s, toCamera).toFixed(3)}, want +1`)
    if (!near(dot(d, toCamera), 0)) bad.push(`yaw ${yaw.toFixed(2)}: D not perpendicular (${dot(d, toCamera).toFixed(3)})`)
    if (!near(Math.hypot(w.x, w.z), 1)) bad.push(`yaw ${yaw.toFixed(2)}: W not unit length`)
  }

  check('W walks away from the camera, S toward it, D perpendicular',
    bad.length === 0,
    bad.length ? bad.join('; ') : `verified at ${yaws.length} camera angles`)
}

// 4c. The same thing physically: at yaw 0 the camera sits at +z, so W must
//     decrease the player's z and S must increase it.
{
  const forward = spawnCharacter()
  const rf = walk(forward, 90, () => moveVector({ x: 0, z: -1 }, 0))
  const back = spawnCharacter()
  const rb = walk(back, 90, () => moveVector({ x: 0, z: 1 }, 0))

  check('pressing W moves the player forward, S moves them back',
    rf.z < SPAWN.z - 1 && rb.z > SPAWN.z + 1,
    `from z=${SPAWN.z}: W -> z=${rf.z}, S -> z=${rb.z}`)
}

// 5. Every kiosk must sit inside its room and be physically reachable.
//    Geometry first (cheap, catches a bad placement formula), then an actual
//    walk from the room centre to each hotspot.
{
  const margin = 0.6
  let allInside = true
  const strays = []

  for (const wing of WINGS) {
    const wingProjects = byWing(wing.id)
    for (const [i, placement] of kioskPlacements(wing, wingProjects.length).entries()) {
      const t = triggerPointFor(placement)
      const inside =
        t.x > wing.x - ROOM.width / 2 + margin &&
        t.x < wing.x + ROOM.width / 2 - margin &&
        t.z > ROOM.z - ROOM.depth / 2 + margin &&
        t.z < ROOM.z + ROOM.depth / 2 - margin
      if (!inside) {
        allInside = false
        strays.push(`${wingProjects[i].title} @ (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`)
      }
    }
  }
  check('every kiosk hotspot is inside its room',
    allInside,
    allInside ? `all hotspots within room bounds` : `outside: ${strays.join('; ')}`)
}

for (const wing of WINGS) {
  const wingProjects = byWing(wing.id)
  const placements = kioskPlacements(wing, wingProjects.length)
  const unreachable = []

  for (const [i, placement] of placements.entries()) {
    const target = triggerPointFor(placement)
    // Start in the middle of the room and steer straight at the hotspot.
    const a = spawnCharacter(wing.x, ROOM.z)
    const r = walk(a, 260, () => {
      const p = a.body.translation()
      const dx = target.x - p.x
      const dz = target.z - p.z
      const len = Math.hypot(dx, dz) || 1
      return { x: dx / len, z: dz / len }
    })
    const d = Math.hypot(target.x - r.x, target.z - r.z)
    if (d > TRIGGER_RADIUS) unreachable.push(`${wingProjects[i].title} (${d.toFixed(2)}m short)`)
  }

  check(`all ${wingProjects.length} "${wing.label}" kiosks are reachable on foot`,
    unreachable.length === 0,
    unreachable.length ? `unreachable: ${unreachable.join('; ')}` : `all within ${TRIGGER_RADIUS}m trigger radius`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
