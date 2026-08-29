// Pure geometry description of the showroom — no THREE, no DOM, no physics.
// Level.js renders it; physics-smoke.mjs feeds the same boxes to Rapier, so the
// test is checking the real level rather than a copy of its arithmetic.

import { WINGS as WING_DATA } from '../data/projects.js'

export const WING_SPACING = 23
export const ROOM = { width: 20, depth: 18, height: 6, z: -6 }
export const WALL_T = 0.6
export const DOOR_W = 4.5

export const CORRIDOR = {
  length: WING_DATA.length * WING_SPACING + 12,
  width: 9,
  // North edge aligned to the rooms' south wall for one continuous plane.
  z: ROOM.z + ROOM.depth / 2 + 9 / 2,
}

export const WINGS = WING_DATA.map((wing, i) => ({
  ...wing,
  x: (i - (WING_DATA.length - 1) / 2) * WING_SPACING,
}))

export const SPAWN = { x: 0, y: 1.5, z: CORRIDOR.z }

const box = (kind, x, y, z, sx, sy, sz) => ({
  kind,
  position: { x, y, z },
  size: { x: sx, y: sy, z: sz },
})

export function buildLayout() {
  const boxes = []
  const northZ = CORRIDOR.z - CORRIDOR.width / 2
  const southZ = CORRIDOR.z + CORRIDOR.width / 2

  // --- Corridor ---
  boxes.push(box('floor', 0, -0.5, CORRIDOR.z, CORRIDOR.length, 1, CORRIDOR.width))
  boxes.push(box('wall', 0, 3, southZ, CORRIDOR.length, 6, WALL_T))
  boxes.push(box('wall', -CORRIDOR.length / 2, 3, CORRIDOR.z, WALL_T, 6, CORRIDOR.width))
  boxes.push(box('wall', CORRIDOR.length / 2, 3, CORRIDOR.z, WALL_T, 6, CORRIDOR.width))

  // --- Wings ---
  const seg = (ROOM.width - DOOR_W) / 2
  const offset = DOOR_W / 2 + seg / 2

  for (const wing of WINGS) {
    const cx = wing.x
    const roomNorthZ = ROOM.z - ROOM.depth / 2

    boxes.push(box('floor', cx, -0.5, ROOM.z, ROOM.width, 1, ROOM.depth))
    boxes.push(box('wall', cx, ROOM.height / 2, roomNorthZ, ROOM.width, ROOM.height, WALL_T))
    boxes.push(box('wall', cx - ROOM.width / 2, ROOM.height / 2, ROOM.z, WALL_T, ROOM.height, ROOM.depth))
    boxes.push(box('wall', cx + ROOM.width / 2, ROOM.height / 2, ROOM.z, WALL_T, ROOM.height, ROOM.depth))

    // South wall, split to leave a doorway onto the corridor.
    boxes.push(box('wall', cx - offset, ROOM.height / 2, northZ, seg, ROOM.height, WALL_T))
    boxes.push(box('wall', cx + offset, ROOM.height / 2, northZ, seg, ROOM.height, WALL_T))
    boxes.push(box('wall', cx, ROOM.height - 0.75, northZ, DOOR_W, 1.5, WALL_T))
  }

  // --- Close the corridor's north side wherever no room abuts it ---
  // Without this you can walk straight off the floor between the wings.
  const half = CORRIDOR.length / 2
  const edges = [-half]
  for (const wing of WINGS) {
    edges.push(wing.x - ROOM.width / 2, wing.x + ROOM.width / 2)
  }
  edges.push(half)

  for (let i = 0; i < edges.length; i += 2) {
    const from = edges[i]
    const to = edges[i + 1]
    const width = to - from
    if (width <= 0.01) continue
    boxes.push(box('wall', from + width / 2, ROOM.height / 2, northZ, width, ROOM.height, WALL_T))
  }

  return boxes
}

// Decorative floor strips pointing into each room — no collision.
export function wayfindingStrips() {
  const northZ = CORRIDOR.z - CORRIDOR.width / 2
  return WINGS.map((wing) => ({
    position: { x: wing.x, y: 0.03, z: northZ - 3.5 },
    size: { x: 1.2, y: 0.06, z: 6 },
  }))
}
