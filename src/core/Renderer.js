import * as THREE from 'three'

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
    this.instance.setClearColor('#1d1f2b')
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
