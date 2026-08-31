// Room label plus the kiosk prompt.
//
// The prompt is a real <button>, not a caption. "Press E" is a fine reminder
// once you know there is something to press, but it is the only instruction in
// the whole showroom that cannot be obeyed with the mouse the visitor already
// has their hand on — and the first thing anyone does with a glowing pill that
// names a project is click it. So the pill IS the control; the keycap on it
// demotes to what it always should have been, a shortcut hint.
export default class Hud {
  // `onPrompt` mirrors the prompt onto any other surface that has to react to
  // a kiosk coming into range — on touch that is the on-screen Open button,
  // which is the same affordance and must light up with it.
  // `onActivate` fires when the prompt itself is clicked or keyed.
  constructor({ onPrompt, onActivate } = {}) {
    this.onPrompt = onPrompt
    this.onActivate = onActivate
    this.roomEl = document.getElementById('room-label')
    this.hintEl = document.getElementById('hint')
    this.promptEl = document.getElementById('prompt')

    this.room = null
    this.promptTitle = null
    this.hintHidden = false

    this.promptEl?.addEventListener('click', (event) => {
      event.preventDefault()
      // Hand focus straight back to the game. A focused button eats the very
      // next Space as a re-activation instead of a jump, and would take Enter
      // as a second interact on top of the one Input already emits for it.
      this.promptEl.blur()
      this.onActivate?.()
    })
  }

  setRoom(label) {
    if (label === this.room) return
    this.room = label
    if (this.roomEl) this.roomEl.textContent = label
  }

  setPrompt(title) {
    if (title === this.promptTitle) return
    this.promptTitle = title
    this.onPrompt?.(title)

    if (!this.promptEl) return
    if (title) {
      this.promptEl.innerHTML =
        `<span class="hud__prompt-verb">Open</span><span class="hud__prompt-name"></span><kbd>E</kbd>`
      // textContent, not interpolation: project titles are data, and a title
      // with an ampersand or angle bracket in it should read as one.
      this.promptEl.querySelector('.hud__prompt-name').textContent = title
      this.promptEl.setAttribute('aria-label', `Open ${title}`)
      this.promptEl.hidden = false
      // Once they have found a kiosk the movement hint has done its job.
      this.hideHint()
    } else {
      this.promptEl.hidden = true
      // Blur on the way out too: walking away from a kiosk while the button
      // still holds focus would leave Space bound to a hidden control.
      if (document.activeElement === this.promptEl) this.promptEl.blur()
    }
  }

  hideHint() {
    if (this.hintHidden || !this.hintEl) return
    this.hintHidden = true
    this.hintEl.classList.add('is-hidden')
  }
}
