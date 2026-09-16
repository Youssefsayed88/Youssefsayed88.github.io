// Where the speech bubble goes. Pure, so the smoke test can check it.
//
// The robot is the one talking, so the bubble sits over its head with the tail
// pointing down at it, like a chat message from the robot. It is centred on the
// robot and slides along to stay inside the level near a wall, while the tail
// keeps pointing at the robot.

// Between the top of the robot's head and the bottom edge of the bubble; the
// tail spans most of it.
export const BUBBLE_GAP = 18

// Nearest the bubble may come to the level's edge.
const EDGE = 8

// Nearest the tail may come to a corner of the bubble, so it never leaves the
// straight part of the outline.
const TAIL_INSET = 24

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// `speaker` { x, top }: the middle of the robot and the top of its head, in
// level coordinates. `width` is the bubble's; `bounds` { left, right } the
// level's.
// Returns { left, bottom, tail }: the bubble's left edge, where its bottom edge
// goes, and the tail's offset from the bubble's left edge.
export function placeBubble(speaker, width, bounds) {
  const left = clamp(speaker.x - width / 2, bounds.left + EDGE, bounds.right - EDGE - width)
  return {
    left,
    bottom: speaker.top - BUBBLE_GAP,
    tail: clamp(speaker.x - left, TAIL_INSET, width - TAIL_INSET),
  }
}
