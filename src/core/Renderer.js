import * as THREE from 'three'
import { BACKGROUND } from '../world/Materials.js'
import { setAnisotropy } from '../world/surfaces.js'

export default class Renderer {
  constructor(experience) {
    this.experience = experience
    this.sizes = experience.sizes
    this.scene = experience.scene
    this.camera = experience.camera

    this.instance = new THREE.WebGLRenderer({
      canvas: experience.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    // No shadow maps anywhere: the whole art direction is matcap-based.
    this.instance.shadowMap.enabled = false
    this.instance.setClearColor(BACKGROUND)

    // Surface maps are built lazily by World, which is constructed after this,
    // so they can still pick up the device's real filtering limit. A tiled
    // floor at the camera's ~54-degree pitch is exactly what anisotropy is for.
    setAnisotropy(this.instance.capabilities.getMaxAnisotropy())

    this.resize()
  }

  resize() {
    this.instance.setSize(this.sizes.width, this.sizes.height)
    this.instance.setPixelRatio(this.sizes.pixelRatio)
  }

  update() {
    this.instance.render(this.scene, this.camera.instance)
  }
}
