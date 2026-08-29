import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const cache = new Map()

// Projects with no capture yet still need a readable panel rather than a hole.
function placeholderTexture(title) {
  const w = 512
  const h = 320
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#2a2f42'
  ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = '#3d4459'
  ctx.lineWidth = 4
  ctx.setLineDash([14, 10])
  ctx.strokeRect(14, 14, w - 28, h - 28)
  ctx.setLineDash([])

  ctx.fillStyle = '#22c3e6'
  ctx.font = 'bold 40px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Wrap the title across at most three lines.
  const words = title.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > w - 80 && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)

  const shown = lines.slice(0, 3)
  const startY = h / 2 - ((shown.length - 1) * 46) / 2 - 16
  shown.forEach((l, i) => ctx.fillText(l, w / 2, startY + i * 46))

  ctx.fillStyle = '#6b7290'
  ctx.font = '20px Inter, system-ui, sans-serif'
  ctx.fillText('capture pending', w / 2, h - 52)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Resolves to { texture, aspect }. Never rejects — a missing or broken image
// falls back to the placeholder so one bad path cannot blank a room.
export function loadProjectTexture(project) {
  const key = project.image || `placeholder:${project.id}`
  if (cache.has(key)) return cache.get(key)

  const promise = new Promise((resolve) => {
    if (!project.image) {
      const texture = placeholderTexture(project.title)
      resolve({ texture, aspect: 512 / 320, isPlaceholder: true })
      return
    }

    const url = `${import.meta.env.BASE_URL}${project.image}`
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        const { width, height } = texture.image
        resolve({ texture, aspect: width / height, isPlaceholder: false })
      },
      undefined,
      () => {
        console.warn(`[textures] failed to load ${url}, using placeholder`)
        resolve({ texture: placeholderTexture(project.title), aspect: 512 / 320, isPlaceholder: true })
      },
    )
  })

  cache.set(key, promise)
  return promise
}
