// Downloads the project videos still pointing at the original owner's Drive.
// Reads straight from src/data/projects.js, so the list never drifts.
//
//   node scripts/fetch-videos.mjs --list     # show what would be fetched
//   node scripts/fetch-videos.mjs            # download into ./videos-raw/
//
// The files are link-shared, so no auth is needed. After downloading, re-encode
// and upload to an account you control, then set `video` on each project.

import fs from 'node:fs'
import path from 'node:path'
import { pendingVideos } from '../src/data/projects.js'

const OUT = 'videos-raw'
const listOnly = process.argv.includes('--list')

const url = (id) => `https://drive.google.com/uc?export=download&id=${id}`

if (listOnly) {
  console.log(`${pendingVideos.length} videos pending re-host:\n`)
  for (const v of pendingVideos) console.log(`  ${v.title.padEnd(34)} ${url(v.fileId)}`)
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })

for (const v of pendingVideos) {
  const dest = path.join(OUT, `${v.id}.mp4`)
  if (fs.existsSync(dest)) {
    console.log(`skip  ${v.title} (already downloaded)`)
    continue
  }

  process.stdout.write(`get   ${v.title} ... `)
  const res = await fetch(url(v.fileId), { redirect: 'follow' })

  if (!res.ok) {
    console.log(`FAILED (HTTP ${res.status})`)
    continue
  }
  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('video/')) {
    // Drive serves an HTML interstitial when a file is not link-shared.
    console.log(`FAILED (got ${type} — file may not be shared publicly)`)
    continue
  }

  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
  console.log(`${(buf.length / 1e6).toFixed(1)} MB -> ${dest}`)
}

console.log('\nNext: re-encode before uploading, e.g.')
console.log('  ffmpeg -i in.mp4 -vf "scale=-2:720" -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 128k out.mp4')
