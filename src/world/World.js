import * as THREE from 'three'
import Level, { WINGS, SPAWN, CORRIDOR } from './Level.js'
import { kioskPlacements } from './layout.js'
import Player from './Player.js'
import ProjectKiosk, { TRIGGER_RADIUS } from './ProjectKiosk.js'
import { byWing } from '../data/projects.js'

export default class World {
  constructor(experience) {
    this.experience = experience
    this.scene = experience.scene
    this.physics = experience.physics
    this.hud = experience.hud

    this.level = new Level(this.scene, this.physics)
    this.player = new Player(
      this.scene,
      this.physics,
      new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z),
    )

    this.kiosks = []
    for (const wing of WINGS) {
      const wingProjects = byWing(wing.id)
      const placements = kioskPlacements(wing, wingProjects.length)
      wingProjects.forEach((project, i) => {
        this.kiosks.push(new ProjectKiosk(this.scene, project, placements[i]))
      })
    }

    this.activeKiosk = null
    this.currentRoom = null
  }

  update(delta, input, camera) {
    this.player.update(delta, input.axis, input.jump, camera.yaw, input.sprint)
    this.updateActiveKiosk()
    this.updateRoomLabel()
  }

  updateActiveKiosk() {
    const p = this.player.position
    let nearest = null
    let nearestDistance = TRIGGER_RADIUS

    for (const kiosk of this.kiosks) {
      const d = kiosk.distanceTo(p)
      if (d < nearestDistance) {
        nearestDistance = d
        nearest = kiosk
      }
    }

    if (nearest !== this.activeKiosk) {
      this.activeKiosk?.setActive(false)
      nearest?.setActive(true)
      this.activeKiosk = nearest
      this.hud?.setPrompt(nearest ? nearest.project.title : null)
      if (nearest) this.experience.audio?.nearKiosk()
    }
  }

  updateRoomLabel() {
    const p = this.player.position
    let room = 'Corridor'

    if (p.z < CORRIDOR.z - CORRIDOR.width / 2) {
      const near = WINGS.reduce((a, w) =>
        Math.abs(w.x - p.x) < Math.abs(a.x - p.x) ? w : a)
      if (Math.abs(near.x - p.x) < 11) room = near.label
    }

    if (room !== this.currentRoom) {
      this.currentRoom = room
      this.hud?.setRoom(room)
    }
  }
}
