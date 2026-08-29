// Headless check: drives the real level layout and the real character-controller
// config through Rapier in Node, so the walk can be verified without a browser.
//
//   node physics-smoke.mjs
//
import RAPIER from '@dimforge/rapier3d-compat'
import { buildLayout, SPAWN, CORRIDOR, WINGS } from './src/world/layout.js'

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

function spawnCharacter() {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y, SPAWN.z),
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

// 2. Walking north from the corridor at x=0 must hit the gap wall, not fall.
//    There is no wing at x=0 with an even wing count, so this is solid wall.
{
  const a = spawnCharacter()
  const r = walk(a, 240, () => ({ x: 0, z: -1 }))
  check('blocked by the corridor north wall between wings',
    r.minY > 0.5 && r.grounded,
    `ended (${r.x}, ${r.y}, ${r.z}), lowest y=${r.minY}`)
}

// 3. Walking into a wing doorway must reach the room and stay on its floor.
{
  const wing = WINGS[1]
  const a = spawnCharacter()
  // Strafe to line up with the doorway, then head north through it.
  const r = walk(a, 400, (f) => (f < 120 ? { x: -1, z: 0 } : { x: 0, z: -1 }))
  check(`walks through the "${wing.label}" doorway into the room`,
    r.minY > 0.5 && r.z < CORRIDOR.z - CORRIDOR.width / 2,
    `ended (${r.x}, ${r.y}, ${r.z}), lowest y=${r.minY}, wing x=${wing.x}`)
}

// 4. Walking east must stop at the corridor end cap.
{
  const a = spawnCharacter()
  const r = walk(a, 900, () => ({ x: 1, z: 0 }))
  check('stopped by the corridor end cap',
    r.minY > 0.5 && r.x < CORRIDOR.length / 2,
    `ended x=${r.x}, cap at ${CORRIDOR.length / 2}, lowest y=${r.minY}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
