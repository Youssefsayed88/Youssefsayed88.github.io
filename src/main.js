import { preventPinchZoom } from './ui/zoom.js'
import Game from './game/Game.js'

// The page is on screen before this runs: the level is plain markup injected at
// build time, so a visitor is reading the name, the summary and the thumbnails
// while the script is still arriving. This only turns the page into a level.
//
// No loading screen and no front door any more. There is nothing heavy to wait
// for — the physics is a few comparisons a frame, not a WASM engine — and the one
// large download, the robot, arrives after the game is already playable. The
// plain page is still one click away for anyone who wants it, from the corner
// and from the footer.

preventPinchZoom()

const root = document.getElementById('level')

if (root) {
  // `is-playing` hands the scroll position to the camera and reveals the HUD,
  // the robot and the portal. Set before the game is built, so the first
  // measurement is taken of the page as it will be played.
  document.documentElement.classList.add('is-playing')
  try {
    window.game = new Game(root)
  } catch (error) {
    // A game that fails to start must leave a page that still reads.
    console.error('[platformer] failed to start', error)
    document.documentElement.classList.remove('is-playing')
  }
}
