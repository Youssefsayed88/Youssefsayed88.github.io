// A callout by the chat button that says the robot can be asked things.
// Visitors were not finding the chat, or not realising the button was one, so
// a few seconds in the robot offers, once. It goes when it is taken up,
// dismissed, or ignored for a while, and comes back once more later (see
// `again`) unless the chat has been opened by then.
//
// Shared by both pages: the level's corner button (src/ui/Chat.js) and the
// plain page's floating one (src/classic.js). Markup in src/chat/markup.js.

const SHOW_AFTER = 3000
const SHOW_FOR = 14000

export default class ChatNudge {
  // `open(from)` opens the chat. `isOpen()` says whether it is open already, or
  // `blocked()` whether something else covers the page, so the nudge waits.
  constructor(el, { open, isOpen, blocked = () => false }) {
    this.el = el
    this.isOpen = isOpen
    this.blocked = blocked
    this.shown = 0
    this.used = false
    this.timer = null
    if (!el) return

    el.querySelector('.chat-nudge__body').addEventListener('click', () => {
      this.hide()
      open('nudge')
    })
    el.querySelector('.chat-nudge__close').addEventListener('click', () => this.hide(true))
    this.schedule(SHOW_AFTER)
  }

  schedule(delay) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.show(), delay)
  }

  show() {
    if (!this.el || this.used || this.isOpen()) return
    // Not over a project panel: try again shortly.
    if (this.blocked()) return this.schedule(2000)
    this.shown++
    this.el.hidden = false
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.hide(), SHOW_FOR)
  }

  // `dismissed` is the visitor saying no: it is not offered again.
  hide(dismissed = false) {
    if (!this.el) return
    clearTimeout(this.timer)
    this.el.hidden = true
    if (dismissed) this.used = true
  }

  // Once the chat has been opened, by any route, the nudge has done its job.
  chatOpened() {
    this.used = true
    this.hide()
  }

  // A second offer, at a moment the visitor has just finished looking at
  // something (a project panel closing). Only once more.
  again() {
    if (this.shown === 1 && !this.used) this.schedule(1200)
  }
}
