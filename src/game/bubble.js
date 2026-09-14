// Where the speech bubble goes. Pure, so the smoke test can check it.
//
// The bubble is the project talking, so its tail has to point at the thumbnail
// and nothing else. Above the thumbnail is where the robot stands, and a bubble
// there reads as the robot speaking — so the bubble goes BESIDE the thumbnail,
// on whichever side has room, tail pointing sideways at it. Where neither side
// is wide enough (a phone's two narrow columns), it hangs below, tail pointing
// up.

// Between the anchor's edge and the bubble's; the tail spans it.
export const BUBBLE_GAP = 16

// Nearest the bubble may come to the level's edge.
const EDGE = 8

// Nearest the tail may come to a corner of the bubble, so it never leaves the
// rounded part of the outline.
const TAIL_INSET = 18

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// `anchor` { left, right, top, bottom } and `bounds` { left, right, top } in
// level coordinates; `size` { width, height } of the bubble.
// Returns { side: 'right' | 'left' | 'below', left, top, tail }, where `tail`
// is the tail's offset along the edge it sits on.
export function placeBubble(anchor, size, bounds) {
  const roomRight = bounds.right - EDGE - (anchor.right + BUBBLE_GAP)
  const roomLeft = anchor.left - BUBBLE_GAP - (bounds.left + EDGE)

  if (Math.max(roomRight, roomLeft) >= size.width) {
    const side = roomRight >= roomLeft ? 'right' : 'left'
    const left = side === 'right' ? anchor.right + BUBBLE_GAP : anchor.left - BUBBLE_GAP - size.width
    const middle = (anchor.top + anchor.bottom) / 2
    const top = Math.max(bounds.top + EDGE, middle - size.height / 2)
    return { side, left, top, tail: clamp(middle - top, TAIL_INSET, size.height - TAIL_INSET) }
  }

  const centre = (anchor.left + anchor.right) / 2
  const left = clamp(centre - size.width / 2, bounds.left + EDGE, bounds.right - EDGE - size.width)
  return {
    side: 'below',
    left,
    top: anchor.bottom + BUBBLE_GAP,
    tail: clamp(centre - left, TAIL_INSET, size.width - TAIL_INSET),
  }
}
