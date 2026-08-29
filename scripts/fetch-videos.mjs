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
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
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

  let res = await fetch(url(v.fileId), { redirect: 'follow' })
  if (!res.ok) {
    console.log(`FAILED (HTTP ${res.status})`)
    continue
  }

  let type = res.headers.get('content-type') || ''

  // Files over ~100MB return an HTML "Virus scan warning" page instead of the
  // file. It carries a plain GET form with a per-request uuid; following it is
  // all that is needed. Still no credentials anywhere.
  if (type.startsWith('text/html')) {
    const html = await res.text()
    const form = parseConfirmForm(html)
    if (!form) {
      console.log('FAILED (HTML response, no confirm form — file may not be shared publicly)')
      continue
    }
    res = await fetch(form, { redirect: 'follow' })
    type = res.headers.get('content-type') || ''
  }

  if (!type.startsWith('video/')) {
    console.log(`FAILED (got ${type})`)
    continue
  }

  // Stream rather than buffer — these run past 100MB.
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
  console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB -> ${dest}`)
}

// Rebuilds the interstitial's <form> into a URL.
function parseConfirmForm(html) {
  const action = html.match(/<form[^>]+action="([^"]+)"/i)?.[1]
  if (!action) return null
  const params = new URLSearchParams()
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/gi)) {
    params.set(m[1], m[2])
  }
  return `${action.replace(/&amp;/g, '&')}?${params}`
}

console.log('\nNext: re-encode before uploading, e.g.')
console.log('  ffmpeg -i in.mp4 -vf "scale=-2:720" -c:v libx264 -crf 24 -preset slow -c:a aac -b:a 128k out.mp4')
