// Drives the built site in a real headless Chrome over CDP and asserts what only
// a browser can answer: does the laid-out page form a level every part of which
// can be reached — and climbed back up from — at every width it will be read
// at? Does the real input path produce the tuned run and jump? Do landing, the
// project panel, the portal and the deep links all work end to end?
//
//   npm run build && node scripts/verify-browser.mjs
//
// Not part of `npm test` — that has to stay dependency-free and run in CI
// without a browser. This is the counterpart to platformer-smoke.mjs: the smoke
// test proves the model, this proves the page.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { launchChrome, waitFor, chromePath } from './lib/chrome.mjs'
import { SPEED, jumpApex } from '../src/game/movement.js'
import { audit } from '../src/game/reach.js'
import { projects } from '../src/data/projects.js'
import { skills } from '../src/data/profile.js'

const PORT = 4178
const CDP_PORT = 9222
// 127.0.0.1 rather than localhost, and the server told to bind it: `vite
// preview` otherwise listens on ::1 alone on some machines, where Node's fetch
// and the browser disagree about which one `localhost` means.
const ORIGIN = `http://127.0.0.1:${PORT}`

// Widths the layout is audited at: every breakpoint from both sides, the common
// phones, tablets and desktops, and past the level's 1080px cap.
const SWEEP = [360, 390, 430, 480, 540, 559, 560, 600, 700, 768, 820, 859, 860, 960, 1024, 1280, 1440]

if (!chromePath()) {
  console.error('No Chrome found — skipping browser verification.')
  process.exit(0)
}

const children = []
process.on('exit', () => children.forEach((c) => { try { c.kill() } catch {} }))

// Spawned WITHOUT shell:true. On Windows a shell spawn puts cmd.exe in between,
// and killing cmd orphans the server it started.
children.push(spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview',
  '--host', '127.0.0.1', '--port', String(PORT), '--strictPort',
], { stdio: 'ignore' }))

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

// SwiftShader gives headless Chrome a real WebGL context, so the robot loads
// the way it does for a visitor.
const { cdp } = await launchChrome({
  port: CDP_PORT,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
})

await waitFor(() => fetch(`${ORIGIN}/`).then((r) => r.ok), 'the preview server')

await cdp.send('Runtime.enable')
await cdp.send('Log.enable')
await cdp.send('Page.enable')
await cdp.send('Network.enable')

async function viewport(width, height, mobile = false) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  // maxTouchPoints must be 1-16 even when disabling.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
}

// The level is as wide as the viewport, up to its 1080px cap. Waits for the
// game to have re-measured at that width.
const levelWidth = (vw) => Math.min(1080, vw)
const settleAt = (vw) => waitFor(
  () => cdp.eval(`Math.round(window.game.level.bounds.right) === ${levelWidth(vw)}`),
  `the level to re-measure at ${vw}px`,
)

async function open(path = '/') {
  await cdp.send('Page.navigate', { url: `${ORIGIN}${path}` })
  // Headless Chrome throttles requestAnimationFrame on a background page, which
  // freezes the game loop and makes every reading below a reading of nothing.
  await cdp.send('Page.bringToFront')
  await waitFor(() => cdp.eval('!!window.game'), `the game to start at ${path}`)
}

// --- in-page helpers ------------------------------------------------------
//
// Everything that waits, waits in SIMULATED time. `Time.delta` is clamped to
// 1/20, so on a software rasteriser a wall-clock second can be a third of a
// simulated one; a check timed in milliseconds would be measuring this machine.
const INSTALL = `window.__v = {
  sim(seconds) {
    const g = window.game
    return new Promise((resolve) => {
      let t = 0
      const tick = () => { t += g.time.delta; if (t >= seconds) { g.time.off('tick', tick); resolve() } }
      g.time.on('tick', tick)
    })
  },
  // Stand the body on a platform, or hold it \`above\` px over one, with the
  // camera already there.
  place(id, { above = 0, x = null } = {}) {
    const g = window.game
    const p = g.level.byId.get(id)
    const bx = x ?? (p.left + p.right) / 2
    const grounded = above === 0
    g.body = { ...g.body, x: bx, y: p.top - above, vx: 0, verticalVelocity: 0, grounded,
      on: grounded ? p.id : null, dropThrough: null, coyote: 0, jumpBuffer: 0 }
    g.camera.snap(g.body)
    return true
  },
  modal() {
    return {
      open: !document.getElementById('modal').hidden,
      title: document.getElementById('modal-title')?.textContent ?? '',
      plyr: !!document.querySelector('#modal .plyr .plyr__controls'),
      param: new URLSearchParams(location.search).get('project'),
    }
  },
}; true`
const install = () => cdp.eval(INSTALL)
const sim = (seconds) => cdp.eval(`window.__v.sim(${seconds})`)
const place = (id, opts = {}) => cdp.eval(`window.__v.place(${JSON.stringify(id)}, ${JSON.stringify(opts)})`)
const modal = () => cdp.eval('window.__v.modal()')
const body = () => cdp.eval('({ ...window.game.body })')

const press = async (code, key, keyCode, holdSeconds = 0.05) => {
  await cdp.key('keyDown', code, key, keyCode)
  await sim(holdSeconds)
  await cdp.key('keyUp', code, key, keyCode)
}
const escape = () => press('Escape', 'Escape', 27, 0.02)

// A real click, dispatched by the browser at the element's own coordinates —
// element.click() would prove the listener runs, not that nothing is on top.
async function click(selector) {
  const box = await cdp.eval(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
    })
  }
}

const platforms = () => cdp.eval(
  'window.game.level.platforms.map((p) => ({ id: p.id, left: p.left, right: p.right, top: p.top, solid: p.solid }))',
)

const skillTagCount = skills.reduce((n, g) => n + g.items.length, 0)

// The whole level, audited at the width it is currently laid out at.
async function auditHere() {
  const list = await platforms()
  return {
    count: list.length,
    thumbs: list.filter((p) => p.id.startsWith('project-')).length,
    tags: list.filter((p) => /^skill-\d+-\d+-/.test(p.id)).length,
    ...audit(list, { spawn: 'hero', exit: 'ground' }),
  }
}

// ===========================================================================

await viewport(1280, 800)
await open('/')
await install()

// 1. The page is the level, and it is there before any script runs.
{
  const html = await (await fetch(`${ORIGIN}/`)).text()
  const served = {
    h1: /<h1 class="lv-name"/.test(html),
    platforms: (html.match(/data-platform="/g) ?? []).length,
    thumbs: (html.match(/data-project="/g) ?? []).length,
  }
  const live = await cdp.eval(`({
    playing: document.documentElement.classList.contains('is-playing'),
    wasm: performance.getEntriesByType('resource').some((r) => /\\.wasm/.test(r.name)),
    platforms: window.game.level.platforms.length,
  })`)
  check('the level is in the served HTML and the game starts on it without a physics engine',
    served.h1 && served.thumbs === projects.length && served.platforms === live.platforms
      && live.playing && !live.wasm,
    `served: h1 ${served.h1}, ${served.platforms} platforms, ${served.thumbs} thumbnails; ` +
    `live: ${live.platforms} platforms measured, playing ${live.playing}, WASM fetched ${live.wasm}`)
}

// 2. The robot loads and lands on the name.
{
  await waitFor(() => cdp.eval('window.game.avatar.ready'), 'the robot to load', 160)
  await waitFor(() => cdp.eval("window.game.body.on === 'hero'"), 'the robot to land on the name', 80)
  const b = await body()
  const hero = await cdp.eval("window.game.level.byId.get('hero').top")
  check('the robot loads and drops onto the name',
    b.on === 'hero' && b.y === hero,
    `standing on "${b.on}" at y=${b.y} (name's ledge at ${hero})`)
}

// 3. Every platform, at every width: reachable from the top, able to get down
//    to the portal, and able to climb back up to the top.
{
  const failures = []
  let counts = null
  for (const width of SWEEP) {
    await viewport(width, 900)
    await settleAt(width)
    await sim(0.05)
    const a = await auditHere()
    counts ??= a
    const wrong = [
      a.thumbs !== projects.length && `${a.thumbs}/${projects.length} thumbnails`,
      a.tags !== skillTagCount && `${a.tags}/${skillTagCount} tags`,
      a.unreachable.length && `unreachable [${a.unreachable.join(', ')}]`,
      a.stranded.length && `stranded [${a.stranded.join(', ')}]`,
      a.cutOff.length && `cannot climb back from [${a.cutOff.join(', ')}]`,
    ].filter(Boolean)
    if (wrong.length) failures.push(`${width}px: ${wrong.join('; ')}`)
  }
  check(`at ${SWEEP.length} widths from ${SWEEP[0]} to ${SWEEP.at(-1)}px, every platform can be reached, left, and climbed back up from`,
    failures.length === 0,
    failures.length ? failures.join(' | ') : `${counts.count} platforms each time (${counts.thumbs} projects, ${counts.tags} skill tags)`)
}

// 4. A live resize re-lays the page, re-measures it, and keeps the robot on its block.
{
  await viewport(1280, 800)
  await settleAt(1280)
  await place('hero')
  await sim(0.1)
  await viewport(820, 1000)
  await settleAt(820)
  await sim(0.1)
  const b = await body()
  const hero = await cdp.eval("window.game.level.byId.get('hero')")
  check('resizing the window keeps the robot standing on the block it was on',
    b.on === 'hero' && Math.abs(b.y - hero.top) < 1 && b.x >= hero.left && b.x <= hero.right,
    `after resizing to 820px: on "${b.on}" at (${b.x.toFixed(0)}, ${b.y.toFixed(0)}), ` +
    `the name now spans ${hero.left.toFixed(0)}-${hero.right.toFixed(0)} at y=${hero.top.toFixed(0)}`)
}

await viewport(1280, 800)
await settleAt(1280)

// 5. The run reaches the tuned speed through the real keyboard path.
{
  await place('ground', { x: 120 })
  await sim(0.1)
  await cdp.key('keyDown', 'KeyD', 'd', 68)
  await sim(0.45)
  const running = await body()
  await cdp.key('keyUp', 'KeyD', 'd', 68)
  await sim(0.3)
  const stopped = await body()
  check('holding D runs at the tuned speed, and letting go stops',
    Math.abs(running.vx - SPEED) < SPEED * 0.03 && Math.abs(stopped.vx) < 5,
    `${running.vx.toFixed(0)} px/s running (want ${SPEED}), ${stopped.vx.toFixed(1)} px/s after release`)
}

// 6. The jump, through the real keyboard path, sampled every frame.
{
  await place('ground', { x: 400 })
  await sim(0.1)
  const restY = (await body()).y
  await cdp.eval(`window.__arc = (() => {
    const g = window.game
    let minY = Infinity, jumps = 0
    const tick = () => { minY = Math.min(minY, g.body.y) }
    g.time.on('tick', tick)
    const offJump = g.audio.jump.bind(g.audio)
    g.audio.jump = () => { jumps++; offJump() }
    return window.__v.sim(1.2).then(() => { g.time.off('tick', tick); g.audio.jump = offJump; return { minY, jumps } })
  })(); true`)
  await press('Space', ' ', 32, 0.6)
  const arc = await cdp.eval('window.__arc')
  const rise = restY - arc.minY
  check('space jumps to the tuned height',
    arc.jumps === 1 && Math.abs(rise - jumpApex(1)) < 12,
    `rose ${rise.toFixed(1)}px against the model's ${jumpApex(1).toFixed(1)}, ${arc.jumps} jump`)
}

// 7. Up, for real, through the keyboard: from a job's first bullet, a held jump
//    comes down on a platform ABOVE where it started. Which one depends on the
//    arc — a full jump clears the company line 75px up and lands on whatever it
//    is over on the way down; a tap is the hop for the line directly above —
//    so the claim is only that up is up. The sweep in check 3 is what proves
//    every platform has a way back.
{
  await place('job-0-0')
  await sim(0.15)
  const startTop = await cdp.eval("window.game.level.byId.get('job-0-0').top")
  await press('Space', ' ', 32, 0.6)
  await sim(0.8)
  const b = await body()
  const landedTop = await cdp.eval('window.game.level.byId.get(window.game.body.on)?.top ?? null')
  check('a held jump from a line comes down on a platform above it',
    b.grounded && landedTop !== null && landedTop < startTop,
    `from "job-0-0" (top ${startTop.toFixed(0)}), landed on "${b.on}" (top ${landedTop?.toFixed(0)})`)
}

// 8. Down drops through a line to what is under it.
{
  await place('job-0')
  await sim(0.1)
  await press('ArrowDown', 'ArrowDown', 40, 0.05)
  await sim(1.2)
  const b = await body()
  const tops = await cdp.eval("({ from: window.game.level.byId.get('job-0').top, now: window.game.level.byId.get(window.game.body.on)?.top ?? null })")
  check('down drops through the platform underfoot onto the next one below',
    b.grounded && b.on !== 'job-0' && tops.now > tops.from,
    `from "job-0" (top ${tops.from.toFixed(0)}) to "${b.on}" (top ${tops.now?.toFixed(0)})`)
}

// 9. Landing on a thumbnail marks it, and E opens it with its video in Plyr;
//    closing clears the link.
{
  await place('project-lu-run', { above: 120 })
  await waitFor(() => cdp.eval("window.game.body.on === 'project-lu-run'"), 'the robot to land on LU RUN', 80)
  await sim(0.1)
  const lit = await cdp.eval("document.querySelector('[data-project=\"lu-run\"]').classList.contains('is-target')")
  await press('KeyE', 'e', 69, 0.03)
  await waitFor(async () => (await modal()).plyr, 'the video player to mount', 80)
  const opened = await modal()
  check('landing on a thumbnail marks it, and E opens that project with its video in Plyr',
    lit && opened.open && opened.title === 'LU RUN' && opened.plyr && opened.param === 'lu-run',
    `thumbnail marked ${lit}, panel "${opened.title}", Plyr mounted ${opened.plyr}, ?project=${opened.param}`)

  await escape()
  await sim(0.2)
  const after = await modal()
  check('closing the panel clears the link',
    !after.open && after.param === null,
    `panel open ${after.open}, ?project= ${after.param === null ? 'absent' : after.param}`)
}

// 10. Clicking a thumbnail opens it without playing at all.
{
  await place('hero')
  // Pin the camera and scroll the thumbnail into view, as a visitor with a mouse
  // would, without the robot anywhere near it.
  await cdp.eval(`(() => {
    window.scrollTo(0, window.game.level.origin.top + window.game.level.byId.get('project-digito').top - 200)
    window.game.camera.update = () => {}
  })()`)
  await sim(0.1)
  await click('[data-project="digito"]')
  await sim(0.1)
  const clicked = await modal()
  await escape()
  await cdp.eval('delete window.game.camera.update')
  check('clicking a thumbnail opens that project directly',
    clicked.open && clicked.title === 'Digito', `panel "${clicked.title}"`)
}

// 11. The portal takes you back to the top.
{
  await cdp.eval("window.__v.place('ground', { x: (window.game.level.portal.left + window.game.level.portal.right) / 2 })")
  await sim(0.3)
  const offered = await cdp.eval("window.game.target?.kind === 'portal'")
  await click('#portal')
  await waitFor(() => cdp.eval(
    "window.game.body.on === 'hero' && window.scrollY < 5 && !window.game.warping",
  ), 'the portal to fly the robot back to the name', 160)
  const b = await body()
  check('standing at the portal targets it, and clicking it flies back to the top',
    offered && b.on === 'hero',
    `portal targeted: ${offered}; now on "${b.on}", scrolled to ${await cdp.eval('window.scrollY')}`)
}

// 12. A ?project= link opens on that thumbnail with its panel up.
{
  await open('/?project=digito')
  await install()
  await sim(0.2)
  const landed = await modal()
  const b = await body()
  check('a ?project= link stands the robot on that thumbnail with its panel open',
    landed.open && landed.title === 'Digito' && b.on === 'project-digito',
    `panel "${landed.title}", robot on "${b.on}"`)
}

// 13. A stale one lands at the top instead of on an error.
{
  await open('/?project=not-a-real-project')
  await install()
  await waitFor(() => cdp.eval("window.game.body.on === 'hero'"), 'the stale link to land at the top', 80)
  const stale = await modal()
  check('a stale ?project= link lands at the top rather than on an error',
    !stale.open && stale.param === null, `no panel, parameter ${stale.param === null ? 'dropped' : stale.param}`)
}

// 14. On a phone the touch controls are up, and nothing overflows sideways.
{
  await viewport(390, 844, true)
  await open('/')
  await install()
  await sim(0.3)
  const phone = await cdp.eval(`(() => {
    const root = document.querySelector('.touch')
    return { shown: !!root && !root.hidden, jump: !!document.querySelector('.touch__btn--jump'),
      overflow: document.documentElement.scrollWidth > innerWidth }
  })()`)
  check('on a phone the joystick and Jump button are up and nothing overflows sideways',
    phone.shown && phone.jump && !phone.overflow,
    `touch controls ${phone.shown}, Jump button ${phone.jump}, horizontal overflow ${phone.overflow}`)
}

// 15. Nothing threw, nothing 404'd, and nothing left this origin — Plyr's
//     sprite and blank video default to its CDN, and both are overridden.
{
  const errors = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const thrown = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
  const missing = cdp.events
    .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
    .map((e) => `${e.params.response.status} ${e.params.response.url}`)
  const external = cdp.events
    .filter((e) => e.method === 'Network.requestWillBeSent')
    .map((e) => e.params.request.url)
    .filter((url) => !url.startsWith(ORIGIN) && !/^(data|blob):/.test(url))
  const all = [...new Set([...errors, ...thrown, ...missing, ...external])]
  check('no console errors, nothing 404s, and no request leaves the site', all.length === 0,
    all.length ? all.join(' | ') : 'clean console, every request served locally')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)

await sleep(50)
process.exit(failed.length ? 1 : 0)
