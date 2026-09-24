import { preventPinchZoom } from './ui/zoom.js'
import { initThemeToggle } from './ui/theme.js'
import { fadeInThumbnails } from './ui/loading.js'
import { loadForDoor } from './ui/doorLoad.js'
import { track } from './core/analytics.js'
import Game from './game/Game.js'
// The chat's shared styles; the level's own are in style.css.
import './chat/chat.css'

// The page is on screen before this runs: the level is plain markup injected at
// build time, so it reads before any script arrives. This only turns the page
// into a level.
//
// Unless the link already chose, a front door asks first which portfolio the
// visitor wants (see doorMarkup in src/level/markup.js). The game is built only
// once they pick the interactive one, so someone who wanted the plain page never
// downloads the robot to be shown a button that takes them away from it. No
// On that choice the Interactive button becomes the loading bar: it fills while
// the robot is fetched behind the door, for at least a few seconds (see
// src/ui/doorLoad.js), and the game is built once it is full, so the robot
// drops in as the door fades.

// How long the door takes to fade off the level once a choice is made.
const DOOR_FADE = 300

preventPinchZoom()
initThemeToggle(document.getElementById('theme'))

const html = document.documentElement
const root = document.getElementById('level')
const rail = document.getElementById('rail')

function startGame() {
  // `is-playing` hands the scroll position to the camera and reveals the HUD,
  // the robot and the portal. Set before the game is built, so the first
  // measurement is taken of the page as it will be played.
  html.classList.add('is-playing')
  try {
    window.game = new Game(root)
  } catch (error) {
    // A game that fails to start must leave a page that still reads.
    console.error('[platformer] failed to start', error)
    html.classList.remove('is-playing')
  }
}

if (root) {
  // Presentation only, so it runs whether or not the game starts.
  fadeInThumbnails(root)

  const door = document.getElementById('door')
  if (door && html.classList.contains('has-door')) {
    // Behind the door, the level cannot be tabbed into or read out.
    root.inert = true
    if (rail) rail.inert = true
    const play = document.getElementById('door-play')
    const status = play.querySelector('.door__status')
    const percent = play.querySelector('.door__percent')
    play.addEventListener('click', async () => {
      // The basic choice is a link, counted by its markup; see doorMarkup.
      track('choose-portfolio', { route: 'interactive' })
      play.classList.add('is-loading')
      play.setAttribute('aria-busy', 'true')
      door.classList.add('is-loading')
      await loadForDoor((fraction, line) => {
        play.style.setProperty('--progress', fraction.toFixed(4))
        percent.textContent = `${Math.round(fraction * 100)}%`
        if (status.textContent !== line) status.textContent = line
      })
      play.removeAttribute('aria-busy')

      root.inert = false
      if (rail) rail.inert = false
      // The robot drops in behind the door as it fades.
      startGame()
      door.classList.add('is-leaving')
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      setTimeout(() => {
        html.classList.remove('has-door')
        door.remove()
      }, reduced ? 0 : DOOR_FADE)
    }, { once: true })
  } else {
    door?.remove()
    startGame()
  }
}
