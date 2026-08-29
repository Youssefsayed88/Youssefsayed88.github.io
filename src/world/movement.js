// Camera-relative movement, kept free of THREE so it can be tested headlessly.
//
// The camera orbits to `target + cameraOffset(yaw) * distance`, so the player's
// forward direction — away from the camera, into the screen — is the NEGATION
// of that offset. Getting this backwards is what made W walk backwards.

// Walk speed in metres/second. Lives here rather than in Player.js so
// physics-smoke.mjs exercises the real value instead of a copy of it.
// The corridor is ~104 long, so this sets how long crossing it feels.
export const SPEED = 8

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
