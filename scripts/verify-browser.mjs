// Drives the built site in a real headless Chrome over CDP and asserts the
// things only a browser can answer: does it boot without console errors, and
// does the movement model actually produce the speeds it is tuned for?
//
//   npm run build && node scripts/verify-browser.mjs
//
// Not part of `npm test` — that has to stay dependency-free and run in CI
// without a browser. This is the manual counterpart to physics-smoke.mjs:
// the smoke test proves the maths, this proves the wiring.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { SPEED, SPRINT_MULTIPLIER } from '../src/world/movement.js'
import { CORRIDOR } from '../src/world/layout.js'

const PORT = 4178
const CDP_PORT = 9222

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))

if (!CHROME) {
  console.error('No Chrome found — skipping browser verification.')
  process.exit(0)
}

// A FRESH profile per run. Chrome will not open a second debugging port on a
// profile another instance still holds — it silently hands the URL to the
// running instance and exits, leaving the harness waiting forever for a target
// that never appears. A leftover lock from a killed run is enough to cause it.
const PROFILE = mkdtempSync(join(tmpdir(), 'portfolio-verify-'))

const children = []
const kill = () => {
  children.forEach((c) => { try { c.kill() } catch {} })
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}
process.on('exit', kill)

// Spawned WITHOUT shell:true. On Windows a shell spawn puts cmd.exe in between,
// and killing cmd orphans the server it started — which then holds the port and
// makes the next run fail against a stale build.
function serve() {
  const p = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort',
  ], { stdio: 'ignore' })
  children.push(p)
  return p
}

function browser() {
  // SwiftShader gives headless Chrome a real WebGL2 context; without it the app
  // correctly redirects to classic.html and we would verify nothing.
  const p = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${PROFILE}`,
    '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' })
  children.push(p)
  return p
}

async function waitFor(fn, label, tries = 60) {
  let last
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v } catch (e) { last = e }
    await sleep(250)
  }
  console.error(`FAIL  timed out after ${(tries * 250) / 1000}s waiting for ${label}` +
    (last ? `
      last error: ${last.message}` : ''))
  process.exit(1)
}

// Minimal CDP client: one websocket, id-matched replies.
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [] }

  static async attach(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const cdp = new Cdp(ws)
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && cdp.pending.has(msg.id)) {
        const { res, rej } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      } else if (msg.method) cdp.events.push(msg)
    }
    return cdp
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { res, rej }))
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval threw')
    return r.result.value
  }

  // `code` is what the app reads (e.type/e.code), so it must be set.
  key(type, code, key, keyCode) {
    return this.send('Input.dispatchKeyEvent', {
      type, code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    })
  }
}

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`)
}

serve()
browser()

const target = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
  return list.find((t) => t.type === 'page')
}, 'a Chrome page target')

await waitFor(() => fetch(`http://localhost:${PORT}/`).then((r) => r.ok), 'the preview server')

const cdp = await Cdp.attach(target.webSocketDebuggerUrl)
await cdp.send('Runtime.enable')
await cdp.send('Log.enable')
await cdp.send('Page.enable')
await cdp.send('Network.enable')
await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/` })

// Headless Chrome throttles requestAnimationFrame on a page that is not
// foregrounded, which freezes the render loop mid-walk and makes every speed
// reading zero. Without this the whole harness silently measures nothing.
await cdp.send('Page.bringToFront')

await waitFor(() => cdp.eval('!!(window.experience?.world?.player)'), 'the showroom to boot')

// 1. Booted into WebGL, not the classic fallback.
{
  const url = await cdp.eval('location.pathname')
  check('boots the 3D showroom rather than falling back to classic.html',
    !url.includes('classic'), `landed on ${url}`)
}

// Let it settle on the floor before measuring anything.
//
// Not a bare sleep, because the first frames are the expensive ones: shader
// compilation for the normal-mapped matcaps and the skinned character, and the
// texture uploads behind them. On a software rasteriser that can swallow most of
// a second — and since `Time.delta` is clamped to 1/20, a measurement taken
// across those frames sees almost no SIMULATED time and reports a walk that
// never got up to speed. Waiting on the boot flag alone is not enough: it
// resolves when World is constructed, which is before anything has rendered.
//
// So wait for the character to land and for the renderer to be demonstrably
// past its first frames, then settle. This measures steady state, which is what
// the speed checks below are actually about.
await waitFor(() => cdp.eval('!!window.experience.world.player.character?.ready'),
  'the character model to load')
const frameCount = () => cdp.eval('window.experience.renderer.instance.info.render.frame')
const firstFrame = await frameCount()
await waitFor(async () => (await frameCount()) > firstFrame + 30, 'the renderer to warm up')
await sleep(400)

const speedNow = () => cdp.eval('window.experience.world.player.speed')
const posNow = () => cdp.eval('JSON.parse(JSON.stringify(window.experience.world.player.position))')

// Poll until the reading stops moving, then return it.
//
// Sampling at a fixed wall-clock offset is the wrong instrument here. Speed
// ramps in SIMULATED time, and `Time.delta` is clamped to 1/20, so one slow
// frame on a software rasteriser can leave a fixed window catching the ramp
// half-finished — which is a statement about this machine's frame rate, not
// about the movement model. The ramp DURATION is already asserted
// deterministically against real Rapier in physics-smoke.mjs; what only a
// browser can answer is the steady speed the real input path produces.
// Stability is counted in RENDERED FRAMES, not in elapsed milliseconds.
//
// Two identical readings 120ms apart prove nothing on their own: if no frame was
// drawn between them, the value could not have changed, and a still-accelerating
// player reads as a settled one. SwiftShader rasterises this scene's anisotropic
// tiled floor in software and can drop to a few frames a second on a loaded
// machine, which is exactly when that false reading appears. So a sample only
// counts once the renderer's frame counter has moved.
//
// The timeout is a backstop, not a budget. The player has ~22 m of runway from
// spawn into the XR room, so a stalled settle stops on the clock rather than on
// a wall.
async function settled(read, { tolerance = 0.05, stableFor = 3, timeout = 6000 } = {}) {
  const sample = async () => ({ value: await read(), frame: await frameCount() })
  const startedAt = Date.now()
  let last = await sample()
  let stable = 0

  while (Date.now() - startedAt < timeout) {
    await sleep(120)
    const now = await sample()
    if (now.frame === last.frame) continue   // nothing was drawn; nothing to learn
    stable = Math.abs(now.value - last.value) < tolerance ? stable + 1 : 0
    last = now
    if (stable >= stableFor) break
  }
  return last.value
}

// 2. Walking reaches base speed, and not more.
await cdp.key('keyDown', 'KeyW', 'w', 87)
const walkSpeed = await settled(speedNow)
check('holding W accelerates to the tuned walk speed',
  Math.abs(walkSpeed - SPEED) < 0.6,
  `${walkSpeed.toFixed(2)} m/s once settled (want ~${SPEED})`)

// 3. Shift sprints.
await cdp.key('keyDown', 'ShiftLeft', 'Shift', 16)
const sprintSpeed = await settled(speedNow)
const wantSprint = SPEED * SPRINT_MULTIPLIER
check('shift sprints',
  Math.abs(sprintSpeed - wantSprint) < 0.8 && sprintSpeed > walkSpeed + 1,
  `${sprintSpeed.toFixed(2)} m/s (want ~${wantSprint.toFixed(1)}), up from ${walkSpeed.toFixed(2)}`)

// 4. The camera widened while sprinting.
//
// Held a moment longer than the sprint itself: the FOV is eased separately from
// the rig, and deliberately more slowly, so that it trails the acceleration
// rather than snapping with it. Reading it the instant speed settles would be
// reading it mid-ease.
await sleep(900)
const fov = await cdp.eval('window.experience.camera.instance.fov')
check('the camera widens at sprint speed',
  fov > 58, `fov ${fov.toFixed(1)} (55 at rest)`)

// 5. Releasing the keys brings them to a stop, and they coast only a little.
//
// Measured inside the page, armed BEFORE the key is released. A CDP round-trip
// is tens of milliseconds and the brake takes ~110ms, so sampling the position
// from Node after sending keyUp reports a coast of zero no matter how far the
// player actually slid — a check that passes without testing anything.
await cdp.eval(`window.__coast = new Promise((resolve) => {
  const p = window.experience.world.player
  window.addEventListener('keyup', function onUp(e) {
    if (e.code !== 'KeyW') return
    window.removeEventListener('keyup', onUp)
    const start = { x: p.position.x, z: p.position.z }
    const tick = () => {
      if (p.speed < 0.05) {
        resolve({ coast: Math.hypot(p.position.x - start.x, p.position.z - start.z), speed: p.speed })
      } else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
})
// The completion value must not BE the promise: eval() awaits what it returns,
// so returning it here would block on a release that has not happened yet.
void 0`)

await cdp.key('keyUp', 'ShiftLeft', 'Shift', 16)
await cdp.key('keyUp', 'KeyW', 'w', 87)
const stop = await cdp.eval('window.__coast')
check('releasing the keys stops the player without a long slide',
  stop.speed < 0.05 && stop.coast > 0.05 && stop.coast < 1.2,
  `coasted ${stop.coast.toFixed(2)}m down to ${stop.speed.toFixed(3)} m/s (want a real but short slide)`)

// 6. Still on the floor, inside the level.
{
  const p = await posNow()
  check('never left the floor or the level', p.y > 0.5 && p.y < 2 && Math.abs(p.x) < 60,
    `resting at (${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})`)
}

// 6b. The walk holds its speed instead of stuttering.
//
// The regression test for what the walk actually felt like. The character
// controller used to refuse the occasional frame on open floor — its own
// depenetration against the skin offset, not geometry — and the velocity
// fold-back treated each refusal as a wall and dropped the player to a
// standstill. Sampled in the page across every rendered frame, because the
// collapse and recovery took about 150ms and a CDP poll would step right over
// it. Speed is in m/s, so a slow frame cannot fake a pass.
//
// This is the SYMPTOM check — does the walk hold its speed. Its deterministic
// counterpart is "the controller never refuses a frame on open floor" in
// physics-smoke.mjs, which catches the cause at a fixed timestep. Both are
// needed: with the one-frame grace in resolveVelocity, an isolated refusal is
// absorbed and never reaches the speed, so this check alone would not notice
// the ground stick coming back.
//
// Driven with D rather than W, from the west end of the corridor: at yaw 0
// that strafes east down 70-odd metres of empty floor. Walking forward from
// wherever the previous check left the player runs into the room's north wall
// mid-sample, and a wall stopping the player is not the thing under test.
{
  await cdp.eval(`(() => {
    const p = window.experience.world.player
    const x = -${CORRIDOR.length / 2} + 5
    p.body.setTranslation({ x, y: 1.5, z: ${CORRIDOR.z} }, true)
    p.body.setNextKinematicTranslation({ x, y: 1.5, z: ${CORRIDOR.z} })
    p.mesh.position.set(x, 1.5, ${CORRIDOR.z})
    p.velocity = { x: 0, z: 0 }
    window.experience.camera.yaw = 0
  })()`)
  await sleep(700)

  await cdp.eval(`window.__walk = new Promise((resolve) => {
    const p = window.experience.world.player
    const samples = []
    const started = performance.now()
    const tick = () => {
      samples.push(p.speed)
      if (performance.now() - started < 4000) requestAnimationFrame(tick)
      else {
        // Judge only the stretch after the ramp, where speed should be flat.
        const run = samples.slice(Math.floor(samples.length / 3))
        resolve({ frames: run.length, top: Math.max(...run), low: Math.min(...run), x: p.position.x })
      }
    }
    requestAnimationFrame(tick)
  })
  void 0`)

  await cdp.key('keyDown', 'KeyD', 'd', 68)
  const walk = await cdp.eval('window.__walk')
  await cdp.key('keyUp', 'KeyD', 'd', 68)
  await sleep(400)

  const dip = walk.low / walk.top
  check('the walk holds its speed instead of stuttering',
    walk.frames > 10 && dip > 0.9 && walk.x < CORRIDOR.length / 2 - 6,
    `over ${walk.frames} frames at speed, the slowest was ${walk.low.toFixed(2)} m/s ` +
    `against a top of ${walk.top.toFixed(2)} (${(100 * dip).toFixed(0)}% — want >90%), ` +
    `ended x=${walk.x.toFixed(1)} with the end cap at ${CORRIDOR.length / 2}`)
}

// 7. The two locomotion clips stay in step with each other.
//
// Walk and run are posed by hand from one shared phase; the mixer must not be
// advancing them on its own, or they drift apart within seconds and the blend
// between them averages a left step against a right one. That is what the
// jitter was. Sampled twice, a second apart, mid-stride: if the mixer had hold
// of either clip the two normalised phases would separate.
{
  const phases = () => cdp.eval(`(() => {
    const c = window.experience.world.player.character
    const at = (k) => c.actions[k].time / c.durations[k]
    return { walk: at('walk'), run: at('run') }
  })()`)

  await cdp.key('keyDown', 'KeyW', 'w', 87)
  await sleep(600)
  const first = await phases()
  await sleep(900)
  const second = await phases()
  await cdp.key('keyUp', 'KeyW', 'w', 87)

  const drift = (p) => Math.abs(p.walk - p.run)
  // The phase has to actually be MOVING, or two frozen clips would agree
  // trivially and this would assert nothing.
  const advanced = Math.abs(second.walk - first.walk) > 1e-4
  check('the walk and run cycles stay phase-locked while moving',
    advanced && drift(first) < 1e-6 && drift(second) < 1e-6,
    `walk/run phase gap ${drift(first).toExponential(1)} then ${drift(second).toExponential(1)}` +
    `, cycle ${advanced ? 'advancing' : 'FROZEN'}`)
}

// 7b. Footsteps are sounded by that same gait, not by distance travelled.
//
// The sound used to fire every 1.9 metres, which is only ever right at one
// speed: the stride is ~0.81 m per footfall in the walk cycle and ~3.11 m in
// the run, so at the 8 m/s base speed the ear heard 1.6 steps for every one the
// legs took. Counting half-cycles instead means the two cannot come apart at
// any speed — two footfalls per gait cycle, give or take the boundary each end
// of the measured window can clip (the sounds are counted from the frame the
// promise is made, the cycles from the frame after it).
{
  // Back to the middle of the corridor first. The tests above leave the player
  // pressed against a wall in z, and a blocked player still turns the gait
  // phase at its idle floor while moving nowhere — which is precisely the case
  // that must stay SILENT, not the one under test here.
  await cdp.eval(`(() => {
    const p = window.experience.world.player
    const z = ${CORRIDOR.z}
    p.body.setTranslation({ x: 0, y: 1.5, z }, true)
    p.body.setNextKinematicTranslation({ x: 0, y: 1.5, z })
    p.mesh.position.set(0, 1.5, z)
  })()`)
  await sleep(300)

  // Along the corridor, where there is room to run: D is the direction 6b
  // already proved has 40 metres of it.
  await cdp.key('keyDown', 'KeyD', 'd', 68)
  await waitFor(async () => (await speedNow()) > SPEED * 0.9, 'the player to reach walking speed')

  await cdp.eval(`window.__steps = new Promise((resolve) => {
    const character = window.experience.world.player.character
    const audio = window.experience.audio
    // Count the CALL, not the sound: footstep() returns early while muted or
    // before the first gesture unlocks the context, and the pacing is what is
    // under test here, not the synth.
    const real = audio.footstep.bind(audio)
    let sounds = 0
    audio.footstep = () => { sounds++; real() }

    let last = character.phase
    let cycles = 0
    let frames = 0
    let speed = 0
    const tick = () => {
      // Phase wraps at 1; a negative delta is one wrap, never a rewind.
      const d = character.phase - last
      cycles += d < 0 ? d + 1 : d
      last = character.phase
      speed += window.experience.world.player.speed
      frames++
      if (frames < 120) requestAnimationFrame(tick)
      else { audio.footstep = real; resolve({ sounds, cycles, speed: speed / frames }) }
    }
    requestAnimationFrame(tick)
  })
  void 0`)
  const steps = await cdp.eval('window.__steps')
  await cdp.key('keyUp', 'KeyD', 'd', 68)
  await sleep(400)

  const expected = steps.cycles * 2
  check('footsteps are sounded once per footfall of the gait cycle',
    expected > 4 && Math.abs(steps.sounds - expected) <= 1.5,
    `${steps.sounds} steps heard over ${steps.cycles.toFixed(2)} gait cycles ` +
    `at ${steps.speed.toFixed(2)} m/s (want ${expected.toFixed(2)} steps, ±1.5)`)
}

// 8. The kiosk prompt is a button you can click, not a caption about a key.
{
  // Put the player on a kiosk's hotspot directly. Walking there is the job of
  // physics-smoke.mjs, which already proves every hotspot is reachable; what is
  // under test here is the prompt, so this takes the shortest route to one.
  const project = await cdp.eval(`(() => {
    const w = window.experience.world
    const k = w.kiosks[0]
    const t = k.triggerPoint
    w.player.body.setTranslation({ x: t.x, y: 1.5, z: t.z }, true)
    w.player.body.setNextKinematicTranslation({ x: t.x, y: 1.5, z: t.z })
    w.player.mesh.position.set(t.x, 1.5, t.z)
    return k.project.title
  })()`)
  await sleep(500)

  const prompt = await cdp.eval(`(() => {
    const el = document.getElementById('prompt')
    return {
      tag: el.tagName,
      hidden: el.hidden,
      text: el.textContent,
      clickable: getComputedStyle(el).pointerEvents,
      label: el.getAttribute('aria-label'),
    }
  })()`)
  check('the kiosk prompt is a real, clickable button naming the project',
    prompt.tag === 'BUTTON' && !prompt.hidden && prompt.clickable === 'auto'
      && prompt.text.includes(project) && prompt.label === `Open ${project}`,
    `<${prompt.tag.toLowerCase()}> "${prompt.text}", pointer-events: ${prompt.clickable}`)

  // A real click, dispatched by the browser at the button's own coordinates —
  // not element.click(), which would prove the listener runs but not that the
  // button is actually reachable through the HUD overlay above the canvas.
  const box = await cdp.eval(`(() => {
    const r = document.getElementById('prompt').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
    })
  }
  await sleep(400)

  const opened = await cdp.eval(`(() => ({
    open: !document.getElementById('modal').hidden,
    title: document.getElementById('modal-title')?.textContent ?? '',
    paused: window.experience.paused,
    focused: document.activeElement?.id ?? 'none',
  }))()`)
  check('clicking the prompt opens that project and hands focus back to the game',
    opened.open && opened.paused && opened.title.includes(project) && opened.focused !== 'prompt',
    `modal "${opened.title}" open, focus on ${opened.focused}`)

  await cdp.key('keyDown', 'Escape', 'Escape', 27)
  await cdp.key('keyUp', 'Escape', 'Escape', 27)
  await sleep(300)
}

// 9. Nothing threw along the way.
{
  const errors = cdp.events
    .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text)
  const missing = cdp.events
    .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
    .map((e) => `${e.params.response.status} ${e.params.response.url}`)
  const all = [...new Set([...errors, ...missing])]
  check('no console errors and nothing 404s', all.length === 0,
    all.length ? all.join(' | ') : 'clean console, every request served')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
kill()
process.exit(failed.length ? 1 : 0)
