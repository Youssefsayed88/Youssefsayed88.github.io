// Re-encodes a source screenshot into a web-sized WebP under public/images/.
//
//   node scripts/encode-images.mjs <source> <public/images/name.webp> [maxWidth]
//
// Why Chrome rather than a library: this project has no image dependency and
// does not want one for a job that runs twice a year, and the ffmpeg on this
// machine is from 2013 with no libwebp in its build. Chrome is already a
// dependency of `npm run verify`, and canvas.toDataURL('image/webp') is the
// same encoder that produced every other .webp on the site. So the browser is
// borrowed as an image encoder.
//
// The bytes are passed INTO the page as a data: URL rather than loaded from
// disk: a file:// page cannot fetch a sibling file without --allow-file-access,
// and handing Chrome that flag to convert a screenshot is not a trade worth
// making.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { launchChrome } from './lib/chrome.mjs'

const [source, destination, widthArg] = process.argv.slice(2)

if (!source || !destination) {
  console.error('usage: node scripts/encode-images.mjs <source> <dest.webp> [maxWidth]')
  process.exit(1)
}
if (!existsSync(source)) {
  console.error(`no such file: ${source}`)
  process.exit(1)
}

// Wide enough for the kiosk screen at the closest the trigger radius allows,
// and for a 2x display of the 480px card on classic.html. Anything more is
// bytes nobody can see.
const MAX_WIDTH = Number(widthArg) || 1280
const QUALITY = 0.82

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
}

const bytes = readFileSync(source)
const mime = MIME[extname(source).toLowerCase()]
if (!mime) {
  console.error(`unsupported source type: ${extname(source)}`)
  process.exit(1)
}

const launched = await launchChrome({ port: 9225 })
if (!launched) {
  console.error('No Chrome found — cannot encode.')
  process.exit(1)
}
const { cdp, close } = launched
await cdp.send('Runtime.enable')

const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`

// Downscale in ONE step with the browser's own filtering rather than a manual
// pyramid: Chrome's drawImage is already box-filtered for downscales, and a
// hand-rolled halving loop would only add banding to a photographic source.
const encoded = await cdp.eval(`(async () => {
  const img = new Image()
  img.src = ${JSON.stringify(dataUrl)}
  await img.decode()

  const scale = Math.min(1, ${MAX_WIDTH} / img.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)

  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  return {
    width: canvas.width,
    height: canvas.height,
    sourceWidth: img.naturalWidth,
    sourceHeight: img.naturalHeight,
    url: canvas.toDataURL('image/webp', ${QUALITY}),
  }
})()`)

close()

if (!encoded.url.startsWith('data:image/webp')) {
  console.error('Chrome did not produce WebP — refusing to write a mislabelled file.')
  process.exit(1)
}

const out = Buffer.from(encoded.url.split(',')[1], 'base64')
writeFileSync(destination, out)

const pct = ((1 - out.length / bytes.length) * 100).toFixed(0)
console.log(`${basename(source)} -> ${destination}`)
console.log(`  ${encoded.sourceWidth}x${encoded.sourceHeight} -> ${encoded.width}x${encoded.height}`)
console.log(`  ${(bytes.length / 1024).toFixed(0)} kB -> ${(out.length / 1024).toFixed(0)} kB (-${pct}%)`)
