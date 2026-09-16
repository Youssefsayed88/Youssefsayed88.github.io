// One-way platforms, stepped by hand. No DOM, no engine.
//
// The showroom needed Rapier for walls, doorways and a camera ray. A page does
// not: every surface here is the top edge of a rectangle, you land on it from
// above and pass through it from below, and the only walls are the two sides of
// the level. That is a few comparisons a frame — and it is what took 774 kB of
// WASM off the first load.
//
// Pure, so platformer-smoke.mjs drives exactly this code rather than a copy.
import {
  stepJump, stepVelocity,
  SPEED, SPRINT_MULTIPLIER, FOOT_HALF_WIDTH, BODY_HALF_WIDTH, PLAYER_HEIGHT,
} from './movement.js'

// How far above its top edge a platform still catches the feet. One pixel covers
// the sub-pixel drift of a re-measured layout without letting anyone stand on air.
export const LANDING_EPSILON = 1

// Below the level by this much and the body is lost — a resize that pulled the
// floor out from under it, most likely. The caller respawns it.
const LOST_BELOW = 400

export function createBody(x, y, on = null) {
  return {
    x, y,
    vx: 0,
    verticalVelocity: 0,
    grounded: on !== null,
    on,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    dropHeld: false,
    // The platform being dropped through, and the height it was at. See below.
    dropThrough: null,
  }
}

const overlaps = (x, p) => x + FOOT_HALF_WIDTH > p.left && x - FOOT_HALF_WIDTH < p.right

// One frame.
//
// `intent`   { move: -1..1, sprint, jump, drop }
// `platforms` [{ id, left, right, top, solid }] in level coordinates
// `bounds`   { left, right, top, bottom }
//
// Returns the next body plus what happened to it: `landed` (a platform id, on the
// frame the feet arrive), `left` (the id they left), `jumped`, `lost`.
export function stepBody(body, intent, platforms, bounds, delta) {
  let { grounded, on, coyote, dropThrough } = body

  // Drop through the platform underfoot. Every block on the page spans some of
  // the width, and the level is only as wide as the screen — without this, a
  // full-width card is a floor you can only leave by finding its edge. The
  // ground is `solid`: there is nothing under it to drop to.
  const dropPressed = intent.drop && !body.dropHeld
  if (dropPressed && grounded && on !== null) {
    const under = platforms.find((p) => p.id === on)
    if (under && !under.solid) {
      dropThrough = { id: under.id, top: under.top }
      grounded = false
      on = null
      coyote = 0            // dropping is not an invitation to coyote-jump back up
    }
  }

  const air = stepJump({ ...body, coyote }, { delta, wantsJump: intent.jump, grounded })

  const desired = (intent.move || 0) * SPEED * (intent.sprint ? SPRINT_MULTIPLIER : 1)
  let vx = stepVelocity(body.vx, desired, delta, grounded)
  let x = body.x + vx * delta

  const minX = bounds.left + BODY_HALF_WIDTH
  const maxX = bounds.right - BODY_HALF_WIDTH
  if (x < minX || x > maxX) {
    x = Math.min(maxX, Math.max(minX, x))
    vx = 0
  }

  let verticalVelocity = air.verticalVelocity
  const prevY = body.y
  let y = prevY + verticalVelocity * delta

  // Once the feet are clear below the dropped platform it cannot catch them
  // again from above, so it stops needing an exception.
  if (dropThrough && prevY > dropThrough.top + LANDING_EPSILON) dropThrough = null

  const wasOn = on
  grounded = false
  on = null

  // Landing is a SWEEP from last frame's feet to this frame's, not a test of
  // where they ended up. A fall at terminal velocity on a phone dropping to 20fps
  // moves 75 px a frame — more than most of these platforms are tall, and a
  // point test would step straight over them. Rising bodies pass through
  // everything: these are one-way platforms.
  if (verticalVelocity >= 0) {
    let best = null
    for (const p of platforms) {
      if (dropThrough && p.id === dropThrough.id) continue
      if (p.top < prevY - LANDING_EPSILON || p.top > y) continue
      if (!overlaps(x, p)) continue
      if (!best || p.top < best.top) best = p
    }
    if (best) {
      y = best.top
      verticalVelocity = 0
      grounded = true
      on = best.id
      dropThrough = null
    }
  }

  // The top of the page is a ceiling, so the head stays on screen.
  if (y - PLAYER_HEIGHT < bounds.top) {
    y = bounds.top + PLAYER_HEIGHT
    verticalVelocity = Math.max(0, verticalVelocity)
  }

  return {
    body: {
      x, y, vx, verticalVelocity, grounded, on,
      coyote: air.coyote,
      jumpBuffer: air.jumpBuffer,
      jumpHeld: air.jumpHeld,
      dropHeld: !!intent.drop,
      dropThrough,
    },
    jumped: air.jumped,
    landed: on !== null && on !== body.on ? on : null,
    left: body.on !== null && on !== body.on ? body.on : null,
    // `wasOn` is where the frame started after any drop, kept for the landing
    // speed the audio wants.
    impact: on !== null && wasOn === null ? body.verticalVelocity : 0,
    lost: y > bounds.bottom + LOST_BELOW,
  }
}
