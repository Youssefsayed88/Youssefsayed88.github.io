import * as THREE from 'three'
import Level, { WINGS } from './Level.js'
import Player from './Player.js'

export default class World {
  constructor(experience) {
    this.experience = experience
    this.scene = experience.scene
    this.physics = experience.physics

    this.level = new Level(this.scene, this.physics)
    this.player = new Player(this.scene, this.physics)

    this.roomLabel = document.getElementById('room-label')
    this.currentRoom = null
  }

  update(delta, input, camera) {
    this.player.update(delta, input.axis, input.jump, camera.yaw)
    this.updateRoomLabel()
  }

  // Cheap proximity check — replaced by real trigger volumes in M2.
  updateRoomLabel() {
    const p = this.player.position
    let room = 'Lobby'
    if (p.z < 2) {
      const near = WINGS.reduce((a, w) =>
        Math.abs(w.x - p.x) < Math.abs(a.x - p.x) ? w : a)
      if (Math.abs(near.x - p.x) < 11) room = near.label
    }
    if (room !== this.currentRoom) {
      this.currentRoom = room
      if (this.roomLabel) this.roomLabel.textContent = room
    }
  }
}
