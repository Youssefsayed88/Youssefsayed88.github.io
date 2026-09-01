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
import {
  moveVector, cameraOffset, stepVelocity, resolveVelocity, stepJump, jumpApex,
  GROUND_STICK, SPEED, SPRINT_MULTIPLIER, ACCELERATION, BRAKING,
  JUMP_BUFFER, RISE_GRAVITY, FALL_GRAVITY,
} from './src/world/movement.js'

await RAPIER.init()

const RADIUS = 0.4
const HALF_HEIGHT = 0.5
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
//
// Velocity is eased through the SAME stepVelocity/resolveVelocity the browser
// runs, not a straight `dir * SPEED * delta`. The point of this harness is that
// it drives the real movement model; once the player gained momentum, a test
// that teleports to top speed on frame 1 would stop being evidence about the
// thing that ships — in particular it could never catch momentum tunnelling.
function walk(actor, frames, dirFn, { sprinting = false } = {}) {
  const delta = 1 / 60
  const speed = SPEED * (sprinting ? SPRINT_MULTIPLIER : 1)
  let velocity = { x: 0, z: 0 }
  // The vertical model is stepJump's even when nothing jumps: gravity and the
  // ground stick both live in there, so a local copy of either here would be
  // the exact drift this harness exists to prevent.
  let air = { verticalVelocity: 0, coyote: 0, jumpBuffer: 0, jumpHeld: false }
  let grounded = false
  let blocked = false
  let minY = Infinity
  let maxSpeed = 0
  // Frames on which the controller returned far less than it was asked for on
  // open floor. Should be none; see GROUND_STICK.
  let refusals = 0

  for (let f = 0; f < frames; f++) {
    const dir = dirFn(f)
    velocity = stepVelocity(velocity, { x: dir.x * speed, z: dir.z * speed }, delta)
    maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.z))

    air = stepJump(air, { delta, wantsJump: false, grounded })

    actor.controller.computeColliderMovement(actor.collider, {
      x: velocity.x * delta,
      y: air.verticalVelocity * delta,
      z: velocity.z * delta,
    })
    const moved = actor.controller.computedMovement()
    grounded = actor.controller.computedGrounded()

    const wanted = Math.hypot(velocity.x, velocity.z)
    if (wanted > 4 && Math.hypot(moved.x, moved.z) / delta < wanted * 0.9) refusals++

    const t = actor.body.translation()
    actor.body.setNextKinematicTranslation({
      x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z,
    })
    const resolved = resolveVelocity(velocity, moved, delta, blocked)
    velocity = { x: resolved.x, z: resolved.z }
    blocked = resolved.blocked

    world.timestep = delta
    world.step()
    minY = Math.min(minY, actor.body.translation().y)
  }

  const p = actor.body.translation()
  const result = {
    x: +p.x.toFixed(2), y: +p.y.toFixed(3), z: +p.z.toFixed(2),
    grounded, minY: +minY.toFixed(3), maxSpeed: +maxSpeed.toFixed(2), refusals,
  }
  despawn(actor)
  return result
}

// Drives the vertical model through the real controller and reports the shape
// of the arc. Standing still, because the jump's height and timing are what is
// under test and horizontal movement only adds solver noise to them.
//
// `press(f)` is the jump input, f counted from the moment the character has
// settled on the floor. Returns metres risen above the resting height, the two
// halves of the arc separately — the point of the asymmetric gravity is that
// they differ — and how many separate jumps fired, which is what catches a
// held key auto-hopping.
function jump(actor, press, { fps = 60, frames = 300 } = {}) {
  const delta = 1 / fps
  const settle = Math.ceil(0.6 * fps)   // long enough to fall from SPAWN.y and rest

  let state = { verticalVelocity: 0, coyote: 0, jumpBuffer: 0, jumpHeld: false }
  let grounded = false
  let restY = null
  let peak = -Infinity
  let jumps = 0
  let tookOff = null
  let apexAt = null
  let landedAt = null
  let lastY = null

  for (let f = 0; f < settle + frames; f++) {
    const i = f - settle
    if (i === 0) restY = actor.body.translation().y

    state = stepJump(state, {
      delta,
      wantsJump: i >= 0 ? !!press(i) : false,
      grounded,
    })
    if (state.jumped) {
      jumps++
      if (tookOff === null) tookOff = i
    }

    actor.controller.computeColliderMovement(actor.collider, {
      x: 0, y: state.verticalVelocity * delta, z: 0,
    })
    const moved = actor.controller.computedMovement()
    grounded = actor.controller.computedGrounded()

    const t = actor.body.translation()
    actor.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z })
    world.timestep = delta
    world.step()

    const y = actor.body.translation().y
    if (i >= 0) {
      peak = Math.max(peak, y)
      // Apex is the first frame the character stops going up after taking off;
      // landing is the first time the controller reports ground under it again.
      if (tookOff !== null && apexAt === null && lastY !== null && y <= lastY) apexAt = i
      if (apexAt !== null && landedAt === null && grounded) landedAt = i
      lastY = y
    }
  }

  despawn(actor)
  return {
    rise: +(peak - restY).toFixed(3),
    jumps,
    riseTime: tookOff !== null && apexAt !== null ? +((apexAt - tookOff) * delta).toFixed(3) : null,
    fallTime: apexAt !== null && landedAt !== null ? +((landedAt - apexAt) * delta).toFixed(3) : null,
    airtime: tookOff !== null && landedAt !== null ? +((landedAt - tookOff) * delta).toFixed(3) : null,
  }
}

const held = () => true
const tap = (n) => (i) => i < n

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

// 4d. The acceleration curve itself. Pure maths, no physics — this pins the
//      tuning so a later tweak cannot quietly turn the walk into a glide.
{
  const delta = 1 / 60
  const top = SPEED

  let v = { x: 0, z: 0 }
  let toSpeed = Infinity
  for (let f = 0; f < 240; f++) {
    v = stepVelocity(v, { x: 0, z: -top }, delta)
    if (Math.hypot(v.x, v.z) >= top * 0.95) { toSpeed = (f + 1) * delta; break }
  }

  // Now release the key and measure how far they coast.
  let coast = 0
  for (let f = 0; f < 240; f++) {
    v = stepVelocity(v, { x: 0, z: 0 }, delta)
    coast += Math.hypot(v.x, v.z) * delta
    if (Math.hypot(v.x, v.z) < 0.05) break
  }

  const ok = toSpeed < 0.25 && coast < 0.5
  check('accelerates and stops inside the tuned windows',
    ok,
    `accel ${ACCELERATION}/brake ${BRAKING}: ${(toSpeed * 1000).toFixed(0)}ms to 95% of ${top}m/s, ` +
    `coasts ${coast.toFixed(2)}m after release (want <250ms, <0.5m)`)
}

// 4da. The walk must be SMOOTH, not merely fast on average.
//
//      This is the regression test for the stutter. The character controller
//      used to refuse roughly one frame in forty on open, flat floor — it was
//      undoing the stick-down force that fought its own skin offset — and the
//      velocity fold-back read each refusal as a wall and threw the player's
//      momentum away. The walk was a series of re-accelerations from zero.
//
//      A long run of empty corridor, at speed, stopping well short of the end
//      cap so that every frame counted is open floor: the controller must
//      deliver what it is asked for on every single one of them.
{
  const frames = 400
  const from = -35
  const a = spawnCharacter(from, CORRIDOR.z)
  const r = walk(a, frames, () => ({ x: 1, z: 0 }))
  const clearOfTheCap = r.x < CORRIDOR.length / 2 - 6
  check('the controller never refuses a frame on open floor',
    r.refusals === 0 && clearOfTheCap,
    `${r.refusals} refused frames over ${(r.x - from).toFixed(0)}m of flat corridor ` +
    `(ground stick ${GROUND_STICK}), ended x=${r.x} with the cap at ${CORRIDOR.length / 2}`)
}

// 4db. And if one ever does happen — on geometry this level does not have yet,
//      or on a Rapier that behaves differently — a SINGLE refused frame must
//      not cost the player their momentum. Two in a row still must.
{
  const delta = 1 / 60
  const fast = { x: 8, z: 0 }
  const refused = { x: 0, y: 0, z: 0 }
  const free = { x: 8 * delta, y: 0, z: 0 }

  const once = resolveVelocity(fast, refused, delta, false)
  const twice = resolveVelocity({ x: once.x, z: once.z }, refused, delta, once.blocked)
  const clear = resolveVelocity(fast, free, delta, false)

  check('one refused frame keeps the momentum, two in a row do not',
    once.x === 8 && once.blocked && twice.x === 0 && clear.x === 8 && !clear.blocked,
    `after one refusal ${once.x.toFixed(1)}m/s, after two ${twice.x.toFixed(1)}m/s, ` +
    `unobstructed ${clear.x.toFixed(1)}m/s`)
}

// 4e. Momentum must not tunnel. Sprinting flat into the end cap is the fastest
//      the player can ever hit geometry, so it is the worst case for the
//      character controller and for the velocity fold-back.
{
  const a = spawnCharacter()
  const r = walk(a, 900, () => ({ x: 1, z: 0 }), { sprinting: true })
  const expectedTop = SPEED * SPRINT_MULTIPLIER
  check('sprinting into the corridor end cap does not tunnel through it',
    r.minY > 0.5 && r.x < CORRIDOR.length / 2 && r.maxSpeed > expectedTop * 0.95,
    `ended x=${r.x} (cap at ${CORRIDOR.length / 2}), peak ${r.maxSpeed}m/s ` +
    `of ${expectedTop.toFixed(1)} sprint, lowest y=${r.minY}`)
}

// 4f. The jump. None of this was covered before, and all three of the defects
//     it now pins were shipped: the arc was a 1.47 m floater, a tap and a
//     one-second hold produced the same height to within 6 mm, and a press
//     buffered before landing was dropped on a slow frame.
{
  const a = spawnCharacter()
  const r = jump(a, held)
  const want = jumpApex(1)
  check('a held jump reaches the tuned apex and comes back down',
    Math.abs(r.rise - want) < 0.03 && r.airtime > 0.35 && r.airtime < 0.7,
    `rose ${r.rise}m (model says ${want.toFixed(3)}), airtime ${r.airtime}s ` +
    `(${r.riseTime}s up, ${r.fallTime}s down)`)
}

// The one that matters most: the control has to have more than one output.
{
  const short = jump(spawnCharacter(), tap(1))
  const long = jump(spawnCharacter(), held)
  check('tapping jumps lower than holding',
    short.rise < long.rise * 0.55 && short.rise > 0.15,
    `tap ${short.rise}m vs hold ${long.rise}m ` +
    `(was identical to within 6mm before the release cut)`)
}

// Asymmetric gravity, stated as the thing you can see rather than as the two
// constants: the way down is quicker than the way up.
{
  const r = jump(spawnCharacter(), held)
  check('the arc falls faster than it rises',
    r.fallTime < r.riseTime,
    `${r.riseTime}s up, ${r.fallTime}s down ` +
    `(gravity ${RISE_GRAVITY} rising, ${FALL_GRAVITY} falling)`)
}

// The release cut is applied once, on the release edge, precisely so the height
// cannot depend on how many frames the machine drew. A phone at 30 and a
// monitor at 144 must jump the same height.
{
  // 0.1s is a whole number of frames at all three rates, so the release edge
  // falls at the same MOMENT in each run rather than at the same frame index —
  // otherwise the test would be measuring its own rounding.
  const rates = [30, 60, 120]
  const holdFor = (fps) => (i) => i * (1 / fps) < 0.0999

  const tapped = rates.map((fps) => jump(spawnCharacter(), holdFor(fps), { fps }).rise)
  const fully = rates.map((fps) => jump(spawnCharacter(), held, { fps }).rise)
  const spread = (a) => Math.max(...a) - Math.min(...a)

  check('the same press jumps the same height at 30, 60 and 120fps',
    spread(tapped) < 0.06 && spread(fully) < 0.06,
    `tapped ${rates.map((f, i) => `${f}fps ${tapped[i]}m`).join(', ')} (spread ${spread(tapped).toFixed(3)}m); ` +
    `held ${rates.map((f, i) => `${f}fps ${fully[i]}m`).join(', ')} (spread ${spread(fully).toFixed(3)}m)`)
}

// Buffering: a press made while still falling has to survive until touchdown.
// The landing frame comes from a first run, so the press is aimed at a real
// landing rather than at a guess.
{
  const probe = jump(spawnCharacter(), tap(1))
  const fps = 60
  const landing = Math.round((probe.airtime ?? 0) * fps)
  // Pressed most of a buffer BEFORE the character is back on the ground.
  const early = landing - Math.floor(JUMP_BUFFER * fps * 0.8)

  const r = jump(spawnCharacter(), (i) => i < 1 || (i >= early && i < early + 2), { fps })
  check('a press made before touchdown still fires on landing',
    r.jumps === 2,
    `pressed ${((landing - early) / fps).toFixed(3)}s before landing ` +
    `(buffer ${JUMP_BUFFER}s), got ${r.jumps} jumps`)
}

// And the other half of the edge trigger: resting on the key must not pogo.
{
  const r = jump(spawnCharacter(), held, { frames: 400 })
  check('holding jump does not auto-hop on every landing',
    r.jumps === 1,
    `${r.jumps} jump from a key held for ${(400 / 60).toFixed(1)}s`)
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
