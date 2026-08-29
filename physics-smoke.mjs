// Headless check: drives the real level layout and the real character-controller
// config through Rapier in Node, so the walk can be verified without a browser.
//
//   node physics-smoke.mjs
//
import RAPIER from '@dimforge/rapier3d-compat'
import {
  buildLayout, SPAWN, CORRIDOR, WINGS, ROOM,
  kioskPlacements, triggerPointFor, TRIGGER_RADIUS,
} from './src/world/layout.js'
import { byWing } from './src/data/projects.js'

await RAPIER.init()

const RADIUS = 0.4
const HALF_HEIGHT = 0.5
const SPEED = 6
const GRAVITY = -20
const REST_Y = 0 + HALF_HEIGHT + RADIUS   // floor top is y = 0

const world = new RAPIER.World({ x: 0, y: -20, z: 0 })

const layout = buildLayout()
for (const { position, size } of layout) {
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
  return { x: +p.x.toFixed(2), y: +p.y.toFixed(3), z: +p.z.toFixed(2), grounded, minY: +minY.toFixed(3) }
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
    walk(a, 260, () => {
      const p = a.body.translation()
      const dx = target.x - p.x
      const dz = target.z - p.z
      const len = Math.hypot(dx, dz) || 1
      return { x: dx / len, z: dz / len }
    })
    const p = a.body.translation()
    const d = Math.hypot(target.x - p.x, target.z - p.z)
    if (d > TRIGGER_RADIUS) unreachable.push(`${wingProjects[i].title} (${d.toFixed(2)}m short)`)
  }

  check(`all ${wingProjects.length} "${wing.label}" kiosks are reachable on foot`,
    unreachable.length === 0,
    unreachable.length ? `unreachable: ${unreachable.join('; ')}` : `all within ${TRIGGER_RADIUS}m trigger radius`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
