// Screenshots the built platformer and writes public/og.jpg, the image every
// share card uses.
//
//   npm run build && node scripts/capture-og.mjs
//
// Generated rather than hand-made so it can never drift from the page: change
// the projects or the layout, re-run this, and the card matches what a visitor
// actually lands on.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { launchChrome, waitFor, chromePath } from './lib/chrome.mjs'
import { OWNER, OG_IMAGE } from '../src/data/projects.js'

const PORT = 4181
const CDP_PORT = 9224
const ORIGIN = `http://127.0.0.1:${PORT}`
// JPEG: the shot is full of screenshots of games, which is what JPEG is for.
const OUT = `public/${OG_IMAGE.path}`
const QUALITY = 88

// How the shot is posed. The Games shelf is the busiest, most colourful stretch
// of the page, and the robot standing on its middle thumbnail says "you play
// this" before a word of the caption is read.
const SHOT = {
  wing: 'wing-games',
  standOn: 'project-lu-run',
  // Pixels of page above the wing heading left in frame.
  headroom: 40,
}

if (!chromePath()) {
  console.error('No Chrome found — cannot capture the share image.')
  process.exit(1)
}

const children = []
process.on('exit', () => children.forEach((c) => { try { c.kill() } catch {} }))
children.push(spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort',
], { stdio: 'ignore' }))

const { cdp, close } = await launchChrome({
  port: CDP_PORT,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
process.on('exit', close)

await waitFor(() => fetch(`${ORIGIN}/`).then((r) => r.ok), 'the preview server')

await cdp.send('Runtime.enable')
await cdp.send('Page.enable')
// deviceScaleFactor from OG_IMAGE, so the file matches what the meta tags say.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: OG_IMAGE.logical.width, height: OG_IMAGE.logical.height,
  deviceScaleFactor: OG_IMAGE.scale, mobile: false,
})
await cdp.send('Page.navigate', { url: `${ORIGIN}/?play` })
await cdp.send('Page.bringToFront')   // headless throttles rAF on a background page

await waitFor(() => cdp.eval('!!window.game'), 'the game to start')
await waitFor(() => cdp.eval('window.game.avatar.ready'), 'the robot to load', 160)

// Pose it. The body is placed rather than walked there, the panel is kept from
// opening under the dwell, and the camera is pinned to a framing of the shelf
// instead of following the feet.
await cdp.eval(`(() => {
  const g = window.game
  const p = g.level.byId.get(${JSON.stringify(SHOT.standOn)})
  g.modal.show = () => {}
  g.body = { ...g.body, x: p.left + (p.right - p.left) * 0.35, y: p.top, vx: 0, verticalVelocity: 0, grounded: true, on: p.id }
  const heading = g.level.byId.get(${JSON.stringify(SHOT.wing)})
  g.camera.update = () => {}
  window.scrollTo(0, g.level.origin.top + heading.top - ${SHOT.headroom})
})()`)

// Let the robot settle into its idle pose and the thumbnails decode.
await sleep(2500)

// Strip the interactive chrome and caption the shot. A share card has to say
// whose portfolio it is even as a thumbnail in a LinkedIn feed.
await cdp.eval(`(() => {
  for (const s of ['.controls', '.hud', '.wip', '.touch']) document.querySelector(s)?.remove()

  // The page's own paper and ink, so the card looks like the site it links to.
  const card = document.createElement('div')
  card.style.cssText = [
    // Solid paper under the words, fading out only above them: a thinner fade
    // left the thumbnails in the second row showing through the name.
    'position:fixed', 'inset:auto 0 0 0', 'padding:4.5rem 3rem 2.4rem',
    'background:linear-gradient(to top, rgba(245,243,238,1) 72%, rgba(245,243,238,0) 100%)',
    'font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    'color:#1f1f24', 'z-index:999',
  ].join(';')
  card.innerHTML =
    '<div style="font-size:3.1rem;font-weight:700;letter-spacing:-0.02em;line-height:1.05">' +
      ${JSON.stringify(OWNER.name)} +
    '</div>' +
    '<div style="margin-top:0.45rem;font-size:1.45rem;color:#55555c">' +
      ${JSON.stringify(OWNER.title)} + ' &middot; a portfolio you play through' +
    '</div>'
  document.body.appendChild(card)
})()`)
await sleep(500)

const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY })
writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
console.log(`wrote ${OUT} — ${OG_IMAGE.width}x${OG_IMAGE.height}, the robot on "${SHOT.standOn}"`)

process.exit(0)
