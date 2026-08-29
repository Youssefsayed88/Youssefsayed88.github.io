import * as THREE from 'three'
import { MATERIALS, accentFor } from './Materials.js'
import { loadProjectTexture } from './textures.js'
import { triggerPointFor, TRIGGER_RADIUS } from './layout.js'

const PLINTH = { w: 2.2, h: 1.0, d: 0.7 }
const FRAME = { w: 2.6, h: 1.7, d: 0.18 }
const PANEL_Y = 1.75
const SCREEN_MAX = { w: 2.3, h: 1.45 }

// Panels lean back to face the top-down camera. Left vertical they would be
// heavily foreshortened from a ~54-degree view, which is the one thing these
// kiosks exist to avoid.
const PANEL_TILT = -0.42   // radians; negative tips the face upward

export { TRIGGER_RADIUS }

export default class ProjectKiosk {
  constructor(scene, project, placement) {
    this.project = project
    this.active = false

    this.group = new THREE.Group()
    this.group.position.set(placement.position.x, placement.position.y, placement.position.z)
    this.group.rotation.y = placement.rotationY
    scene.add(this.group)

    const wall = MATERIALS.wall()
    const accent = MATERIALS.accent(accentFor(project.wing))

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(PLINTH.w, PLINTH.h, PLINTH.d), wall)
    plinth.position.y = PLINTH.h / 2
    this.group.add(plinth)

    // Frame and screen share a tilted pivot so they stay coplanar.
    this.panel = new THREE.Group()
    this.panel.position.set(0, PANEL_Y, 0)
    this.panel.rotation.x = PANEL_TILT
    this.group.add(this.panel)

    const frame = new THREE.Mesh(new THREE.BoxGeometry(FRAME.w, FRAME.h, FRAME.d), wall)
    this.panel.add(frame)

    // Screen starts at the max size and is reshaped once the texture's aspect
    // is known, so a portrait capture is not stretched into a landscape frame.
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_MAX.w, SCREEN_MAX.h),
      new THREE.MeshBasicMaterial({ color: '#1d1f2b' }),
    )
    this.screen.position.set(0, 0, FRAME.d / 2 + 0.02)
    this.panel.add(this.screen)

    // Lights up when the player is in range.
    this.highlight = new THREE.Mesh(new THREE.BoxGeometry(PLINTH.w * 0.8, 0.07, 0.07), accent)
    this.highlight.position.set(0, PLINTH.h + 0.06, PLINTH.d / 2 - 0.05)
    this.highlight.visible = false
    this.group.add(this.highlight)

    // World-space point the player has to reach; kept flat on the floor plane.
    const t = triggerPointFor(placement)
    this.triggerPoint = new THREE.Vector3(t.x, t.y, t.z)

    loadProjectTexture(project).then(({ texture, aspect }) => {
      this.screen.material.dispose()
      this.screen.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })

      // Fit inside the frame without distortion.
      let w = SCREEN_MAX.w
      let h = w / aspect
      if (h > SCREEN_MAX.h) {
        h = SCREEN_MAX.h
        w = h * aspect
      }
      this.screen.geometry.dispose()
      this.screen.geometry = new THREE.PlaneGeometry(w, h)
    })
  }

  distanceTo(position) {
    return this.triggerPoint.distanceTo(position)
  }

  setActive(active) {
    if (active === this.active) return
    this.active = active
    this.highlight.visible = active
  }
}
