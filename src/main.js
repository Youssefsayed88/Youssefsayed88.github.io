import { preventPinchZoom } from './ui/zoom.js'
import { PROJECT_PARAM, SHOWROOM_PARAM } from './core/params.js'

const canvas = document.querySelector('canvas.webgl')
const loader = document.getElementById('loader')
const entry = document.getElementById('entry')

// No WebGL? Send them straight to the readable version.
function webglAvailable() {
  try {
    const probe = document.createElement('canvas')
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'))
  } catch {
    return false
  }
}

function fail(message) {
  if (!loader) return
  loader.querySelector('.loader__text').textContent = message
  loader.querySelector('.loader__bar').remove()
}

// The engine is fetched HERE rather than at page load, and that is the point of
// the front door: a visitor who wanted the plain page no longer downloads
// 800 kB of Three.js and 2 MB of Rapier WASM to be shown a button that takes
// them away from it.
//
// `is-showroom` on the body is what tells the stylesheet the game is running.
// It gates the HUD, the corner controls and the rotate-to-landscape panel —
// none of which mean anything on the front door, and the last of which would
// otherwise tell someone to turn a phone they were only being asked a question
// on.
async function startShowroom() {
  entry?.remove()
  document.body.classList.add('is-showroom')
  loader?.removeAttribute('hidden')

  try {
    // Dynamic so the loading screen paints before Three.js and the 2MB Rapier
    // WASM are fetched, instead of after.
    const { default: Experience } = await import('./core/Experience.js')

    window.experience = new Experience(canvas)

    // Hold the loader until a frame has actually been drawn, so it never
    // reveals an empty canvas.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      loader?.classList.add('is-done')
      setTimeout(() => loader?.remove(), 600)
    }))
  } catch (error) {
    console.error('[showroom] failed to start', error)
    fail('Could not start the 3D showroom.')
  }
}

// Before the WebGL check and the dynamic import, so a pinch on the front door
// or during the loading screen is refused too.
preventPinchZoom()

const params = new URLSearchParams(window.location.search)

if (!webglAvailable()) {
  // Carry the query string across. A shared `?project=lu-run` has to resolve to
  // that project on the fallback page too — classic.html reads the same
  // parameter — and dropping it here would send exactly the visitor least able
  // to go looking for it to the top of a fourteen-project page instead.
  //
  // No front door on this path: offering a showroom that cannot run is a worse
  // question than not asking one.
  window.location.replace(`./classic.html${window.location.search}`)
} else if (params.has(PROJECT_PARAM) || params.has(SHOWROOM_PARAM)) {
  // Both parameters ARE the choice, already made. `?project=` names one kiosk
  // inside the showroom, and `?showroom` is what the "Enter the 3D showroom"
  // link on classic.html carries. Asking either of them which portfolio they
  // meant would be asking a question they have just answered.
  startShowroom()
} else {
  document.getElementById('enter-showroom')?.addEventListener('click', startShowroom)
}
