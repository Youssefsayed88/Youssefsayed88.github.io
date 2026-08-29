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

// How close the player must get, and how far the hotspot sits into the room.
// Here rather than in ProjectKiosk.js so the headless test can use them.
export const TRIGGER_RADIUS = 2.8
export const TRIGGER_OFFSET = 1.4

// World-space point the player has to reach for a given kiosk placement.
export function triggerPointFor(placement) {
  return {
    x: placement.position.x + Math.sin(placement.rotationY) * TRIGGER_OFFSET,
    y: 0.9,
    z: placement.position.z + Math.cos(placement.rotationY) * TRIGGER_OFFSET,
  }
}

// Distributes N kiosks evenly along a U around the room: up the left wall,
// across the back, down the right. The south wall is skipped — that is the
// doorway side, and a kiosk there would face the player's back on entry.
export function kioskPlacements(wing, count) {
  if (count === 0) return []

  const cx = wing.x
  const inset = 1.0
  const endPad = 2.0
  const left = cx - ROOM.width / 2 + inset
  const right = cx + ROOM.width / 2 - inset
  const back = ROOM.z - ROOM.depth / 2 + inset
  const front = ROOM.z + ROOM.depth / 2 - endPad

  const segments = [
    // Up the left wall, facing +x.
    { length: front - (back + endPad), rotationY: Math.PI / 2,
      at: (t) => ({ x: left, z: front - t }) },
    // Across the back wall, facing +z.
    { length: (right - endPad) - (left + endPad), rotationY: 0,
      at: (t) => ({ x: left + endPad + t, z: back }) },
    // Down the right wall, facing -x.
    { length: front - (back + endPad), rotationY: -Math.PI / 2,
      at: (t) => ({ x: right, z: back + endPad + t }) },
  ]

  const total = segments.reduce((sum, s) => sum + s.length, 0)
  const placements = []

  for (let i = 0; i < count; i++) {
    let d = ((i + 0.5) / count) * total
    for (const seg of segments) {
      if (d <= seg.length) {
        const { x, z } = seg.at(d)
        placements.push({ position: { x, y: 0, z }, rotationY: seg.rotationY })
        break
      }
      d -= seg.length
    }
  }

  return placements
}

// Decorative floor strips pointing into each room — no collision.
export function wayfindingStrips() {
  const northZ = CORRIDOR.z - CORRIDOR.width / 2
  return WINGS.map((wing) => ({
    position: { x: wing.x, y: 0.03, z: northZ - 3.5 },
    size: { x: 1.2, y: 0.06, z: 6 },
  }))
}
