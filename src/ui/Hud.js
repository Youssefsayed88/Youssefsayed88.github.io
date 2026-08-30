// Room label plus the "press E" interaction prompt.
export default class Hud {
  // `onPrompt` mirrors the prompt onto any other surface that has to react to
  // a kiosk coming into range — on touch that is the on-screen Open button,
  // which is the same affordance as the E key and must light up with it.
  constructor(onPrompt) {
    this.onPrompt = onPrompt
    this.roomEl = document.getElementById('room-label')
    this.hintEl = document.getElementById('hint')
    this.promptEl = document.getElementById('prompt')

    this.room = null
    this.promptTitle = null
    this.hintHidden = false
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
      this.promptEl.innerHTML = `<kbd>E</kbd><span>${title}</span>`
      this.promptEl.hidden = false
      // Once they have found a kiosk the movement hint has done its job.
      this.hideHint()
    } else {
      this.promptEl.hidden = true
    }
  }

  hideHint() {
    if (this.hintHidden || !this.hintEl) return
    this.hintHidden = true
    this.hintEl.classList.add('is-hidden')
  }
}
