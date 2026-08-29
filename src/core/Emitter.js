// Minimal event emitter shared by the core systems.
export default class Emitter {
  constructor() { this.callbacks = {} }

  on(name, fn) {
    (this.callbacks[name] ||= []).push(fn)
    return this
  }

  off(name, fn) {
    if (!this.callbacks[name]) return this
    this.callbacks[name] = this.callbacks[name].filter((c) => c !== fn)
    return this
  }

  trigger(name, ...args) {
    for (const fn of this.callbacks[name] || []) fn(...args)
  }
}
