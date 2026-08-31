// Everything here is synthesised at runtime. No audio files, no download cost,
// and nothing to re-encode. Browsers block audio until a user gesture, so the
// context is created lazily on the first key press or tap.

const STORAGE_KEY = 'showroom.muted'

export default class Audio {
  constructor() {
    this.ctx = null
    this.master = null
    this.ambient = null
    this.started = false

    let stored = null
    try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* private mode */ }
    this.muted = stored === '1'

    this.button = document.getElementById('mute')
    if (this.button) {
      this.button.addEventListener('click', () => this.toggleMute())
      this.updateButton()
    }
  }

  // Safe to call repeatedly; only the first call inside a gesture does anything.
  start() {
    if (this.started) return
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return

    this.started = true
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.5
    this.master.connect(this.ctx.destination)

    this.buildAmbient()
    this.noiseBuffer = this.makeNoise(0.35)
  }

  // Two slightly detuned oscillators through a low-pass — a room tone, not music.
  buildAmbient() {
    const gain = this.ctx.createGain()
    gain.gain.value = 0.035
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 320

    for (const freq of [55, 55.4, 82.5]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.connect(filter)
      osc.start()
    }

    filter.connect(gain)
    gain.connect(this.master)
    this.ambient = gain
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  // A footfall on hard floor: a low thump for the weight of the step, and a
  // short noise scuff over it for the sole.
  //
  // Loud enough to actually hear, which the first version was not. A narrow
  // bandpass over noise throws away most of what it is given — the old burst
  // rendered at a peak of 0.015, a quarter of a UI beep — and that was
  // survivable only while the steps fired half again too often. Once they were
  // paced to the gait the sound simply vanished. A wider filter and a body
  // under it carry a step at the cadence the legs actually run at.
  footstep() {
    if (!this.ctx || this.muted) return
    const t = this.ctx.currentTime

    // Alternating feet. Two footfalls that are audibly the same sample read as
    // a machine; a few percent of pitch between them reads as a person.
    this.foot = 1 - (this.foot ?? 0)
    const detune = this.foot ? 1.06 : 0.94

    // Body: a short drop, felt more than heard, and the half of this that
    // survives a laptop speaker.
    const thump = this.ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(150 * detune, t)
    thump.frequency.exponentialRampToValueAtTime(58, t + 0.09)
    const thumpGain = this.ctx.createGain()
    thumpGain.gain.setValueAtTime(0.13, t)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
    thump.connect(thumpGain); thumpGain.connect(this.master)
    thump.start(t); thump.stop(t + 0.13)

    // Scuff: the sole itself. Lowpass rather than bandpass — the point is to
    // take the hiss off the top, not to leave a whistle in the middle.
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.playbackRate.value = (0.9 + Math.random() * 0.3) * detune

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = (1500 + Math.random() * 400) * detune
    filter.Q.value = 0.7

    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.19, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)

    src.connect(filter); filter.connect(gain); gain.connect(this.master)
    src.start(t); src.stop(t + 0.15)
  }

  tone(freq, duration = 0.14, type = 'sine', peak = 0.12) {
    if (!this.ctx || this.muted) return
    const osc = this.ctx.createOscillator()
    osc.type = type
    const gain = this.ctx.createGain()
    const t = this.ctx.currentTime

    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

    osc.connect(gain); gain.connect(this.master)
    osc.start(t); osc.stop(t + duration + 0.02)
  }

  nearKiosk() { this.tone(880, 0.12, 'triangle', 0.07) }
  openPanel() { this.tone(523.25, 0.16, 'sine', 0.11); this.tone(784, 0.2, 'sine', 0.06) }
  closePanel() { this.tone(392, 0.14, 'sine', 0.09) }

  toggleMute() {
    this.muted = !this.muted
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02)
    }
    try { localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0') } catch { /* private mode */ }
    this.updateButton()
  }

  updateButton() {
    if (!this.button) return
    this.button.textContent = this.muted ? 'Sound off' : 'Sound on'
    this.button.setAttribute('aria-pressed', String(!this.muted))
  }
}
