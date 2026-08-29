import * as THREE from 'three'
import { MATERIALS } from './Materials.js'
import { buildLayout, wayfindingStrips } from './layout.js'

export { WINGS, SPAWN, CORRIDOR, ROOM } from './layout.js'

export default class Level {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.build()
  }

  build() {
    const materials = {
      floor: MATERIALS.floor(),
      wall: MATERIALS.wall(),
    }

    for (const { kind, position, size } of buildLayout()) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        materials[kind],
      )
      mesh.position.set(position.x, position.y, position.z)
      this.scene.add(mesh)
      this.physics.addStaticBox(position, size)
    }

    const accent = MATERIALS.accent()
    for (const { position, size } of wayfindingStrips()) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), accent)
      strip.position.set(position.x, position.y, position.z)
      this.scene.add(strip)
    }
  }
}
