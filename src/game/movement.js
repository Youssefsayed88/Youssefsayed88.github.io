// The movement model, in CSS pixels, kept free of the DOM so the smoke test can
// drive it headlessly. Y points DOWN, as it does on the page: a negative vertical
// velocity is rising.
//
// This is the showroom's model carried over to a side-on platformer. The walk's
// frame-rate-independent easing, the asymmetric gravity, the cut on release,
// coyote time, the jump buffer and the leapfrog correction all survive intact —
// they were the parts of the old game that had been measured and fixed, and none
// of them cared whether the floor was a Rapier collider or the top edge of a
// <div>. What changed is the unit: a page is measured in pixels, and the jump is
// sized to the gaps the stylesheet leaves between blocks.

// The body. PLAYER_HEIGHT is also the drawn height of the robot and of the
// placeholder that stands in for it, so the stylesheet and Robot.js read it from
// here rather than restating it.
export const PLAYER_HEIGHT = 64

// Half-width of the feet, for standing on a platform. Narrower than the body on
// purpose: a character holding onto a ledge by the width of its shoulders reads
// as floating.
export const FOOT_HALF_WIDTH = 12

// Half-width of the body, for the walls at the edges of the level.
export const BODY_HALF_WIDTH = 14

// Run speed in px/s. A level is ~1000 px across on a desktop, so this crosses it
// in about three seconds — long enough to steer, short enough not to wait.
export const SPEED = 340
export const SPRINT_MULTIPLIER = 1.55

// How fast horizontal velocity closes on the target, per second. Braking beats
// acceleration for the reason it did in the showroom: you stop ON a thumbnail far
// more often than you launch off one, and an overshoot walks you off the edge.
export const ACCELERATION = 20
export const BRAKING = 28

// Share of those rates available in the air. Full control mid-jump makes the arc
// meaningless; none makes a missed ledge unrecoverable. Most platformers sit
// somewhere around here.
export const AIR_CONTROL = 0.6

// ---------------------------------------------------------------------------
// The jump.
//
// Sized to the page, not to a person. Every platform has to be climbable back up
// to, not only reachable on the way down, and the tallest step the stylesheet
// cannot avoid is a thumbnail's own height plus the gap under it — ~140 px plus
// a heading's clearance at the widest a shelf column gets. 220 leaves that step
// inside CLIMB_HEIGHT (see reach.js) with the audit's margin intact. Rise time
// sets how snappy it feels; the gravities fall out of the two.
export const JUMP_HEIGHT = 220
export const RISE_TIME = 0.36

export const JUMP_SPEED = (2 * JUMP_HEIGHT) / RISE_TIME
export const RISE_GRAVITY = JUMP_SPEED / RISE_TIME

// Falling is heavier than rising, so the arc spends its time near the ledge where
// it can be read. 1.6x is the showroom's ratio (42 against 26).
export const FALL_GRAVITY = RISE_GRAVITY * 1.6

// Terminal velocity. Without one, a drop from the top of the page to the portal
// arrives at a speed the camera cannot follow and the eye cannot track.
export const MAX_FALL_SPEED = 1500

// What a release keeps of the rise still to come: a tap is a hop, a hold a jump.
export const JUMP_CUT = 0.5

// Forgiveness windows, unchanged from the showroom — they were sized against
// reaction time and airtime, and neither changed.
export const COYOTE_TIME = 0.12
export const JUMP_BUFFER = 0.2

// Standing still on a platform. Zero, and named for the reason it was in the
// showroom: there is nothing here for a stick-down force to fight, and a landing
// test that finds the platform under the feet does not need one.
export const GROUND_STICK = 0

export const gravityFor = (verticalVelocity) =>
  (verticalVelocity < 0 ? RISE_GRAVITY : FALL_GRAVITY)

// One frame of the vertical model. `state` carries verticalVelocity, coyote,
// jumpBuffer and jumpHeld; returns the next four plus `jumped`, true only on the
// frame a jump fires.
export function stepJump(state, { delta, wantsJump, grounded }) {
  // Edge-triggered, so resting on the key does not hop on every landing.
  const pressed = wantsJump && !state.jumpHeld
  const released = !wantsJump && state.jumpHeld

  let coyote = grounded ? COYOTE_TIME : Math.max(0, state.coyote - delta)
  let jumpBuffer = pressed ? JUMP_BUFFER : Math.max(0, state.jumpBuffer - delta)
  let verticalVelocity = state.verticalVelocity
  let jumped = false

  if (jumpBuffer > 0 && coyote > 0) {
    // Half a frame of gravity taken off the launch — the leapfrog correction
    // that made the showroom's jump apex at the same height at 30fps and 120.
    verticalVelocity = -JUMP_SPEED + gravityFor(-JUMP_SPEED) * delta * 0.5
    jumpBuffer = 0
    coyote = 0
    jumped = true
  } else if (grounded) {
    verticalVelocity = GROUND_STICK
  } else {
    // Cut once, on the release edge, before gravity — so the height cannot
    // depend on how many frames the machine drew.
    if (released && verticalVelocity < 0) verticalVelocity *= JUMP_CUT
    verticalVelocity = Math.min(MAX_FALL_SPEED, verticalVelocity + gravityFor(verticalVelocity) * delta)
  }

  return { verticalVelocity, coyote, jumpBuffer, jumpHeld: wantsJump, jumped }
}

// Apex of a jump released at `heldFraction` of its rise, in px.
export function jumpApex(heldFraction = 1) {
  const full = (JUMP_SPEED * JUMP_SPEED) / (2 * RISE_GRAVITY)
  if (heldFraction >= 1) return full

  const cutSpeed = JUMP_SPEED * (1 - heldFraction)
  const risen = full - (cutSpeed * cutSpeed) / (2 * RISE_GRAVITY)
  const after = cutSpeed * JUMP_CUT
  return risen + (after * after) / (2 * RISE_GRAVITY)
}

// Advance horizontal velocity one frame toward `desired`. The same 1 - e^-kt
// approach as before, so a 144Hz monitor and a 30Hz phone reach top speed in the
// same wall-clock time.
export function stepVelocity(velocity, desired, delta, grounded = true) {
  const rate = (desired === 0 ? BRAKING : ACCELERATION) * (grounded ? 1 : AIR_CONTROL)
  return velocity + (desired - velocity) * (1 - Math.exp(-rate * delta))
}

// ---------------------------------------------------------------------------
// Closed-form arc, for reach.js. The layout audit asks "can a jump from this
// block land on that one?" of every pair of platforms on the page, which is far
// too many questions to answer by simulating each.

// Seconds to fall `distance` px from rest, respecting terminal velocity.
export function fallTime(distance) {
  if (distance <= 0) return 0
  const capTime = MAX_FALL_SPEED / FALL_GRAVITY
  const capDistance = 0.5 * FALL_GRAVITY * capTime * capTime
  if (distance <= capDistance) return Math.sqrt((2 * distance) / FALL_GRAVITY)
  return capTime + (distance - capDistance) / MAX_FALL_SPEED
}

// Seconds from takeoff until a full jump comes back down to `rise` px above the
// takeoff height (negative: below it). Null if the arc never gets that high.
export function airtimeTo(rise) {
  if (rise >= JUMP_HEIGHT) return null
  return RISE_TIME + fallTime(JUMP_HEIGHT - rise)
}

// Horizontal px a full jump covers before dropping back to `rise`, at `speed`.
export function reachAt(rise, speed = SPEED) {
  const t = airtimeTo(rise)
  return t === null ? -Infinity : t * speed
}
