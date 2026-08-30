// Screenshots the built showroom in headless Chrome and writes public/og.png,
// the image every share card uses.
//
//   npm run build && node scripts/capture-og.mjs
//
// Generated rather than hand-made so it can never drift from the level: change
// the rooms, re-run this, and the card matches what a visitor actually lands in.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { ROOM, WINGS } from '../src/world/layout.js'
import { OWNER } from '../src/data/projects.js'

const PORT = 4181
const CDP_PORT = 9224
const OUT = 'public/og.png'

// How the shot is posed. The gameplay camera is tuned for walking a room; at
// 1200x630 that same angle is mostly empty floor. These are photograph
// settings — tweak them and re-run to reframe the card.
const SHOT = {
  wing: 'games',        // the busiest room: 5 kiosks in a U
  // Deep in the room, NOT by the doorway. The camera sits 'distance' back along
  // +z, so standing near the door puts it outside the room looking at the back
  // of a wall. Standing deep keeps it inside, above the 6-unit walls.
  standAt: ROOM.z - 4,
  pitch: 0.6,           // lower than the ~0.95 you play at
  distance: 16,
}

// 1200x630 is the size Open Graph, LinkedIn and Twitter all read as a large card.
const WIDTH = 1200
const HEIGHT = 630

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p))

if (!CHROME) {
  console.error('No Chrome found — cannot capture the share image.')
  process.exit(1)
}

const PROFILE = mkdtempSync(join(tmpdir(), 'portfolio-og-'))
const children = []
const kill = () => {
  children.forEach((c) => { try { c.kill() } catch {} })
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch {}
}
process.on('exit', kill)

children.push(spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort',
], { stdio: 'ignore' }))

children.push(spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${PROFILE}`,
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
], { stdio: 'ignore' }))

async function waitFor(fn, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v } catch {}
    await sleep(250)
  }
  console.error(`timed out waiting for ${label}`)
  process.exit(1)
}

const target = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
  return list.find((t) => t.type === 'page')
}, 'a Chrome page target')
await waitFor(() => fetch(`http://localhost:${PORT}/`).then((r) => r.ok), 'the preview server')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
  }
}
const send = (method, params = {}) => {
  const i = ++id
  ws.send(JSON.stringify({ id: i, method, params }))
  return new Promise((res, rej) => pending.set(i, { res, rej }))
}
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval threw')
  return r.result.value
}

await send('Runtime.enable')
await send('Page.enable')
// deviceScaleFactor 2 so the capture is crisp when a card scales it up.
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: false,
})
await send('Page.navigate', { url: `http://localhost:${PORT}/` })
await send('Page.bringToFront')   // headless throttles rAF on a background page

await waitFor(() => evaluate('!!window.experience?.world?.player'), 'the showroom to boot')

// Place the player rather than walking them there. Walking works, but
// SwiftShader renders 2400x1260 at a few frames a second and Time.delta is
// clamped to 1/20 to stop an alt-tab teleporting anyone through a wall — so the
// walk runs in slow motion and takes the better part of a minute per room.
const wing = WINGS.find((w) => w.id === SHOT.wing) ?? WINGS[0]
await evaluate(`
  const p = window.experience.world.player
  const at = { x: ${wing.x}, y: 0.92, z: ${SHOT.standAt} }
  // setTranslation, not setNextKinematicTranslation: the queued "next" position
  // is overwritten on the very next frame, because Player.update reads the
  // body's CURRENT translation and adds this frame's movement to it.
  p.body.setTranslation(at, true)
  p.body.setNextKinematicTranslation(at)
  p.mesh.position.set(at.x, at.y, at.z)
  p.velocity = { x: 0, z: 0 }
  void 0
`)

// Drop the camera out of the gameplay top-down pitch for the shot only.
//
// The playing angle is tuned so you can read a whole room while walking it; at
// 1200x630 that same angle is mostly empty floor with the kiosks pushed into the
// corners. A lower, closer camera puts the project art face-on and fills the
// frame — this is a photograph of the place, not a screenshot of the HUD.
await evaluate(`
  const c = window.experience.camera
  c.yaw = 0                       // camera to the south, looking into the room
  c.pitch = ${SHOT.pitch}
  c.distance = ${SHOT.distance}
  c.currentDistance = ${SHOT.distance}
  // Photograph mode: drop the wall-occlusion clamp. In play it stops the camera
  // hiding behind geometry; for a posed shot it silently pulls in to a few
  // metres and fills the frame with the player capsule instead of the room.
  c.clearDistance = () => c.distance
  void 0
`)

// Let the player brake, the camera ease to the new framing, and the kiosk
// textures finish decoding.
await sleep(2500)

// Strip the interactive chrome and caption the shot. A share card has to say
// whose portfolio it is even as a thumbnail in a LinkedIn feed — the room label
// alone reads as a screenshot from an unnamed game.
await evaluate(`
  document.querySelector('.controls')?.remove()
  document.getElementById('hint')?.remove()
  document.getElementById('loader')?.remove()
  document.querySelector('.hud')?.remove()

  const card = document.createElement('div')
  card.style.cssText = [
    'position:fixed', 'inset:auto 0 0 0', 'padding:2.4rem 3rem 2.6rem',
    'background:linear-gradient(to top, rgba(16,18,28,0.93) 35%, rgba(16,18,28,0) 100%)',
    'font-family:Inter, system-ui, -apple-system, Segoe UI, sans-serif',
    'color:#f2f4f8', 'z-index:999',
  ].join(';')
  card.innerHTML =
    '<div style="font-size:3.1rem;font-weight:700;letter-spacing:-0.02em;line-height:1.05">' +
      ${JSON.stringify(OWNER.name)} +
    '</div>' +
    '<div style="margin-top:0.5rem;font-size:1.5rem;color:#22c3e6;font-weight:600">' +
      ${JSON.stringify(OWNER.title)} +
    '</div>' +
    '<div style="margin-top:0.35rem;font-size:1.15rem;opacity:0.62">' +
      'A portfolio you walk around in' +
    '</div>'
  document.body.appendChild(card)
  void 0
`)
await sleep(500)

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
writeFileSync(OUT, Buffer.from(shot.data, 'base64'))

const framing = await evaluate('window.experience.camera.currentDistance')
const where = await evaluate('window.experience.hud.room')
console.log(`camera settled ${framing.toFixed(1)} units back (asked for ${SHOT.distance})`)
const p = await evaluate('JSON.parse(JSON.stringify(window.experience.world.player.position))')
console.log(`wrote ${OUT} — ${WIDTH * 2}x${HEIGHT * 2}, shot in "${where}" at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)

kill()
process.exit(0)
