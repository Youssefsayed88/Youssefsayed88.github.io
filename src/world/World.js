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

  kioskFor(projectId) {
    return this.kiosks.find((k) => k.project.id === projectId) ?? null
  }

  // Stand the player at a kiosk as though they had walked to it, for a
  // `?project=` deep link.
  //
  // The trigger point sits TRIGGER_OFFSET along the kiosk's own forward, so
  // facing back at the screen from there — for the player and for the camera
  // orbit alike — is just the kiosk's own `rotationY`. (The camera sits at
  // target + offset(yaw), and the player's forward is the negation of that
  // offset, so the two want the same number rather than opposite ones.)
  //
  // Returns the kiosk so the caller can open its panel, or null for an id that
  // is not in the data — a stale link must land in the corridor, not throw.
  goToProject(projectId, camera) {
    const kiosk = this.kioskFor(projectId)
    if (!kiosk) return null

    this.player.teleport(kiosk.triggerPoint, kiosk.rotationY)
    if (camera) {
      camera.yaw = kiosk.rotationY
      camera.snapTo(this.player.position)
    }

    // Bring the HUD, the room label and the highlight into agreement with where
    // the player now is, rather than waiting a frame for the walk to notice.
    this.updateActiveKiosk()
    this.updateRoomLabel()
    return kiosk
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
