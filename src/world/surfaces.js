import * as THREE from 'three'

// Procedural surface detail for the level.
//
// The scene has no lights and no shadow maps — everything is matcap. A matcap
// gives a surface its *shading* but no *detail*: a 104-metre corridor floor
// reads as one unbroken sheet of plastic no matter how well the matcap is
// tuned. These maps add the detail through the two channels
// MeshMatcapMaterial actually supports:
//
//   map        multiplies the matcap colour   -> grout, panel joints, mottle
//   normalMap  perturbs the normal it samples -> those joints catch the key
//              light and the rim, so they read as recesses, not as decals
//
// Both come off ONE height field per surface, so the groove visible in the
// albedo is exactly the groove the normal map lights. Nothing is downloaded and
// nothing is authored by hand: the whole art pass is canvas that never touches
// the network, which is the same reason the matcaps are generated rather than
// shipped.

// World metres covered by one repeat of every map below. Level.js and
// ProjectKiosk.js project their UVs in these units, so a wall panel is the same
// size whether it lands on a 20-metre room wall or a 2-metre kiosk plinth.
export const TEXTURE_SCALE = 4

// Set from the renderer's real capability once it exists. A tiled floor seen at
// the camera's ~54-degree pitch is the textbook case for anisotropic filtering:
// without it the tile joints turn to mush about six metres out.
let anisotropy = 4
export function setAnisotropy(max) {
  anisotropy = Math.min(8, Math.max(1, max | 0))
}

// --- tileable value noise -------------------------------------------------
// `period` is the wrap length in cells. Keep it a power of two so every octave
// still lands on an integer lattice and the map tiles seamlessly.

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const lerp = (a, b, t) => a + (b - a) * t
const wrap = (v, n) => ((v % n) + n) % n
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function valueNoise(x, y, period, seed) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = smoothstep(0, 1, x - xi)
  const v = smoothstep(0, 1, y - yi)
  const n = (i, j) => hash2(wrap(i, period), wrap(j, period), seed)
  return lerp(
    lerp(n(xi, yi), n(xi + 1, yi), u),
    lerp(n(xi, yi + 1), n(xi + 1, yi + 1), u),
    v,
  )
}

function fbm(x, y, period, seed, octaves = 3) {
  let sum = 0
  let total = 0
  let amplitude = 0.5
  let frequency = 1
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * frequency, y * frequency, period * frequency, seed + o * 17) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / total
}

// --- height field -> { map, normalMap } -----------------------------------

// `sample(x, y)` returns { h, t }: h is height in 0..1, t is the albedo
// multiplier. Greyscale on purpose — these maps MULTIPLY a matcap that already
// carries the palette, so tinting here would fight Materials.js for the colour.
function buildSurface(size, sample, { strength = 2.4 } = {}) {
  const height = new Float32Array(size * size)
  const tint = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = sample(x, y)
      height[y * size + x] = s.h
      tint[y * size + x] = s.t
    }
  }

  const albedo = document.createElement('canvas')
  albedo.width = albedo.height = size
  const albedoCtx = albedo.getContext('2d')
  const albedoData = albedoCtx.createImageData(size, size)

  const normal = document.createElement('canvas')
  normal.width = normal.height = size
  const normalCtx = normal.getContext('2d')
  const normalData = normalCtx.createImageData(size, size)

  const at = (x, y) => height[wrap(y, size) * size + wrap(x, size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const v = Math.round(Math.min(1, Math.max(0, tint[y * size + x])) * 255)
      albedoData.data[i] = v
      albedoData.data[i + 1] = v
      albedoData.data[i + 2] = v
      albedoData.data[i + 3] = 255

      // Central differences, sampled with wraparound so the normal map tiles
      // as seamlessly as the albedo it was derived from.
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      normalData.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255)
      normalData.data[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255)
      normalData.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255)
      normalData.data[i + 3] = 255
    }
  }

  albedoCtx.putImageData(albedoData, 0, 0)
  normalCtx.putImageData(normalData, 0, 0)

  const finish = (canvas, colorSpace) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = colorSpace
    texture.anisotropy = anisotropy
    return texture
  }

  return {
    map: finish(albedo, THREE.SRGBColorSpace),
    normalMap: finish(normal, THREE.NoColorSpace),
  }
}

// --- the surfaces ---------------------------------------------------------

// A joint is a valley in the height field rather than a hard line, so the
// normal map has two slopes to catch rather than one discontinuity.
function joint(distance, halfWidth, feather) {
  return 1 - smoothstep(halfWidth, halfWidth + feather, distance)
}

// Floor: one-metre tiles with a recessed joint, each tile very slightly off its
// neighbour in value, over a slow mottle that keeps a 104-metre corridor from
// banding. 512px across TEXTURE_SCALE metres is 128px per tile.
function floorSample(size) {
  const tile = size / TEXTURE_SCALE
  return (x, y) => {
    const gx = Math.floor(x / tile)
    const gy = Math.floor(y / tile)
    const edge = Math.min(
      x - gx * tile, tile - 1 - (x - gx * tile),
      y - gy * tile, tile - 1 - (y - gy * tile),
    )

    const groove = joint(edge, 1.4, 2.6)
    const perTile = (hash2(gx, gy, 7) - 0.5) * 0.075
    const grain = fbm(x / 5, y / 5, 128, 3) - 0.5
    const mottle = fbm(x / 90, y / 90, 8, 11) - 0.5

    return {
      h: 1 - groove * 0.85 + grain * 0.05,
      t: 1 - groove * 0.34 + perTile + mottle * 0.13 + grain * 0.05,
    }
  }
}

// Wall: one-metre vertical panels with a reveal between them, a horizontal
// break at two-metre courses, and a faint vertical brushing. From a top-down
// camera the walls are read mostly as edges, so it is the horizontal course
// that actually gives them their scale.
function wallSample(size) {
  const panel = size / TEXTURE_SCALE
  const course = size / 2
  return (x, y) => {
    const lx = x - Math.floor(x / panel) * panel
    const ly = y - Math.floor(y / course) * course
    const seam = Math.max(
      joint(Math.min(lx, panel - 1 - lx), 1.2, 2.2),
      joint(Math.min(ly, course - 1 - ly), 1.6, 3.0),
    )

    const brush = fbm(x / 2.2, y / 34, 128, 23) - 0.5
    const patch = fbm(x / 70, y / 70, 8, 31) - 0.5

    return {
      h: 1 - seam * 0.9 + brush * 0.06,
      t: 1 - seam * 0.3 + brush * 0.055 + patch * 0.1,
    }
  }
}

// Dais: a finer half-metre grid, so the platform reads as a different material
// from the floor it sits on rather than the same tile at the same pitch.
function daisSample(size) {
  const tile = size / (TEXTURE_SCALE * 2)
  return (x, y) => {
    const gx = Math.floor(x / tile)
    const gy = Math.floor(y / tile)
    const edge = Math.min(
      x - gx * tile, tile - 1 - (x - gx * tile),
      y - gy * tile, tile - 1 - (y - gy * tile),
    )

    const groove = joint(edge, 0.9, 1.8)
    const perTile = (hash2(gx, gy, 53) - 0.5) * 0.05
    const grain = fbm(x / 4, y / 4, 64, 41) - 0.5

    return {
      h: 1 - groove * 0.8 + grain * 0.06,
      t: 1 - groove * 0.26 + perTile + grain * 0.05,
    }
  }
}

// --- UV projection --------------------------------------------------------

// Re-project a box's UVs by its dominant face normal, in whatever space its
// positions are currently in.
//
// BoxGeometry ships 0..1 UVs per face, which means one texture repeat is
// stretched across the whole face — a 104-metre corridor floor and a 0.7-metre
// kiosk plinth would each get exactly one tile. Projecting instead by
// TEXTURE_SCALE metres gives every surface in the level the same tile size, and
// because Level.js calls this AFTER `geo.translate()`, the projection is in
// world space: tiles line up across the seams of the merged mesh rather than
// restarting at every box.
export function projectUVs(geometry, scale = TEXTURE_SCALE) {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const uv = geometry.attributes.uv
  if (!position || !normal || !uv) return geometry

  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const nz = Math.abs(normal.getZ(i))
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)

    // Top and bottom faces read x/z; the side faces keep y as the vertical
    // axis so a wall panel's course stays horizontal.
    if (ny >= nx && ny >= nz) uv.setXY(i, x / scale, z / scale)
    else if (nx >= nz) uv.setXY(i, z / scale, y / scale)
    else uv.setXY(i, x / scale, y / scale)
  }

  uv.needsUpdate = true
  return geometry
}

// Built on first use and shared by every mesh that wants them.
const cache = new Map()
function surface(name, build) {
  if (!cache.has(name)) cache.set(name, build())
  return cache.get(name)
}

export const SURFACES = {
  floor: () => surface('floor', () => buildSurface(512, floorSample(512), { strength: 2.6 })),
  wall: () => surface('wall', () => buildSurface(512, wallSample(512), { strength: 2.2 })),
  dais: () => surface('dais', () => buildSurface(256, daisSample(256), { strength: 1.8 })),
}
