import * as THREE from 'three'
import { MATERIALS } from './Materials.js'
import { WINGS as WING_DATA } from '../data/projects.js'

const CORRIDOR = { length: 70, width: 9, z: 7 }
const ROOM = { width: 20, depth: 18, height: 6, z: -6 }
const WALL_T = 0.6
const DOOR_W = 4.5
const WING_SPACING = 23

// One room per wing, laid out along the corridor and centred on it.
// Labels come from the project data so there is only ever one list.
export const WINGS = WING_DATA.map((wing, i) => ({
  ...wing,
  x: (i - (WING_DATA.length - 1) / 2) * WING_SPACING,
}))

export default class Level {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.build()
  }

  // One call = one visual mesh + one matching static collider.
  box(position, size, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
    mesh.position.copy(position)
    this.scene.add(mesh)
    this.physics.addStaticBox(position, size)
    return mesh
  }

  floor(position, size, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material)
    mesh.position.copy(position)
    this.scene.add(mesh)
    this.physics.addStaticBox(position, size)
    return mesh
  }

  build() {
    const wall = MATERIALS.wall()
    const floor = MATERIALS.floor()
    const accent = MATERIALS.accent()
    const V = (x, y, z) => new THREE.Vector3(x, y, z)

    // --- Corridor ---
    this.floor(V(0, -0.5, CORRIDOR.z), V(CORRIDOR.length, 1, CORRIDOR.width), floor)
    // South wall (solid) and the two end caps.
    this.box(V(0, 3, CORRIDOR.z + CORRIDOR.width / 2), V(CORRIDOR.length, 6, WALL_T), wall)
    this.box(V(-CORRIDOR.length / 2, 3, CORRIDOR.z), V(WALL_T, 6, CORRIDOR.width), wall)
    this.box(V(CORRIDOR.length / 2, 3, CORRIDOR.z), V(WALL_T, 6, CORRIDOR.width), wall)

    // --- Wings ---
    for (const wing of WINGS) {
      const cx = wing.x
      const northZ = ROOM.z - ROOM.depth / 2
      const southZ = ROOM.z + ROOM.depth / 2

      this.floor(V(cx, -0.5, ROOM.z), V(ROOM.width, 1, ROOM.depth), floor)
      this.box(V(cx, ROOM.height / 2, northZ), V(ROOM.width, ROOM.height, WALL_T), wall)
      this.box(V(cx - ROOM.width / 2, ROOM.height / 2, ROOM.z), V(WALL_T, ROOM.height, ROOM.depth), wall)
      this.box(V(cx + ROOM.width / 2, ROOM.height / 2, ROOM.z), V(WALL_T, ROOM.height, ROOM.depth), wall)

      // South wall, split to leave a doorway onto the corridor.
      const seg = (ROOM.width - DOOR_W) / 2
      const offset = DOOR_W / 2 + seg / 2
      this.box(V(cx - offset, ROOM.height / 2, southZ), V(seg, ROOM.height, WALL_T), wall)
      this.box(V(cx + offset, ROOM.height / 2, southZ), V(seg, ROOM.height, WALL_T), wall)
      // Lintel above the doorway.
      this.box(V(cx, ROOM.height - 0.75, southZ), V(DOOR_W, 1.5, WALL_T), wall)

      // Accent strip on the floor pointing into the room — a wayfinding cue.
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 6), accent)
      strip.position.set(cx, 0.03, southZ - 3.5)
      this.scene.add(strip)
    }
  }
}
