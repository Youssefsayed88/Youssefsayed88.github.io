// Generates classic.html from the same data the 3D showroom renders.
//
//   node scripts/build-classic.mjs
//
// Runs via npm predev/prebuild, so the page can never drift from projects.js.
// CSS is inlined on purpose: this is the page someone lands on when WebGL is
// unavailable or they are in a hurry, so it should cost exactly one request.

import fs from 'node:fs'
import { OWNER, OG_IMAGE, WINGS, projects, byWing } from '../src/data/projects.js'
import { summary, experience, education, skills } from '../src/data/profile.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// No trailing slash, so `${SITE}/${OG_IMAGE.path}` never doubles up.
const SITE = String(OWNER.site ?? '').replace(/\/+$/, '')

const socials = [
  OWNER.github && { label: 'GitHub', url: OWNER.github },
  OWNER.linkedin && { label: 'LinkedIn', url: OWNER.linkedin },
  OWNER.itch && { label: 'itch.io', url: OWNER.itch },
].filter(Boolean)

function projectCard(p) {
  const media = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" width="480" height="270">`
    : `<div class="card__placeholder">Capture pending</div>`

  const links = [
    ...(p.links ?? []),
    p.video && { label: 'Watch video', url: p.video },
  ].filter(Boolean)

  // Same id the showroom answers `?project=` with, so one shared link resolves
  // on either route. See the deep-link script at the foot of this page.
  return `
      <article class="card" id="project-${esc(p.id)}">
        <div class="card__media">${media}</div>
        <div class="card__body">
          ${p.company ? `<p class="card__eyebrow">${esc(p.company)}</p>` : ''}
          <h3>${esc(p.title)}</h3>
          ${p.role ? `<p class="card__role">${esc(p.role)}</p>` : ''}
          <p class="card__blurb">${esc(p.blurb)}</p>
          ${p.tech?.length ? `<ul class="card__tech">${p.tech.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          ${links.length ? `<p class="card__links">${links.map((l) =>
            `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</p>` : ''}
        </div>
      </article>`
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(OWNER.name)} — ${esc(OWNER.title)}</title>
<meta name="description" content="${esc(summary)}">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${esc(OWNER.name)} — ${esc(OWNER.title)}">
<meta property="og:description" content="${esc(summary)}">
<meta property="og:type" content="profile">
<meta property="og:url" content="${esc(SITE)}/classic.html">
<meta property="og:image" content="${esc(SITE)}/${OG_IMAGE.path}">
<meta property="og:image:width" content="${OG_IMAGE.width}">
<meta property="og:image:height" content="${OG_IMAGE.height}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(SITE)}/${OG_IMAGE.path}">
<style>
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#14161f;color:#e8ebf3;
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.65;
  -webkit-font-smoothing:antialiased}
a{color:#37cdea}
.wrap{max-width:960px;margin:0 auto;padding:0 1.25rem}
.bar{position:sticky;top:0;z-index:5;background:rgba(20,22,31,.9);backdrop-filter:blur(8px);
  border-bottom:1px solid rgba(255,255,255,.08)}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-block:.7rem}
.bar strong{font-size:.9rem}
.bar a{font-size:.8rem;text-decoration:none;border:1px solid #37cdea;border-radius:6px;padding:.35rem .8rem}
header{padding:3.5rem 0 2.5rem}
h1{margin:0 0 .3rem;font-size:clamp(1.9rem,5vw,2.8rem);line-height:1.1}
.role{margin:0 0 1rem;color:#37cdea;font-size:1rem;letter-spacing:.02em}
.summary{margin:0 0 1.4rem;color:#b4bbcd;max-width:62ch}
.contact{display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:0;list-style:none}
.contact a{display:inline-block;padding:.4rem .85rem;background:rgba(255,255,255,.06);
  border-radius:999px;font-size:.82rem;text-decoration:none;color:#e8ebf3}
.contact a:hover{background:#37cdea;color:#10121c}
/* The CV is the one link on this page a recruiter is actively looking for, so
   it is the only one that does not look like the rest of the row. */
.contact .cv a{background:#37cdea;color:#10121c;font-weight:600}
.contact .cv a:hover{background:#6fdcf0}
section{padding:2.25rem 0;border-top:1px solid rgba(255,255,255,.07)}
h2{margin:0 0 .35rem;font-size:1.35rem}
.wing-note{margin:0 0 1.4rem;color:#7d859c;font-size:.85rem}
.grid{display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.card{background:#1b1e2b;border:1px solid rgba(255,255,255,.07);border-radius:12px;overflow:hidden;
  display:flex;flex-direction:column;
  /* The bar is sticky, so an anchored card would otherwise land underneath it. */
  scroll-margin-top:4.5rem}
/* A deep-linked card says so, briefly. Without it, arriving via ?project= just
   scrolls somewhere and leaves you to guess which of the three cards on screen
   was meant. */
.card.is-target{border-color:#37cdea;box-shadow:0 0 0 1px #37cdea,0 0 34px rgba(55,205,234,.18)}
/* aspect-ratio goes on the img, not the container: inside a flex column the
   container's height resolves from the image's intrinsic size and the ratio is
   ignored, which leaves the grid rows ragged. */
.card__media{background:#10121c;overflow:hidden;flex:none}
.card__media img,.card__placeholder{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.card__placeholder{display:grid;place-items:center;color:#6b7290;
  font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
  background:repeating-linear-gradient(45deg,#1d2030,#1d2030 10px,#212434 10px,#212434 20px)}
.card__body{padding:1rem 1.1rem 1.15rem;display:flex;flex-direction:column;gap:.5rem;flex:1}
.card__eyebrow{margin:0;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:#37cdea}
.card h3{margin:0;font-size:1.05rem}
.card__role{margin:0;padding-left:.7rem;border-left:2px solid #37cdea;font-size:.88rem}
.card__blurb{margin:0;color:#aab1c5;font-size:.88rem}
.card__tech{display:flex;flex-wrap:wrap;gap:.3rem;margin:.15rem 0 0;padding:0;list-style:none}
.card__tech li{padding:.15rem .55rem;background:rgba(255,255,255,.06);border-radius:999px;
  font-size:.7rem;color:#c3c9db}
.card__links{margin:auto 0 0;padding-top:.5rem;display:flex;flex-wrap:wrap;gap:.5rem}
.card__links a{font-size:.8rem;font-weight:600;text-decoration:none}
.job{margin-bottom:1.6rem}
.job h3{margin:0;font-size:1rem}
.job .meta{margin:.1rem 0 .5rem;color:#7d859c;font-size:.82rem}
.job ul{margin:0;padding-left:1.1rem;color:#aab1c5;font-size:.89rem}
.job li{margin-bottom:.25rem}
.edu{margin:0;padding:0;list-style:none}
.edu li{margin-bottom:.7rem;font-size:.9rem}
.edu span{color:#7d859c;font-size:.82rem}
.skills{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.skills h3{margin:0 0 .4rem;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#37cdea}
.skills ul{display:flex;flex-wrap:wrap;gap:.3rem;margin:0;padding:0;list-style:none}
.skills li{padding:.2rem .6rem;background:rgba(255,255,255,.06);border-radius:999px;font-size:.76rem}
footer{padding:2.5rem 0 3.5rem;border-top:1px solid rgba(255,255,255,.07);color:#7d859c;font-size:.83rem}
@media print{
  body{background:#fff;color:#000}
  .bar,.card__media{display:none}
  a{color:#000}
}
</style>
</head>
<body>

<div class="bar">
  <div class="wrap">
    <strong>${esc(OWNER.name)}</strong>
    <a href="./index.html">Enter the 3D showroom &rarr;</a>
  </div>
</div>

<div class="wrap">

  <header>
    <h1>${esc(OWNER.name)}</h1>
    <p class="role">${esc(OWNER.title)} &middot; ${esc(OWNER.location)}</p>
    <p class="summary">${esc(summary)}</p>
    <ul class="contact">
      ${OWNER.cv ? `<li class="cv"><a href="${esc(OWNER.cv)}" target="_blank" rel="noopener noreferrer">Download CV (PDF)</a></li>` : ''}
      <li><a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a></li>
      <li><a href="tel:${esc(OWNER.phone.replace(/\s/g, ''))}">${esc(OWNER.phone)}</a></li>
      ${socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a></li>`).join('\n      ')}
    </ul>
  </header>

${WINGS.map((wing) => {
  const list = byWing(wing.id)
  if (!list.length) return ''
  return `  <section id="${esc(wing.id)}">
    <h2>${esc(wing.label)}</h2>
    <p class="wing-note">${list.length} project${list.length === 1 ? '' : 's'}</p>
    <div class="grid">${list.map(projectCard).join('')}
    </div>
  </section>`
}).filter(Boolean).join('\n\n')}

  <section id="experience">
    <h2>Experience</h2>
    <p class="wing-note">&nbsp;</p>
${experience.map((job) => `    <div class="job">
      <h3>${esc(job.company)}</h3>
      <p class="meta">${job.roles.map((r) => `${esc(r.title)}, ${esc(r.period)}`).join(' &middot; ')} &middot; ${esc(job.location)}</p>
      <ul>${job.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>`).join('\n')}
  </section>

  <section id="education">
    <h2>Education &amp; Certifications</h2>
    <p class="wing-note">&nbsp;</p>
    <ul class="edu">
${education.map((e) => `      <li><strong>${esc(e.title)}</strong><br><span>${esc(e.org)}${e.detail ? ` &middot; ${esc(e.detail)}` : ''} &middot; ${esc(e.year)}</span></li>`).join('\n')}
    </ul>
  </section>

  <section id="skills">
    <h2>Technical Skills</h2>
    <p class="wing-note">&nbsp;</p>
    <div class="skills">
${skills.map((s) => `      <div>
        <h3>${esc(s.group)}</h3>
        <ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>`).join('\n')}
    </div>
  </section>

  <footer>
    <p>${esc(OWNER.name)} &middot; ${esc(OWNER.email)}</p>
    <p>Prefer the interactive version? <a href="./index.html">Enter the 3D showroom</a>.</p>
  </footer>

</div>

<script>
// Deep links. The showroom answers ?project=<id> by walking you to that kiosk;
// here the same URL scrolls to the same project's card and says which one it
// meant. Progressive enhancement on purpose — the anchor #project-<id> already
// works with JavaScript off, and this only adds the query form and the
// highlight on top of it.
(function () {
  var id = new URLSearchParams(location.search).get('project')
    || (location.hash.indexOf('#project-') === 0 ? location.hash.slice(9) : null)
  if (!id) return
  var card = document.getElementById('project-' + id)
  if (!card) return
  card.classList.add('is-target')
  card.scrollIntoView({ block: 'center' })
})()
</script>
</body>
</html>
`

fs.writeFileSync('classic.html', html)

// The crawl files are generated here too, from the same OWNER.site constant.
//
// <loc> MUST be absolute — the sitemap protocol requires it and Search Console
// rejects a relative path outright — and so must the Sitemap: line in robots.txt.
// Both were relative before, which meant neither was doing anything.
const today = new Date().toISOString().slice(0, 10)
fs.writeFileSync('public/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod><priority>1.0</priority></url>
  <url><loc>${SITE}/classic.html</loc><lastmod>${today}</lastmod><priority>0.9</priority></url>
</urlset>
`)

fs.writeFileSync('public/robots.txt', `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`)

const withRole = projects.filter((p) => p.role).length
const withImage = projects.filter((p) => p.image).length
const withVideo = projects.filter((p) => p.video).length

console.log(`classic.html written — ${projects.length} projects across ${WINGS.length} wings`)
console.log(`  roles filled:  ${withRole}/${projects.length}`)
console.log(`  images:        ${withImage}/${projects.length}`)
console.log(`  videos:        ${withVideo}/${projects.length}`)
