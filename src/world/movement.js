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
export function resolveVelocity(velocity, moved, delta) {
  if (delta <= 0) return velocity
  return {
    x: clampToward(velocity.x, moved.x / delta),
    z: clampToward(velocity.z, moved.z / delta),
  }
}

// Pull back to what the solver allowed, but never let a solver nudge (a
// depenetration push, a slide along a slope) accelerate the player.
function clampToward(value, actual) {
  if (Math.abs(actual) >= Math.abs(value)) return value
  return Math.sign(value) === Math.sign(actual) ? actual : 0
}
