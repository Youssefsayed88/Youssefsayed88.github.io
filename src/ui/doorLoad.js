// The Interactive button is the loading bar. Once it is picked, the card fills
// from left to right while the robot is fetched behind the door, and the door
// opens only when both are done: the robot, and a minimum time on the button.
//
// The minimum is deliberate. A cached visit would otherwise flash the bar and
// jump straight in; a moment of the robot "getting ready" sets the scene for a
// game rather than a page.
//
// The bar never runs ahead of the download: it shows the lesser of the time
// spent and the bytes arrived, so a slow connection holds the bar where it is
// instead of sitting at 99%. A download that fails, or never finishes, does
// not keep anyone out: the game is playable without the robot (Avatar.js
// shows the capsule), so after MAX_WAIT the door opens regardless.

export const MIN_DURATION = 2500
const MAX_WAIT = 25000

const MODEL_URL = `${import.meta.env.BASE_URL}models/character.glb`

// What the button says while it fills, in order, spread across MIN_DURATION.
export const LOADING_LINES = [
  'Waking the robot up…',
  'Laying out the platforms…',
  'Almost there…',
]

function webglAvailable() {
  try {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

// Fetches the robot's code and model, so that when the game is built a moment
// later Avatar.js finds both in the cache. Reports 0..1 as bytes arrive.
async function preloadRobot(onProgress) {
  if (!webglAvailable()) return onProgress(1)
  let code = 0
  let model = 0
  const report = () => onProgress(code * 0.35 + model * 0.65)

  const codeDone = import('../robot/Robot.js').then(() => { code = 1; report() })

  const modelDone = (async () => {
    const response = await fetch(MODEL_URL)
    if (!response.ok) throw new Error(`model ${response.status}`)
    const total = Number(response.headers.get('content-length')) || 0
    if (!total || !response.body) {
      await response.arrayBuffer()
    } else {
      const reader = response.body.getReader()
      let received = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        model = Math.min(received / total, 1)
        report()
      }
    }
    model = 1
    report()
  })()

  await Promise.all([codeDone, modelDone])
}

// Runs the load. `onProgress(fraction, line)` is called every frame the button
// should change; resolves once the door may open.
export function loadForDoor(onProgress) {
  const start = performance.now()
  let fetched = 0
  let settled = false

  preloadRobot((f) => { fetched = Math.max(fetched, f) })
    .catch((error) => console.warn('[door] could not preload the robot; the game starts without it', error))
    .finally(() => { fetched = 1; settled = true })

  return new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start
      const time = Math.min(elapsed / MIN_DURATION, 1)
      // Eased, so the bar starts briskly and settles into the finish.
      const eased = 1 - (1 - time) ** 2
      const shown = Math.min(eased, fetched)
      const line = LOADING_LINES[Math.min(Math.floor(time * LOADING_LINES.length), LOADING_LINES.length - 1)]
      onProgress(shown, line)

      if ((time >= 1 && settled) || elapsed >= MAX_WAIT) {
        onProgress(1, line)
        resolve()
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })
}
