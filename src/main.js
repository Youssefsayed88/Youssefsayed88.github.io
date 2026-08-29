import Physics from './physics/Physics.js'
import Experience from './core/Experience.js'

const canvas = document.querySelector('canvas.webgl')

// No WebGL? Send them straight to the readable version.
function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

if (!webglAvailable()) {
  window.location.replace('./classic.html')
} else {
  // Rapier ships as WASM and must finish initialising before any world exists.
  await Physics.init()
  window.experience = new Experience(canvas)
}
