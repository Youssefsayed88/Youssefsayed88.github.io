// Headless checks for the platformer: the movement model, the one-way platform
// physics, the reachability audit, and the level markup.
//
//   node platformer-smoke.mjs
//
// Everything here is pure, so this drives the shipped code with no browser. What
// only a browser can answer — the real laid-out page, reachable at real widths —
// is scripts/verify-browser.mjs.
import { createBody, stepBody } from './src/game/physics.js'
import {
  jumpApex, reachAt, SPEED, ACCELERATION, BRAKING, JUMP_BUFFER, COYOTE_TIME,
  BODY_HALF_WIDTH, MAX_FALL_SPEED, RISE_GRAVITY, JUMP_SPEED,
} from './src/game/movement.js'
import { audit, canReach, CLIMB_HEIGHT, REACH_MARGIN } from './src/game/reach.js'
import { levelMarkup, sentences, railMarkup, SECTIONS } from './src/level/markup.js'
import { railProgress } from './src/ui/Rail.js'
import { placeBubble, BUBBLE_GAP } from './src/game/bubble.js'
import { projects } from './src/data/projects.js'
import { skills, experience, summary } from './src/data/profile.js'
import { testimonials } from './src/data/testimonials.js'

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

const GROUND = { id: 'ground', left: 0, right: 3000, top: 2000, solid: true }
const BOUNDS = { left: 0, right: 3000, top: -6000, bottom: 2200 }

const onGround = (x) => createBody(x, GROUND.top, GROUND.id)

// Runs `seconds` of simulation at `fps`. `intent(t, body)` returns the frame's
// input. Returns the final body and what happened along the way.
function run(body, platforms, { fps = 60, seconds = 1, intent = () => ({}) } = {}) {
  const delta = 1 / fps
  const frames = Math.round(seconds * fps)
  let minY = body.y
  let jumps = 0
  let firstJumpAt = null
  const landings = []
  const leftAt = []
  for (let i = 0; i < frames; i++) {
    const t = i * delta
    const r = stepBody(body, { move: 0, ...intent(t, body) }, platforms, BOUNDS, delta)
    body = r.body
    minY = Math.min(minY, body.y)
    if (r.jumped) { jumps++; firstJumpAt ??= t }
    if (r.landed) landings.push({ id: r.landed, t })
    if (r.left) leftAt.push({ id: r.left, t })
  }
  return { body, minY, jumps, firstJumpAt, landings, leftAt }
}

// 1. The jump apexes at the tuned height at any frame rate.
{
  const rises = [30, 60, 120].map((fps) => {
    const r = run(onGround(1000), [GROUND], { fps, seconds: 1, intent: (t) => ({ jump: t < 0.6 }) })
    return { fps, rise: GROUND.top - r.minY, jumps: r.jumps }
  })
  const want = jumpApex(1)
  const worst = Math.max(...rises.map((r) => Math.abs(r.rise - want)))
  check('a held jump apexes at the tuned height at 30, 60 and 120 fps',
    worst < 1.5 && rises.every((r) => r.jumps === 1),
    rises.map((r) => `${r.fps}fps ${r.rise.toFixed(1)}px`).join(', ') + ` (want ${want.toFixed(1)})`)
}

// 2. A tap is a hop.
//
// The shortest tap still rises for the one frame before the release is seen, so
// the model's answer for it is jumpApex at that frame's share of the launch
// speed — one frame of rise gravity out of JUMP_SPEED — not jumpApex(0).
{
  const r = run(onGround(1000), [GROUND], { seconds: 1, intent: (t) => ({ jump: t < 1 / 60 }) })
  const rise = GROUND.top - r.minY
  const want = jumpApex(RISE_GRAVITY / 60 / JUMP_SPEED)
  check('tapping jump hops about a third of the height a hold reaches',
    Math.abs(rise - want) < 4 && rise < jumpApex(1) * 0.35,
    `tap rose ${rise.toFixed(1)}px (model ${want.toFixed(1)}) against ${jumpApex(1).toFixed(1)} held`)
}

// 3. The run ramps and brakes on the tuned curve.
{
  const up = run(onGround(200), [GROUND], { seconds: 3 / ACCELERATION + 0.02, intent: () => ({ move: 1 }) })
  let braked = up.body
  const down = run(braked, [GROUND], { seconds: 3 / BRAKING + 0.02 })
  check('the run reaches 95% of speed in ~3/ACCELERATION and stops in ~3/BRAKING',
    up.body.vx > SPEED * 0.94 && Math.abs(down.body.vx) < SPEED * 0.05,
    `${up.body.vx.toFixed(0)} px/s after ${(3 / ACCELERATION).toFixed(2)}s, ` +
    `${down.body.vx.toFixed(1)} px/s after braking ${(3 / BRAKING).toFixed(2)}s`)
}

// 4. One-way: jumping up through a platform lands on top of it.
{
  const ledge = { id: 'ledge', left: 900, right: 1100, top: GROUND.top - 150 }
  const r = run(onGround(1000), [GROUND, ledge], { seconds: 1.5, intent: (t) => ({ jump: t < 0.6 }) })
  check('a platform above is jumped up through and landed on',
    r.body.on === 'ledge' && r.body.y === ledge.top,
    `ended on "${r.body.on}" at y=${r.body.y} (ledge top ${ledge.top})`)
}

// 5. Down drops through a platform, but never through the ground.
{
  const ledge = { id: 'ledge', left: 900, right: 1100, top: GROUND.top - 150 }
  const through = run(createBody(1000, ledge.top, 'ledge'), [GROUND, ledge],
    { seconds: 1, intent: (t) => ({ drop: t < 1 / 60 }) })
  const floor = run(onGround(1000), [GROUND], { seconds: 0.5, intent: (t) => ({ drop: t < 0.1 }) })
  check('down drops through a platform and the ground stays solid',
    through.body.on === 'ground' && floor.body.on === 'ground' && floor.body.y === GROUND.top,
    `from the ledge: landed on "${through.body.on}"; on the ground: still on "${floor.body.on}" at y=${floor.body.y}`)
}

// 6. A terminal-velocity fall at 20fps cannot step over a thin platform.
{
  const thin = { id: 'thin', left: 900, right: 1100, top: 1000 }
  const r = run(createBody(1000, -4000), [GROUND, thin], { fps: 20, seconds: 5 })
  check('a terminal-velocity fall at 20fps lands on a thin platform instead of tunnelling',
    r.body.on === 'thin' && r.body.y === thin.top,
    `fell 5000px at up to ${MAX_FALL_SPEED}px/s (${MAX_FALL_SPEED / 20}px a frame), landed on "${r.body.on}"`)
}

// 7. Coyote time: a jump just after running off an edge still fires.
{
  const shelf = { id: 'shelf', left: 0, right: 500, top: 1500 }
  const offEdge = (lateBy) => {
    let leftAt = null
    const r = run(createBody(300, shelf.top, 'shelf'), [GROUND, shelf], {
      seconds: 1,
      intent: (t, body) => {
        if (leftAt === null && !body.grounded && t > 0) leftAt = t
        return { move: 1, jump: leftAt !== null && t >= leftAt + lateBy && t < leftAt + lateBy + 0.05 }
      },
    })
    return r.jumps
  }
  const inside = offEdge(COYOTE_TIME * 0.5)
  const outside = offEdge(COYOTE_TIME + 0.1)
  check('a jump pressed just after leaving an edge fires; a late one does not',
    inside === 1 && outside === 0,
    `${(COYOTE_TIME * 0.5 * 1000).toFixed(0)}ms late: ${inside} jump, ` +
    `${((COYOTE_TIME + 0.1) * 1000).toFixed(0)}ms late: ${outside}`)
}

// 8. Jump buffer: a press shortly before landing fires on touchdown.
{
  const fall = (pressAt) => run(createBody(1000, GROUND.top - 200), [GROUND], {
    seconds: 1, intent: (t) => ({ jump: t >= pressAt && t < pressAt + 0.02 }),
  })
  // 200px takes ~0.276s to fall at FALL_GRAVITY.
  const early = fall(0)
  const inTime = fall(0.14)
  check('a jump pressed within the buffer before landing fires; one pressed too early does not',
    inTime.jumps === 1 && early.jumps === 0,
    `pressed ~${((0.276 - 0.14) * 1000).toFixed(0)}ms before touchdown: ${inTime.jumps} jump; ` +
    `~276ms before (buffer ${JUMP_BUFFER * 1000}ms): ${early.jumps}`)
}

// 9. The sides of the level are walls.
{
  const r = run(onGround(40), [GROUND], { seconds: 1, intent: () => ({ move: -1 }) })
  check('running into the side of the level stops at the wall',
    r.body.x === BOUNDS.left + BODY_HALF_WIDTH && r.body.vx === 0,
    `x=${r.body.x}, vx=${r.body.vx}`)
}

// 10. The reach model never promises a jump the body cannot make.
//
// For each rise, the audit's widest allowed gap is laid out for real and played
// with an ordinary input: run at the edge at walking speed, jump at the lip, hold
// it, steer onto the far platform. If reach.js is optimistic anywhere, the
// layout audit in the browser is passing pages nobody can play.
{
  const failures = []
  const tried = []
  for (const rise of [-400, -160, -60, 0, 60, 120, CLIMB_HEIGHT]) {
    // High enough that the lowest target still sits well above the ground: a
    // target level with the ground ties with it, and the ground wins the tie.
    const from = { id: 'from', left: 100, right: 700, top: 1200 }
    const gap = Math.floor(reachAt(rise) * REACH_MARGIN)
    const to = { id: 'to', left: from.right + gap, right: from.right + gap + 160, top: from.top - rise }
    if (!canReach(from, to)) { failures.push(`rise ${rise}: audit refused its own maximum gap`); continue }

    let tookOff = false
    const r = run(createBody(from.left + 20, from.top, 'from'), [GROUND, from, to], {
      seconds: 3,
      intent: (t, body) => {
        if (body.on === 'to') return {}
        if (body.x >= from.right - 2) tookOff = true
        return { move: body.x < to.left + 40 ? 1 : 0, jump: tookOff }
      },
    })
    tried.push(`${rise}px/${gap}px`)
    if (r.body.on !== 'to') failures.push(`rise ${rise}px, gap ${gap}px: ended on "${r.body.on}"`)
  }
  check('every jump the reach audit allows is one the body actually makes',
    failures.length === 0,
    failures.length ? failures.join('; ') : `rise/gap ${tried.join(', ')}`)
}

// 11. And the audit catches a platform nobody can get to, and one nobody can
//     climb back up from.
{
  const level = [
    { id: 'spawn', left: 0, right: 300, top: 100 },
    { id: 'below', left: 0, right: 300, top: 100 + CLIMB_HEIGHT - 20 },
    { id: 'island', left: 1500, right: 1700, top: 300 },
    // Far below everything: fine to fall to, impossible to climb out of.
    { ...GROUND, top: 1000 },
  ]
  const { unreachable, stranded, cutOff } = audit(level, { spawn: 'spawn', exit: 'ground' })
  check('the audit flags an unreachable platform, and a pit that cannot be climbed out of',
    unreachable.join() === 'island' && stranded.length === 0
      && cutOff.includes('ground') && cutOff.includes('island') && !cutOff.includes('below'),
    `unreachable: [${unreachable}], stranded: [${stranded}], cut off: [${cutOff}]`)
}

// 12. The markup makes every project and every skill tag a platform — and
//     keeps the tall things short: one platform per summary sentence and per
//     job bullet, because a paragraph-sized platform cannot be climbed over.
{
  const html = levelMarkup()
  const ids = [...html.matchAll(/data-platform="([^"]+)"/g)].map((m) => m[1])
  const unique = new Set(ids)
  const projectIds = ids.filter((id) => id.startsWith('project-'))
  const tagCount = skills.reduce((n, g) => n + g.items.length, 0)
  const tagIds = ids.filter((id) => /^skill-\d+-\d+-/.test(id))
  const bulletCount = experience.reduce((n, job) => n + job.points.length, 0)
  const bulletIds = ids.filter((id) => /^job-\d+-\d+$/.test(id))
  const sentenceIds = ids.filter((id) => id.startsWith('summary-'))
  const missing = projects.filter((p) => !projectIds.includes(`project-${p.id}`)).map((p) => p.id)
  const ground = /data-platform="ground" data-solid/.test(html)
  const spawn = /data-platform="hero" data-spawn/.test(html)
  const portal = /id="portal"/.test(html)
  const bubble = /id="bubble"/.test(html)
  // Every testimonial is its sentences and a name line, all platforms.
  const quoteBys = ids.filter((id) => /^quote-\d+-by$/.test(id)).length
  check('the level markup has every project, tag, sentence and bullet as a platform, plus spawn, ground, portal and bubble',
    missing.length === 0 && projectIds.length === projects.length && tagIds.length === tagCount
      && bulletIds.length === bulletCount && sentenceIds.length === sentences(summary).length
      && sentenceIds.length > 1 && unique.size === ids.length && ground && spawn && portal && bubble
      && quoteBys === testimonials.length,
    `${ids.length} platforms (${unique.size} unique): ${projectIds.length}/${projects.length} projects, ` +
    `${tagIds.length}/${tagCount} skill tags, ${bulletIds.length}/${bulletCount} job bullets, ` +
    `${sentenceIds.length} summary sentences, ${quoteBys}/${testimonials.length} testimonials` +
    (missing.length ? `, missing: ${missing.join(', ')}` : '') +
    `; spawn ${spawn}, solid ground ${ground}, portal ${portal}, bubble ${bubble}`)
}

// 13. The speech bubble sits over the robot's head with its tail on the robot,
//     and slides along to stay inside the level beside a wall.
{
  const middle = placeBubble({ x: 500, top: 400 }, 272, { left: 0, right: 1000 })
  const nearWall = placeBubble({ x: 30, top: 400 }, 240, { left: 0, right: 390 })
  const tailX = nearWall.left + nearWall.tail
  check('the bubble sits over the robot, tail pointing at it, and stays inside the level by a wall',
    middle.left === 500 - 136 && middle.tail === 136 && middle.bottom === 400 - BUBBLE_GAP
      && nearWall.left >= 0 && nearWall.left + 240 <= 390 && Math.abs(tailX - 30) <= 24,
    `mid-level: left ${middle.left}, tail at ${middle.tail}, bottom ${middle.bottom}; ` +
    `robot at x=30 by the wall: left ${nearWall.left}, tail at x=${tailX}`)
}

// 14. The rail has a link for every section the level has, each pointing at an
//     element that exists, and its fill runs from the first dot to the last.
{
  const html = levelMarkup()
  const rail = railMarkup()
  const ids = [...rail.matchAll(/data-section-id="([^"]+)"/g)].map((m) => m[1])
  const missing = ids.filter((id) => !html.includes(`id="${id}"`))
  const labels = SECTIONS.map((s) => s.label)
  const tops = [0, 100, 300, 400]
  const start = railProgress(0, tops)
  const between = railProgress(200, tops)
  const end = railProgress(900, tops)
  check('the rail links every section of the level, and its fill runs between the dots',
    ids.length === SECTIONS.length && missing.length === 0 && labels.includes('Prototypes') && !labels.includes('Lab')
      && start.index === 0 && start.progress === 0
      && between.index === 1 && Math.abs(between.progress - 0.5) < 1e-9
      && end.index === 3 && end.progress === 1,
    `${ids.length} links (${labels.join(', ')})` + (missing.length ? `, no element for: ${missing.join(', ')}` : '') +
    `; progress at the top ${start.progress}, halfway through the second section ${between.progress.toFixed(2)}, at the foot ${end.progress}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exitCode = failed.length ? 1 : 0
