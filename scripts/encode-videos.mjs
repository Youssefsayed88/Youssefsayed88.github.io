// Re-encodes videos-raw/*.mp4 into videos-web/ at web-sane sizes.
//
//   node scripts/encode-videos.mjs
//
// Dimensions are resolved with ffprobe and passed to ffmpeg as literal numbers.
// ffmpeg expressions like scale='min(1280,iw)':-2 are avoided on purpose: the
// comma inside min() is read as a filter separator and the filter graph breaks.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const IN = 'videos-raw'
const OUT = 'videos-web'
const MAX_EDGE = 1280   // longest side; keeps portrait clips portrait
const CRF = 24

const mb = (n) => (n / 1e6).toFixed(1)

function probe(file) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0:s=x',
    file,
  ], { encoding: 'utf8' })
  const [w, h] = (r.stdout || '').trim().split('\n')[0].split('x').map(Number)
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null
}

// Fit inside MAX_EDGE without upscaling; H.264 needs even dimensions.
function targetSize({ w, h }) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const even = (n) => Math.max(2, Math.round(n * scale / 2) * 2)
  return { w: even(w), h: even(h) }
}

fs.mkdirSync(OUT, { recursive: true })

const files = fs.readdirSync(IN).filter((f) => f.endsWith('.mp4')).sort()
let totalIn = 0
let totalOut = 0

for (const name of files) {
  const src = path.join(IN, name)
  const dst = path.join(OUT, name)
  const inSize = fs.statSync(src).size
  totalIn += inSize

  const dims = probe(src)
  if (!dims) {
    console.log(`${name.padEnd(24)} SKIP (could not probe)`)
    continue
  }
  const t = targetSize(dims)

  const base = [
    '-nostdin', '-v', 'error', '-y',
    '-i', src,
    '-vf', `scale=${t.w}:${t.h}`,
    '-c:v', 'libx264', '-crf', String(CRF), '-preset', 'medium',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ]

  // Audio strategies, best first. Every source here is already AAC, so copying
  // is both lossless and faster. The re-encode fallbacks matter only if a source
  // arrives in another codec; note this machine's ffmpeg (2013) still treats its
  // native AAC encoder as experimental, hence the -strict flag.
  const audioAttempts = [
    ['-c:a', 'copy'],
    ['-c:a', 'aac', '-b:a', '128k', '-strict', '-2'],
    ['-c:a', 'libvo_aacenc', '-b:a', '128k'],
  ]

  let r
  let ok = false
  for (const audio of audioAttempts) {
    r = spawnSync('ffmpeg', [...base, ...audio, dst], { encoding: 'utf8' })
    if (r.status === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 0) {
      ok = true
      break
    }
  }

  if (!ok) {
    console.log(`${name.padEnd(24)} FAILED`)
    if (r?.stderr) console.log(`  ${r.stderr.trim().split('\n').slice(0, 3).join('\n  ')}`)
    continue
  }

  let outSize = fs.statSync(dst).size
  // Re-encoding a already-small clip can inflate it; keep the original then.
  if (outSize >= inSize) {
    fs.copyFileSync(src, dst)
    outSize = inSize
    console.log(`${name.padEnd(24)} ${mb(inSize).padStart(6)} MB -> ${mb(outSize).padStart(6)} MB  (kept original, encode was larger)`)
  } else {
    const pct = ((1 - outSize / inSize) * 100).toFixed(0)
    console.log(`${name.padEnd(24)} ${mb(inSize).padStart(6)} MB -> ${mb(outSize).padStart(6)} MB  (-${pct}%)  ${dims.w}x${dims.h} -> ${t.w}x${t.h}`)
  }
  totalOut += outSize
}

console.log(`\ntotal${''.padEnd(19)} ${mb(totalIn).padStart(6)} MB -> ${mb(totalOut).padStart(6)} MB`)
