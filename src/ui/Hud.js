// The section label and the movement hint.
export default class Hud {
  constructor() {
    this.roomEl = document.getElementById('room-label')
    this.hintEl = document.getElementById('hint')
    this.room = null
    this.hintHidden = false
  }

  setRoom(label) {
    if (label === this.room) return
    this.room = label
    if (this.roomEl) this.roomEl.textContent = label
  }

  // Once they have moved, the hint has done its job.
  hideHint() {
    if (this.hintHidden || !this.hintEl) return
    this.hintHidden = true
    this.hintEl.classList.add('is-hidden')
  }
}
