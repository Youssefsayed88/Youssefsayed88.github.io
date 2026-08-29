import * as THREE from 'three'
import { accentFor } from './Materials.js'

// Canvas-text panels for wayfinding. Cheaper and sharper than 3D text, and the
// only place in the scene that needs readable type.
export function createSign({ lines, wingId, width, height, position, rotationY }) {
  const px = 512
  const py = Math.round((px * height) / width)

  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = py
  const ctx = canvas.getContext('2d')

  const accent = accentFor(wingId)

  ctx.fillStyle = '#1a1e2e'
  ctx.fillRect(0, 0, px, py)

  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(3, py * 0.045)
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, px - ctx.lineWidth, py - ctx.lineWidth)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (lines.length === 1) {
    ctx.fillStyle = accent
    ctx.font = `600 ${Math.round(py * 0.42)}px Inter, system-ui, sans-serif`
    ctx.letterSpacing = `${Math.round(py * 0.05)}px`
    ctx.fillText(lines[0].toUpperCase(), px / 2, py / 2 + py * 0.02)
  } else {
    ctx.fillStyle = '#f2f4f8'
    ctx.font = `700 ${Math.round(py * 0.3)}px Inter, system-ui, sans-serif`
    ctx.fillText(lines[0], px / 2, py * 0.4)

    ctx.fillStyle = accent
    ctx.font = `500 ${Math.round(py * 0.14)}px Inter, system-ui, sans-serif`
    ctx.letterSpacing = `${Math.round(py * 0.03)}px`
    ctx.fillText(lines[1].toUpperCase(), px / 2, py * 0.68)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  )
  mesh.position.set(position.x, position.y, position.z)
  mesh.rotation.y = rotationY
  return mesh
}
