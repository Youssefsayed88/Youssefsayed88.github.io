// Can a visitor actually get everywhere? Asked of the real, laid-out page.
//
// The showroom answered this by walking a Rapier character to every kiosk in
// Node. Here the level is whatever the stylesheet made of the page at the width
// it is being read at, which Node cannot compute — so verify-browser.mjs measures
// the platforms in Chrome at a phone, a tablet and a desktop width, and hands
// them to this. The judgement is pure, and platformer-smoke.mjs checks it against
// the simulated body, so the audit can never promise a jump the body cannot make.
import { JUMP_HEIGHT, reachAt } from './movement.js'

// Share of the theoretical arc a layout may count on. The closed form assumes a
// perfect full-speed takeoff from the very edge; a person on a trackpad is not
// that, and a jump that works only when played perfectly is a wall.
export const REACH_MARGIN = 0.85

// The tallest step the stylesheet may put between two platforms that are meant
// to be climbable. The shelf stagger is sized under this.
export const CLIMB_HEIGHT = Math.floor(JUMP_HEIGHT * REACH_MARGIN)

const gapBetween = (a, b) => Math.max(0, b.left - a.right, a.left - b.right)

// Whether the body standing on `from` can end up standing on `to`.
//
// Downward is generous on purpose: anything below and overlapping is reachable,
// because a non-solid platform can be dropped through and any other can be
// walked off. Platforms in between do not block either — they are one-way, and a
// landing on one is a place to drop through again.
export function canReach(from, to) {
  if (from.id === to.id) return false
  const rise = from.top - to.top          // positive: `to` is higher
  const gap = gapBetween(from, to)

  if (rise < 0 && gap === 0) return true
  if (rise > CLIMB_HEIGHT) return false
  return gap <= reachAt(rise) * REACH_MARGIN
}

function search(platforms, startId, edge) {
  const start = platforms.find((p) => p.id === startId)
  if (!start) return new Set()
  const seen = new Set([start.id])
  const queue = [start]
  while (queue.length) {
    const here = queue.shift()
    for (const next of platforms) {
      if (seen.has(next.id) || !edge(here, next)) continue
      seen.add(next.id)
      queue.push(next)
    }
  }
  return seen
}

// `unreachable`: platforms nobody starting at `spawn` can stand on.
// `stranded`:    platforms from which `exit` (the portal's ground) cannot be
//                reached — a place you could get to and not leave.
// `cutOff`:      platforms from which `spawn` cannot be climbed back up to. The
//                portal is a shortcut, not the only way up: someone who drops
//                past a project must be able to jump back and look at it again.
export function audit(platforms, { spawn, exit }) {
  const forward = search(platforms, spawn, canReach)
  const backward = search(platforms, exit, (a, b) => canReach(b, a))
  const upward = search(platforms, spawn, (a, b) => canReach(b, a))
  const missing = (set) => platforms.filter((p) => !set.has(p.id)).map((p) => p.id)
  return {
    unreachable: missing(forward),
    stranded: missing(backward),
    cutOff: missing(upward),
  }
}
