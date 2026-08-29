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

export const CEILING_H = ROOM.height

const box = (kind, x, y, z, sx, sy, sz, collide = true) => ({
  kind,
  collide,
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

// Ceilings close the rooms in so they read as interior architecture rather than
// open boxes. No colliders — the player cannot jump 6m, so they would be dead weight.
export function ceilings() {
  const boxes = [box('ceiling', 0, CEILING_H, CORRIDOR.z, CORRIDOR.length, 0.5, CORRIDOR.width, false)]
  for (const wing of WINGS) {
    boxes.push(box('ceiling', wing.x, CEILING_H, ROOM.z, ROOM.width, 0.5, ROOM.depth, false))
  }
  return boxes
}

// Non-colliding dressing. `accent: true` means the piece takes its wing's hue,
// so colour carries the wayfinding: floor strip, doorway frame, ceiling light.
export function decorations() {
  const northZ = CORRIDOR.z - CORRIDOR.width / 2
  const items = []

  // Corridor ceiling light running the full length.
  items.push({
    kind: 'light', wingId: null,
    position: { x: 0, y: CEILING_H - 0.32, z: CORRIDOR.z },
    size: { x: CORRIDOR.length - 2, y: 0.12, z: 0.5 },
  })

  // Baseboard along the corridor's south wall.
  items.push({
    kind: 'trim', wingId: null,
    position: { x: 0, y: 0.16, z: CORRIDOR.z + CORRIDOR.width / 2 - 0.35 },
    size: { x: CORRIDOR.length, y: 0.32, z: 0.12 },
  })

  for (const wing of WINGS) {
    // Floor strip leading from the corridor into the room.
    items.push({
      kind: 'accent', wingId: wing.id,
      position: { x: wing.x, y: 0.04, z: northZ - 3.0 },
      size: { x: 1.1, y: 0.08, z: 6.5 },
    })
    // Doorway uprights, in the wing colour.
    for (const side of [-1, 1]) {
      items.push({
        kind: 'accent', wingId: wing.id,
        position: { x: wing.x + side * (DOOR_W / 2 + 0.12), y: (ROOM.height - 1.5) / 2, z: northZ },
        size: { x: 0.16, y: ROOM.height - 1.5, z: 0.72 },
      })
    }
    // Ceiling light ring over the room.
    for (const side of [-1, 1]) {
      items.push({
        kind: 'light', wingId: null,
        position: { x: wing.x + side * 5.5, y: CEILING_H - 0.32, z: ROOM.z },
        size: { x: 0.5, y: 0.12, z: ROOM.depth - 4 },
      })
    }
    // Low dais in the middle of the room to break up the floor plane.
    items.push({
      kind: 'trim', wingId: null,
      position: { x: wing.x, y: 0.06, z: ROOM.z },
      size: { x: 7, y: 0.12, z: 7 },
    })
  }

  return items
}

// Signs above each doorway, plus the owner's name at the corridor's west end.
export function signs(ownerName, ownerTitle) {
  const northZ = CORRIDOR.z - CORRIDOR.width / 2
  const placed = WINGS.map((wing) => ({
    id: `wing:${wing.id}`,
    lines: [wing.label],
    wingId: wing.id,
    width: DOOR_W,
    height: 0.9,
    position: { x: wing.x, y: ROOM.height - 0.75, z: northZ + 0.35 },
    rotationY: Math.PI,   // faces back down the corridor, toward the player
  }))

  placed.push({
    id: 'owner',
    lines: [ownerName, ownerTitle],
    wingId: null,
    width: 7,
    height: 2.2,
    position: { x: -CORRIDOR.length / 2 + 0.35, y: 2.6, z: CORRIDOR.z },
    rotationY: Math.PI / 2,
  })

  return placed
}
