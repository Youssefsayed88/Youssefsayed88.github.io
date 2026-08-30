import * as THREE from 'three'
import { SURFACES } from './surfaces.js'

// Matcaps are generated per-pixel rather than as a radial gradient: a key light,
// a bounce fill, a rim, and a specular lobe baked into a 128px sphere. That is
// enough to read as lit geometry while the scene itself has no lights and no
// shadow maps at all — the whole reason this runs fast on a phone.

const SIZE = 128

const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const norm = (x, y, z) => {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

const KEY = norm(-0.35, 0.62, 0.70)    // upper-left front
const FILL = norm(0.62, -0.30, 0.50)   // lower-right bounce
const HALF = norm(KEY[0], KEY[1], KEY[2] + 1)  // half-vector against view (0,0,1)

function makeMatcap({ base, rim, spec = '#ffffff', ambient = 0.30, key = 0.72, fill = 0.26, rimPower = 3.6, rimGain = 0.55, shininess = 28, specGain = 0.30 }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(SIZE, SIZE)
  const data = img.data

  const B = hex(base)
  const R = hex(rim)
  const S = hex(spec)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = ((x + 0.5) / SIZE) * 2 - 1
      const ny = -(((y + 0.5) / SIZE) * 2 - 1)
      const r2 = nx * nx + ny * ny
      const i = (y * SIZE + x) * 4

      // Outside the sphere, hold the rim colour so filtering cannot bleed
      // background into the silhouette.
      if (r2 >= 1) {
        data[i] = R[0]; data[i + 1] = R[1]; data[i + 2] = R[2]; data[i + 3] = 255
        continue
      }

      const nz = Math.sqrt(1 - r2)
      const d1 = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2])
      const d2 = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2])
      const rimF = Math.pow(1 - nz, rimPower) * rimGain
      const specF = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), shininess) * specGain

      const lit = ambient + d1 * key + d2 * fill

      data[i]     = Math.min(255, B[0] * lit + R[0] * rimF + S[0] * specF)
      data[i + 1] = Math.min(255, B[1] * lit + R[1] * rimF + S[1] * specF)
      data[i + 2] = Math.min(255, B[2] * lit + R[2] * rimF + S[2] * specF)
      data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const BACKGROUND = '#1a1f2e'

// Each wing gets its own hue. Used for the doorway sign, the floor strip
// leading in, and the kiosk highlight — so colour does the wayfinding.
export const WING_ACCENTS = {
  games: '#22c3e6',   // cyan
  xr: '#a78bfa',      // violet
  lab: '#fbbf24',     // amber
}
export const DEFAULT_ACCENT = '#22c3e6'

// Ambient carries most of the load here. These were first tuned blind and came
// out near-black on screen; the values below are set from an actual render.
const SPECS = {
  floor:   { base: '#4a5372', rim: '#69739a', ambient: 0.58, key: 0.50, shininess: 40, specGain: 0.18 },
  wall:    { base: '#5a6486', rim: '#818cb4', ambient: 0.56, key: 0.58 },
  trim:    { base: '#8d97ba', rim: '#b6bfda', ambient: 0.55, key: 0.60, specGain: 0.34 },
  // Only a little lighter than the floor — enough to read as a platform.
  dais:    { base: '#565f80', rim: '#767fa4', ambient: 0.56, key: 0.48, specGain: 0.12 },
  player:  { base: '#f0913c', rim: '#ffd9a0', ambient: 0.46, key: 0.70, rimGain: 0.7, specGain: 0.45 },
}

const cache = new Map()

// `surface` names an entry in SURFACES: its albedo multiplies the matcap and
// its normal map perturbs the normal the matcap is sampled with, which is what
// turns a flat tinted plane into tiles and panels. `normalScale` is how deep
// those joints read — the floor is seen at a glancing angle from a top-down
// camera and needs more than the walls to survive it.
function material(name, spec, { surface, normalScale = 1 } = {}) {
  if (!cache.has(name)) {
    const options = { matcap: makeMatcap(spec) }
    if (surface) {
      const { map, normalMap } = SURFACES[surface]()
      options.map = map
      options.normalMap = normalMap
      options.normalScale = new THREE.Vector2(normalScale, normalScale)
    }
    cache.set(name, new THREE.MeshMatcapMaterial(options))
  }
  return cache.get(name)
}

// Matcap material from an arbitrary base colour, for meshes that arrive with a
// palette of their own — the character GLB is shaded this way so it sits in the
// same lightless world as the level instead of needing lights nothing else has.
export function matcapMaterial(name, spec) {
  return material(name, spec)
}

export const MATERIALS = {
  floor: () => material('floor', SPECS.floor, { surface: 'floor', normalScale: 1.15 }),
  wall: () => material('wall', SPECS.wall, { surface: 'wall', normalScale: 0.85 }),
  trim: () => material('trim', SPECS.trim),
  dais: () => material('dais', SPECS.dais, { surface: 'dais', normalScale: 0.7 }),
  player: () => material('player', SPECS.player),

  // Bright, self-lit look for accents and light fixtures.
  accent: (color = DEFAULT_ACCENT) =>
    material(`accent:${color}`, {
      base: color, rim: '#ffffff',
      ambient: 0.72, key: 0.36, fill: 0.12, rimGain: 0.5, specGain: 0.4,
    }),

  light: () => material('light', {
    base: '#e8eeff', rim: '#ffffff',
    ambient: 0.92, key: 0.12, fill: 0.05, rimGain: 0.25, specGain: 0.1,
  }),
}

export const accentFor = (wingId) => WING_ACCENTS[wingId] ?? DEFAULT_ACCENT
