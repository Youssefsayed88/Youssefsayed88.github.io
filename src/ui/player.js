// The project video player. Plyr, loaded only when a panel with a video opens.
//
// Imported dynamically by Modal.js, so its script and stylesheet cost nothing
// to the visitor who never presses play — which is most of them.
import Plyr from 'plyr'
import 'plyr/dist/plyr.css'
// Self-hosted. Plyr's default fetches this sprite from cdn.plyr.io, which is a
// third-party request on every panel and a player with no icons whenever that
// host is slow or blocked.
//
// By file path rather than package name: plyr's `exports` map publishes its CSS
// but not the sprite, so `plyr/dist/plyr.svg` refuses to resolve. The path still
// follows whichever version is installed.
import sprite from '../../node_modules/plyr/dist/plyr.svg?url'

const OPTIONS = {
  iconUrl: sprite,
  // Plyr swaps this in as the source when it is destroyed, to cancel the
  // download of the real one. The default is another file on its CDN; an empty
  // data URL cancels the same download without a request to anyone.
  blankVideo: 'data:,',
  controls: [
    'play-large', 'play', 'progress', 'current-time', 'duration',
    'mute', 'volume', 'settings', 'pip', 'fullscreen',
  ],
  settings: ['speed'],
  speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
  // Shortcuts only while the player has focus. The page behind it is a game
  // with its own claim on Space and the arrows.
  keyboard: { focused: true, global: false },
  tooltips: { controls: true, seek: true },
  invertTime: false,
  fullscreen: { enabled: true, fallback: true, iosNative: true },
}

export function createPlayer(video) {
  return new Plyr(video, OPTIONS)
}
