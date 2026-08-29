import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MATERIALS, accentFor } from './Materials.js'
import { buildLayout, decorations, signs } from './layout.js'
import { createSign } from './Sign.js'
import { OWNER } from '../data/projects.js'

export { WINGS, SPAWN, CORRIDOR, ROOM } from './layout.js'

export default class Level {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.build()
  }

  build() {
    // Every box that shares a material is baked into one geometry, so the whole
    // room shell costs a handful of draw calls instead of one per box.
    const buckets = new Map()

    const add = (key, material, { position, size }) => {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z)
      geo.translate(position.x, position.y, position.z)
      if (!buckets.has(key)) buckets.set(key, { material, geometries: [] })
      buckets.get(key).geometries.push(geo)
    }

    // Structure: rendered and collidable.
    for (const item of buildLayout()) {
      add(item.kind, MATERIALS[item.kind](), item)
      if (item.collide !== false) this.physics.addStaticBox(item.position, item.size)
    }

    // Dressing, keyed so each wing's accent gets its own merged bucket.
    for (const item of decorations()) {
      if (item.kind === 'accent') {
        const color = accentFor(item.wingId)
        add(`accent:${color}`, MATERIALS.accent(color), item)
      } else {
        add(item.kind, MATERIALS[item.kind](), item)
      }
    }

    for (const [key, { material, geometries }] of buckets) {
      const merged = mergeGeometries(geometries)
      geometries.forEach((g) => g.dispose())
      const mesh = new THREE.Mesh(merged, material)
      mesh.name = `level:${key}`
      mesh.frustumCulled = false   // one mesh spans the whole floorplan
      this.scene.add(mesh)
    }

    this.drawCallCount = buckets.size

    for (const spec of signs(OWNER.name, OWNER.title)) {
      this.scene.add(createSign(spec))
    }
  }
}
