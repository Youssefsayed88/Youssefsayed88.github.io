import { placeBubble, BUBBLE_GAP } from '../game/bubble.js'
import ChatSession from '../chat/session.js'
import { renderReply } from '../chat/render.js'
import { GREETING } from '../chat/markup.js'
import { track } from '../core/analytics.js'

// The chatbot on the level: the robot answers in a speech bubble over its
// head, the way it talks about projects, and the visitor types into a bar
// along the bottom of the screen.
//
// Only the latest exchange is in the bubble — the question, small, then the
// reply as it streams in. The conversation behind it is still sent with each
// question (src/chat/session.js), so "tell me more about that one" works.
//
// While the chat is open it owns the robot's voice: Game.js hides the project
// bubble and stops the dwell, so standing on a thumbnail mid-answer does not
// talk over it or throw a panel open.

export default class Chat {
  // `projects` maps id -> title. `onProject(id)` is a "Show me" link in a reply.
  // `onToggle(open)` lets the game hide the touch controls under the bar.
  // `isBlocked()` is true while something covers the level (the project panel).
  constructor(root, { projects, onProject, onToggle, isBlocked = () => false }) {
    this.bubble = root.querySelector('#chat-bubble')
    this.dock = document.getElementById('chat-dock')
    this.button = document.getElementById('chat-open')
    this.enabled = !!(this.bubble && this.dock && ChatSession.available)
    this.isOpen = false
    // The bubble's size and vertical extent, as Bubble.js keeps them.
    this.size = null
    this.box = null
    this.placed = ''
    // The bar's height plus a margin, for the camera to keep the robot's feet
    // above it; measured when the bar changes, never per frame.
    this.reserve = null
    if (!this.enabled) return

    this.projects = projects
    this.onProject = onProject
    this.onToggle = onToggle
    this.parts = {
      asked: this.bubble.querySelector('.chat-bubble__asked'),
      reply: this.bubble.querySelector('.chat-bubble__reply'),
      error: this.bubble.querySelector('.chat-bubble__error'),
      form: this.dock.querySelector('.chat__form'),
      input: this.dock.querySelector('.chat__input'),
      send: this.dock.querySelector('.chat__send'),
      suggestions: this.dock.querySelector('.chat__suggestions'),
    }
    this.session = new ChatSession({ onChange: () => this.render() })

    this.button.addEventListener('click', () => {
      this.button.blur()
      this.toggle('button')
    })
    this.dock.querySelector('.chat__close').addEventListener('click', () => this.close())
    this.parts.form.addEventListener('submit', (event) => {
      event.preventDefault()
      this.ask(this.parts.input.value)
    })
    this.parts.suggestions.addEventListener('click', (event) => {
      const chip = event.target.closest('.chat__suggestion')
      if (chip) this.ask(chip.textContent)
    })
    // Escape closes the chat wherever focus is — but not while a project panel
    // is up, where Escape is the panel's. Capture phase, so this runs before
    // the panel's own handler has closed it and made the check meaningless.
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isOpen && !isBlocked()) this.close()
    }, true)
  }

  toggle(from) {
    this.isOpen ? this.close() : this.open(from)
  }

  open(from = 'key') {
    if (!this.enabled || this.isOpen) return
    this.isOpen = true
    this.dock.hidden = false
    this.bubble.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    document.documentElement.classList.add('is-chatting')
    this.render()
    // A phone's keyboard would cover the level the moment the bar opens; there
    // the visitor taps the field, or a suggestion, when they are ready.
    if (!window.matchMedia?.('(pointer: coarse)').matches) this.parts.input.focus()
    this.onToggle?.(true)
    track('chat-open', { from })
  }

  close() {
    if (!this.isOpen) return
    this.isOpen = false
    this.dock.hidden = true
    this.bubble.hidden = true
    this.box = null
    this.reserve = null
    this.button.setAttribute('aria-expanded', 'false')
    document.documentElement.classList.remove('is-chatting')
    // Focus back to the page, so the next key moves the robot.
    if (this.dock.contains(document.activeElement)) document.activeElement.blur()
    this.onToggle?.(false)
  }

  ask(text) {
    if (!text.trim() || this.session.busy) return
    this.parts.input.value = ''
    this.session.send(text)
  }

  render() {
    if (!this.enabled) return
    const { session, parts } = this
    const exchange = session.messages.length >= 2 ? session.messages.slice(-2) : null
    const reply = exchange?.[1]?.content ?? ''
    const waiting = session.busy && !reply

    parts.asked.hidden = !exchange
    parts.asked.textContent = exchange ? exchange[0].content : ''
    this.bubble.classList.toggle('is-typing', waiting)
    if (exchange) {
      renderReply(parts.reply, reply, {
        projects: this.projects,
        hrefFor: (id) => `?project=${encodeURIComponent(id)}`,
        onProject: (id) => {
          track('chat-project', { project: id })
          this.onProject?.(id)
        },
      })
    } else {
      parts.reply.replaceChildren(Object.assign(document.createElement('p'), { textContent: GREETING }))
    }
    parts.error.hidden = !session.error
    parts.error.textContent = session.error ?? ''
    // A failed question goes back in the field, to try again as it was.
    if (session.failed) {
      if (!parts.input.value) parts.input.value = session.failed
      session.failed = null
    }
    parts.send.disabled = session.busy
    // Suggestions are for a blank start; after the first question they would
    // only crowd the bar.
    parts.suggestions.hidden = session.messages.length > 0 || session.busy

    // Follow the reply as it grows past the bubble's height.
    parts.reply.scrollTop = parts.reply.scrollHeight
    this.measure()
  }

  measure() {
    this.size = { width: this.bubble.offsetWidth, height: this.bubble.offsetHeight }
    this.reserve = this.isOpen ? this.dock.offsetHeight + 24 : null
    this.placed = ''
  }

  // As Bubble.place: over the robot's head, inside the level, every frame.
  //
  // Except where there is no room over its head: at the top of the page, on
  // the name, the camera cannot scroll any higher to show a reply, so the
  // bubble hangs below the robot's feet instead, tail up. `room` is how far the
  // bubble's top may come to the top of the page; `feet` is in level
  // coordinates, like `speaker`; `origin` is the level's top on the page.
  place(speaker, bounds, { feet, origin, room }) {
    if (!this.isOpen || !this.size) return
    const at = placeBubble(speaker, this.size.width, bounds)
    const below = origin + at.bottom - this.size.height < room
    const left = Math.round(at.left)
    const tail = Math.round(at.tail)
    // Its bottom edge above the head, or its top edge below the feet.
    const edge = Math.round(below ? feet + BUBBLE_GAP : at.bottom)
    this.box = below
      ? { top: edge, bottom: edge + this.size.height }
      : { top: edge - this.size.height, bottom: edge }
    const key = `${left},${edge},${tail},${below}`
    if (key === this.placed) return
    this.placed = key
    this.bubble.classList.toggle('is-below', below)
    this.bubble.style.left = `${left}px`
    this.bubble.style.top = `${edge}px`
    this.bubble.style.setProperty('--tail', `${tail}px`)
  }
}
