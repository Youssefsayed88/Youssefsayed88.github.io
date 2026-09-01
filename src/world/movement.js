// Camera-relative movement, kept free of THREE so it can be tested headlessly.
//
// The camera orbits to `target + cameraOffset(yaw) * distance`, so the player's
// forward direction — away from the camera, into the screen — is the NEGATION
// of that offset. Getting this backwards is what made W walk backwards.

// Walk speed in metres/second. Lives here rather than in Player.js so
// physics-smoke.mjs exercises the real value instead of a copy of it.
// The corridor is ~104 long, so this sets how long crossing it feels.
export const SPEED = 8

// Shift (or L3, or a deep touch drag) multiplies it. Sized so the corridor is
// crossable without boredom while a room stays walkable at base speed.
export const SPRINT_MULTIPLIER = 1.55

// How fast velocity closes on the target, per second. Braking is quicker than
// acceleration so stopping stays precise — you park in front of a kiosk far
// more often than you launch off the line, and overshooting a kiosk by half a
// metre is the difference between the prompt appearing and not.
//
// Time to ~95% of a target is 3/rate: ~0.15s to top speed, ~0.11s to a stop.
// Fast enough to feel responsive, slow enough that the camera is not snapped
// around by a single tap.
export const ACCELERATION = 20
export const BRAKING = 28

// Downward velocity applied while already standing on something — and it is
// ZERO, which is the whole point of it having a name.
//
// The obvious thing to write here is a small "stick-down force" to hold the
// capsule against the floor. That is what used to be here (-1 m/s), and it is
// what made the walk stutter. The mechanism, because the fix looks like a
// no-op:
//
// The character controller is created with a 0.02 m skin offset and keeps the
// capsule that far ABOVE the floor. A stick-down of -1 m/s asks to move 16.7 mm
// down in a 60Hz frame — the same order as the skin. So every frame the solver
// was asked to push the capsule into its own skin and had to undo it, and
// measurably did: it returned an upward correction on 96% of frames, against
// 29% at zero. On some of those frames the depenetration ate the horizontal
// budget as well and the controller returned near-zero movement for a full
// stride's worth of request. resolveVelocity below then read that as a wall and
// threw the player's momentum away, so they re-accelerated from a standstill
// several times a second. That is what the "jittery walk" was.
//
// Over a lap of flat corridor at speed, every non-zero value tried refuses
// between 3 and 11 frames out of ~390. Zero refuses none, and the character
// stays grounded exactly as often — enableSnapToGround(0.4) in Player.js is
// what holds the floor, and it does not need the help. Run the numbers
// yourself: node scripts/ground-stick.mjs
export const GROUND_STICK = 0

// ---------------------------------------------------------------------------
// The jump.
//
// It lives here, next to the walk, for the reason everything else here does:
// physics-smoke.mjs can then drive the shipped model instead of a copy of its
// arithmetic. It did not, and the three things below were the cost of that.
//
// What was wrong. The old model was a single constant pair — JUMP 7.5 against a
// flat GRAVITY of -20 — and it fired perfectly every time. Measured in a real
// browser it rose 1.47 m and hung for 0.75 s, which is the problem twice over:
//
//  - 1.47 m is a body height. The character is 1.8 m and the doorways are 4.5 m
//    wide; nothing in this building is 1.4 m high, so the jump was clearing an
//    obstacle that does not exist and reading as low gravity.
//  - Tapping the key and holding it for a second produced the SAME 1.23 m rise,
//    to within 6 mm. There was no variable height at all: every press was the
//    maximum one, so the control had exactly one output and the player's timing
//    could not express anything.
//
// And it sat oddly against the walk right next to it, which reaches full speed
// in 150 ms and stops in 110 ms. The ground movement is crisp and the air
// movement was floaty; they read as two different games.
//
// What replaces it. Three standard platformer devices, none of them exotic:
//
//  - ASYMMETRIC GRAVITY. Falling is heavier than rising, so the arc spends its
//    time near the ground where the player can read it rather than hanging at
//    the top. This is the single biggest contributor to a jump feeling "solid".
//  - A CUT ON RELEASE. Letting go while still rising scales the remaining
//    upward velocity, so a tap is a hop and a hold is a jump. Applied once, on
//    the release edge, so it does not depend on frame rate.
//  - A LOWER APEX. Sized to the building: 1.11 m clears the 1.0 m kiosk
//    plinths, which is the only thing here worth clearing.
//
// Rise 7.6 m/s against -26 gives an apex of 1.11 m in 0.29 s; the fall back at
// -42 takes 0.23 s. Airtime 0.52 s against the old 0.75.
export const JUMP_SPEED = 7.6
export const RISE_GRAVITY = -26
export const FALL_GRAVITY = -42

// What a release keeps of the rise still to come. 0.5 makes the shortest
// possible tap a ~0.28 m hop against the full jump's 1.11 m — different enough
// to be worth aiming for, big enough not to feel like a failed input.
export const JUMP_CUT = 0.5

// Jump forgiveness. Both windows are short enough to be invisible and long
// enough to cover the two ways a jump gets eaten: pressing a few frames after
// walking off an edge, and pressing a few frames before landing.
export const COYOTE_TIME = 0.12

// The buffer was 0.15 s, which is three frames on a phone holding 20fps — and a
// measured second press 0.12 s before touchdown was silently dropped. It is
// sized against the airtime rather than against a frame count, so a press
// aimed at the landing lands.
export const JUMP_BUFFER = 0.2

// Gravity is a function of which half of the arc we are in, which is what
// "asymmetric" means in practice. Falling off a ledge gets the heavy value too:
// the weight should be a property of the character, not of how they left the
// ground.
export const gravityFor = (verticalVelocity) =>
  (verticalVelocity > 0 ? RISE_GRAVITY : FALL_GRAVITY)

// One frame of the vertical model.
//
// `state` carries the four values that have to survive between frames:
// verticalVelocity, coyote, jumpBuffer and jumpHeld. Returns the next state
// plus `jumped`, which is true only on the frame a jump actually fires.
//
// Pure, so the whole thing — coyote time, buffering, the release cut and the
// two gravities — is checked in physics-smoke.mjs against the real Rapier
// controller rather than trusted.
export function stepJump(state, { delta, wantsJump, grounded }) {
  // Edge-triggered: holding the key does not re-arm the buffer, so resting a
  // finger on space no longer auto-hops on every landing.
  const pressed = wantsJump && !state.jumpHeld
  const released = !wantsJump && state.jumpHeld

  let coyote = grounded ? COYOTE_TIME : Math.max(0, state.coyote - delta)
  let jumpBuffer = pressed ? JUMP_BUFFER : Math.max(0, state.jumpBuffer - delta)
  let verticalVelocity = state.verticalVelocity
  let jumped = false

  if (jumpBuffer > 0 && coyote > 0) {
    // Half a frame of gravity, taken off the launch.
    //
    // Without it the jump is measurably HIGHER on a slow machine: the takeoff
    // frame moves at the full launch speed before gravity has been applied even
    // once, so the arc carries a bias of v*dt/2 — 1.24 m at 30fps against 1.14 m
    // at 120fps for the same press. That is the same frame-rate dependence the
    // walk's `1 - e^-kt` easing exists to avoid, left in the one part of the
    // movement model that had no test to catch it.
    //
    // Subtracting half a step of gravity here is the standard leapfrog
    // correction and cancels the bias to second order: every rate now apexes at
    // jumpApex(1) to within a couple of millimetres.
    verticalVelocity = JUMP_SPEED + gravityFor(JUMP_SPEED) * delta * 0.5
    jumpBuffer = 0
    coyote = 0                 // no double jump off one window
    jumped = true
  } else if (grounded) {
    // Zero, deliberately. See GROUND_STICK above — a stick-down force here
    // fights the character controller's own skin offset, and that fight was the
    // stutter in the walk.
    verticalVelocity = GROUND_STICK
  } else {
    // The cut goes before gravity, and only on the frame the key came up while
    // still climbing. Scaling every airborne frame instead would make the
    // height depend on how many frames the machine managed to draw.
    if (released && verticalVelocity > 0) verticalVelocity *= JUMP_CUT
    verticalVelocity += gravityFor(verticalVelocity) * delta
  }

  return { verticalVelocity, coyote, jumpBuffer, jumpHeld: wantsJump, jumped }
}

// Apex of a jump released at `heldFraction` of its rise, in metres. Exists so
// the test can state the heights it expects in metres rather than restating the
// integration, and so the tuning above can be checked by reading it.
export function jumpApex(heldFraction = 1) {
  const full = (JUMP_SPEED * JUMP_SPEED) / (2 * -RISE_GRAVITY)
  if (heldFraction >= 1) return full

  // Height reached before the cut, plus what the cut velocity still buys.
  const cutSpeed = JUMP_SPEED * (1 - heldFraction)
  const risen = full - (cutSpeed * cutSpeed) / (2 * -RISE_GRAVITY)
  const after = cutSpeed * JUMP_CUT
  return risen + (after * after) / (2 * -RISE_GRAVITY)
}

// How far short of the requested speed the solver has to land before the player
// is treated as blocked. Generous, because the solver routinely returns a hair
// under what was asked (float noise, a slope's slide) and none of that is a
// wall.
const BLOCKED_BELOW = 0.9

// Unit vector from the player toward the camera, on the ground plane.
export function cameraOffset(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) }
}

// Unit vector the player moves along for a full-forward press.
export function forwardVector(yaw) {
  const o = cameraOffset(yaw)
  return { x: -o.x, z: -o.z }
}

// Right-hand strafe direction: cross(forward, up).
export function rightVector(yaw) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) }
}

// axis.z is -1 for forward (W) and +1 for back (S); axis.x is +1 for right (D).
// Composing from the basis vectors above keeps the signs honest.
export function moveVector(axis, yaw) {
  const f = forwardVector(yaw)
  const r = rightVector(yaw)
  // axis.z === -1 means "forward", hence the negation onto f.
  return {
    x: r.x * axis.x + f.x * -axis.z,
    z: r.z * axis.x + f.z * -axis.z,
  }
}

// The velocity a full press should settle at, in metres/second.
export function desiredVelocity(axis, yaw, sprinting = false) {
  const dir = moveVector(axis, yaw)
  const speed = SPEED * (sprinting ? SPRINT_MULTIPLIER : 1)
  return { x: dir.x * speed, z: dir.z * speed }
}

// Advance velocity one frame toward `desired`.
//
// Exponential approach rather than a linear ramp: it is frame-rate independent
// by construction (the same 1 - e^-kt used for the camera and the turn damping),
// so a 144Hz monitor and a 30Hz phone reach top speed in the same wall-clock
// time. A linear `v += a * delta` clamp does not — it overshoots on long frames.
export function stepVelocity(velocity, desired, delta) {
  const stopping = desired.x === 0 && desired.z === 0
  const t = 1 - Math.exp(-(stopping ? BRAKING : ACCELERATION) * delta)
  return {
    x: velocity.x + (desired.x - velocity.x) * t,
    z: velocity.z + (desired.z - velocity.z) * t,
  }
}

// Fold the movement the solver actually allowed back into velocity.
//
// Walking into a wall zeroes the applied movement but not the intent. Without
// this the player keeps "running" at full speed against the wall and then
// rockets sideways the instant the wall ends — the classic momentum bug that
// only appears once velocity is persistent.
//
// The fold is deferred by one frame, which is the second half of the stutter
// fix described on GROUND_STICK above. A character controller can refuse a
// frame for reasons that are not geometry — its own depenetration, most of all
// — and a single refused frame taken at face value costs the player everything
// they had built up. So one refusal is noise and is ignored; two in a row is a
// wall and is believed. The player's POSITION is the solver's call either way,
// on both frames, so nothing is tunnelled through: this defers the bookkeeping,
// not the collision. A real wall still takes the momentum ~16ms later, which is
// not a duration anybody can see.
//
// `wasBlocked` is last frame's answer; the caller carries it.
export function resolveVelocity(velocity, moved, delta, wasBlocked = false) {
  if (delta <= 0) return { x: velocity.x, z: velocity.z, blocked: false }

  const actual = { x: moved.x / delta, z: moved.z / delta }
  const wanted = Math.hypot(velocity.x, velocity.z)
  const allowed = Math.hypot(actual.x, actual.z)
  const blocked = wanted > 0 && allowed < wanted * BLOCKED_BELOW

  // First refusal: keep the momentum, but remember it happened.
  if (blocked && !wasBlocked) return { x: velocity.x, z: velocity.z, blocked: true }

  return {
    x: clampToward(velocity.x, actual.x),
    z: clampToward(velocity.z, actual.z),
    blocked,
  }
}

// Pull back to what the solver allowed, but never let a solver nudge (a
// depenetration push, a slide along a slope) accelerate the player.
function clampToward(value, actual) {
  if (Math.abs(actual) >= Math.abs(value)) return value
  return Math.sign(value) === Math.sign(actual) ? actual : 0
}
