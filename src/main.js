import { preventPinchZoom } from './ui/zoom.js'

const canvas = document.querySelector('canvas.webgl')
const loader = document.getElementById('loader')

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

// Before the WebGL check and the dynamic import, so a pinch during the two
// seconds of loading screen is refused too.
preventPinchZoom()

if (!webglAvailable()) {
  // Carry the query string across. A shared `?project=lu-run` has to resolve to
  // that project on the fallback page too — classic.html reads the same
  // parameter — and dropping it here would send exactly the visitor least able
  // to go looking for it to the top of a fourteen-project page instead.
  window.location.replace(`./classic.html${window.location.search}`)
} else {
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
