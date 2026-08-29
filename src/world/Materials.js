import * as THREE from 'three'

// Procedural matcaps: a radial gradient baked into a small canvas.
// Keeps the "no lights, no shadows" architecture from day one with zero downloads.
function makeMatcap(highlight, base, shadow) {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  const g = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.55)
  g.addColorStop(0, highlight)
  g.addColorStop(0.45, base)
  g.addColorStop(1, shadow)

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const cache = new Map()

export function matcapMaterial(name, highlight, base, shadow) {
  if (!cache.has(name)) {
    cache.set(name, new THREE.MeshMatcapMaterial({ matcap: makeMatcap(highlight, base, shadow) }))
  }
  return cache.get(name)
}

// Greybox palette — swapped for the real art direction in M4.
export const MATERIALS = {
  floor:  () => matcapMaterial('floor',  '#5a6076', '#3c4155', '#272b3a'),
  wall:   () => matcapMaterial('wall',   '#6d7389', '#4a5064', '#30344a'),
  accent: () => matcapMaterial('accent', '#7fe9ff', '#22c3e6', '#0d6b86'),
  player: () => matcapMaterial('player', '#ffd9a0', '#f5a04b', '#8a4a12'),
}
