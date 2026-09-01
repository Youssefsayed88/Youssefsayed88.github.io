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
import { setTimeout as sleep } from 'node:timers/promises'
import { launchChrome, waitFor, chromePath } from './lib/chrome.mjs'
import { SPEED, SPRINT_MULTIPLIER, jumpApex } from '../src/world/movement.js'
import { CORRIDOR, ROOM } from '../src/world/layout.js'
import { projects } from '../src/data/projects.js'

const PORT = 4178
const CDP_PORT = 9222

if (!chromePath()) {
  console.error('No Chrome found — skipping browser verification.')
  process.exit(0)
}

const children = []
process.on('exit', () => children.forEach((c) => { try { c.kill() } catch {} }))

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

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}
      ${detail}`)
}

serve()

// SwiftShader gives headless Chrome a real WebGL2 context; without it the app
// correctly redirects to classic.html and we would verify nothing.
const { cdp } = await launchChrome({
  port: CDP_PORT,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
})

await waitFor(() => fetch(`http://localhost:${PORT}/`).then((r) => r.ok), 'the preview server')

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

// 7c. And the step is loud enough to be heard when it fires.
//
// Pacing the sound to the gait is only half of it: the first version of that
// burst rendered at a peak of 0.015 against a UI beep's 0.034, and firing it
// half again less often was enough to make it disappear entirely. A cue nobody
// can hear is the same bug as a cue that never fires, so the level is asserted
// alongside the timing — rendered offline, because a headless browser has no
// speakers and an opinion about loudness is not a test.
{
  const level = (call) => cdp.eval(`(async () => {
    const a = window.experience.audio
    const live = { ctx: a.ctx, master: a.master, noise: a.noiseBuffer }
    // Swap the whole graph onto an offline context, render one second of it,
    // then put the live one back. a.master carries the real master gain, so
    // this measures what actually reaches the speakers.
    const off = new OfflineAudioContext(1, 44100, 44100)
    a.ctx = off
    a.master = off.createGain()
    a.master.gain.value = live.master.gain.value
    a.master.connect(off.destination)
    a.noiseBuffer = a.makeNoise(0.35)
    a.${call}
    const buf = await off.startRendering()
    Object.assign(a, { ctx: live.ctx, master: live.master, noiseBuffer: live.noise })
    const d = buf.getChannelData(0)
    let peak = 0
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
    return peak
  })()`)

  const step = await level('footstep()')
  const beep = await level('nearKiosk()')
  check('a footstep is as audible as the interface cues',
    step > beep && step < 0.3,
    `footstep peaks at ${step.toFixed(3)} against the kiosk ping's ${beep.toFixed(3)} ` +
    `(want louder than the ping, under 0.3)`)
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

// 8b. The jump, in the real browser. physics-smoke.mjs pins the model against
//      Rapier at fixed timesteps; this proves the KEY reaches it and that the
//      arc survives a real, jittery frame clock. Sampled in the page across
//      every rendered frame, because the whole jump is half a second and a CDP
//      poll would step over the apex.
{
  await cdp.eval(`(() => {
    const p = window.experience.world.player
    p.teleport({ x: 0, y: 1.5, z: ${CORRIDOR.z} }, 0)
  })()`)

  // Wait for the drop from the teleport height to finish. Not a fixed sleep:
  // SwiftShader clamps Time.delta at 1/20, so wall-clock and simulated time run
  // at different rates and a settle measured in milliseconds is a guess about
  // this machine. Reading `rest` a few centimetres early is subtracted straight
  // off the measured rise.
  await waitFor(async () => cdp.eval(
    'window.experience.world.player.grounded && window.experience.world.player.verticalVelocity === 0',
  ), 'the player to settle before jumping')

  // Peak only; `rest` is read out here, once, from a player known to be resting.
  const track = () => cdp.eval(`window.__arc = new Promise((resolve) => {
    const p = window.experience.world.player
    let peak = -Infinity
    let jumps = 0
    const started = performance.now()
    const tick = () => {
      if (p.jumped) jumps++
      peak = Math.max(peak, p.position.y)
      if (performance.now() - started < 2500) requestAnimationFrame(tick)
      else resolve({ peak, jumps })
    }
    requestAnimationFrame(tick)
  })
  void 0`)

  const restY = await cdp.eval('window.experience.world.player.position.y')

  const press = async (holdMs) => {
    await track()
    await cdp.key('keyDown', 'Space', ' ', 32)
    await sleep(holdMs)
    await cdp.key('keyUp', 'Space', ' ', 32)
    const r = await cdp.eval('window.__arc')
    return { rise: r.peak - restY, jumps: r.jumps }
  }

  // Only the held press is measured here. Tap-versus-hold is pinned
  // deterministically in physics-smoke.mjs at 30, 60 and 120fps; under
  // SwiftShader a frame can be longer than the tap itself, so asserting it here
  // would be testing this machine's frame rate.
  const full = await press(600)

  const want = jumpApex(1)
  check('space jumps to the tuned height',
    full.jumps === 1 && Math.abs(full.rise - want) < 0.12,
    `rose ${full.rise.toFixed(2)}m against the model's ${want.toFixed(2)}, ` +
    `${full.jumps} jump from the held press`)
}

// 8c. The camera must not jam itself against the player at a kiosk.
//
// The reproduction is specific, and worth stating because a check taken
// anywhere else passes against the broken code. It needs BOTH:
//
//   - the player near the front of a room, a couple of metres off the south
//     wall, which is where the front row of kiosks is;
//   - the camera looking south over that wall (yaw 0) at the shallow end of the
//     pitch band, which is where the boom is longest and lowest.
//
// From the default 54 degrees the rig already clears a 6 m wall, so the old
// code looked fine most of the time. Here the ray meets the wall 2.5 m out, the
// old rig clamped to its 3 m floor, and the character filled the frame at the
// exact moment the screen behind them was the point. The fix goes OVER instead,
// so the assertion is that the boom stays long AND the pitch was lifted.
{
  // The real front kiosk, not the middle of the room: the middle of a room's
  // south wall is the DOORWAY, and a ray fired through an opening proves
  // nothing. The front row of kiosks sits against the side walls, well clear
  // of it, which is also where a visitor actually stands.
  const front = await cdp.eval(`(() => {
    const e = window.experience
    const k = e.world.kiosks.reduce((a, b) => (b.triggerPoint.z > a.triggerPoint.z ? b : a))
    e.world.player.teleport(k.triggerPoint, k.rotationY)
    e.camera.yaw = 0             // swung to look south, over the wall behind them
    e.camera.pitch = 0.62        // PITCH_MIN: the shallowest the player can go
    e.camera.viewPitch = 0.62    // start unassisted, so the ease is observable
    return { id: k.project.id, x: k.triggerPoint.x, z: k.triggerPoint.z }
  })()`)
  await sleep(1600)              // let the assist ease in

  const view = await cdp.eval(`(() => {
    const c = window.experience.camera
    const p = window.experience.world.player.position
    return {
      distance: c.currentDistance,
      pitch: c.pitch,
      viewPitch: c.viewPitch,
      height: c.instance.position.y - p.y,
    }
  })()`)
  check('the camera pitches over the wall at a kiosk instead of jamming in close',
    view.distance > 8 && view.viewPitch > view.pitch + 0.05,
    `boom ${view.distance.toFixed(1)}m (3m is the old jam floor), pitch ${view.pitch.toFixed(2)} ` +
    `assisted to ${view.viewPitch.toFixed(2)}, camera ${view.height.toFixed(1)}m above the player, ` +
    `at "${front.id}", ${(ROOM.z + ROOM.depth / 2 - front.z).toFixed(1)}m off the south wall`)
}

// 8d. A ?project= deep link opens on its kiosk, and the address bar tracks the
//     panel afterwards. Reloads the page, so it goes last.
{
  const target = projects[projects.length - 1].id
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?project=${target}` })
  await waitFor(() => cdp.eval('!!(window.experience?.world?.player)'), 'the deep link to boot')
  await sleep(1200)

  const landed = await cdp.eval(`(() => {
    const e = window.experience
    return {
      active: e.world.activeKiosk?.project.id ?? null,
      open: !document.getElementById('modal').hidden,
      title: document.getElementById('modal-title')?.textContent ?? '',
      param: new URLSearchParams(location.search).get('project'),
      boom: e.camera.currentDistance,
    }
  })()`)
  check('a ?project= link lands on that kiosk with its panel open',
    landed.active === target && landed.open && landed.param === target,
    `asked for "${target}", standing at "${landed.active}" with "${landed.title}" open, ` +
    `boom ${landed.boom.toFixed(1)}m`)

  // Closing it must clear the parameter, or every later copy of the URL would
  // still point at a panel that is no longer open.
  await cdp.key('keyDown', 'Escape', 'Escape', 27)
  await cdp.key('keyUp', 'Escape', 'Escape', 27)
  await sleep(400)
  const after = await cdp.eval("new URLSearchParams(location.search).get('project')")
  check('closing the panel drops the project from the URL',
    after === null, `?project= is now ${after === null ? 'absent' : after}`)
}

// 8e. A deep link to a project that no longer exists must not strand anyone.
{
  await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/?project=not-a-real-project` })
  await waitFor(() => cdp.eval('!!(window.experience?.world?.player)'), 'the stale link to boot')
  await sleep(800)

  const stale = await cdp.eval(`(() => ({
    open: !document.getElementById('modal').hidden,
    param: new URLSearchParams(location.search).get('project'),
    y: window.experience.world.player.position.y,
  }))()`)
  check('a stale ?project= link lands in the showroom rather than on an error',
    !stale.open && stale.param === null && stale.y > 0.5,
    `no panel, parameter dropped, player standing at y=${stale.y.toFixed(2)}`)
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

process.exit(failed.length ? 1 : 0)
