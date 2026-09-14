// The level, as HTML. Injected into index.html at build time by vite.config.js.
//
// The page IS the level: every element carrying `data-platform` is something the
// robot can stand on, measured from the real layout at runtime (see
// src/game/Level.js). So the content is ordinary markup — on screen at first
// paint before any script, selectable, crawlable, and still a readable page with
// JavaScript off.
//
// Every platform is kept SHORT, and that is what the structure below is for. A
// platform can only be climbed back up to from something less than a jump below
// its top, so a tall block — a paragraph, a card of bullet points — is a wall
// from underneath. So the summary is one platform per sentence, a job is its
// heading and then one platform per bullet, and an education entry is one line.
// Read top to bottom it is still the same page; played bottom to top it is a
// staircase.
//
// Pure string-building with no DOM, so Node can import it: the vite plugin runs
// it, and platformer-smoke.mjs checks that every project and every skill tag
// came out as a platform.
import { OWNER, WINGS, byWing } from '../data/projects.js'
import { summary, experience, education, skills } from '../data/profile.js'
import { ROUTE_NAMES } from '../core/params.js'
import { PLAYER_HEIGHT } from '../game/movement.js'

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const external = 'target="_blank" rel="noopener noreferrer"'

// The summary, a sentence at a time. Split on a full stop followed by a space
// and a capital, so "3+ years" and a decimal survive.
export const sentences = (text) => String(text).split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean)

function contacts() {
  const chips = [
    OWNER.cv && { id: 'cv', label: 'CV (PDF)', href: `./${OWNER.cv}`, attrs: external, cv: true },
    OWNER.email && { id: 'email', label: OWNER.email, href: `mailto:${OWNER.email}` },
    OWNER.github && { id: 'github', label: 'GitHub', href: OWNER.github, attrs: external },
    OWNER.linkedin && { id: 'linkedin', label: 'LinkedIn', href: OWNER.linkedin, attrs: external },
    OWNER.itch && { id: 'itch', label: 'itch.io', href: OWNER.itch, attrs: external },
  ].filter(Boolean)

  return chips.map((c) => `
      <li><a class="lv-chip${c.cv ? ' lv-chip--cv' : ''}" data-platform="contact-${c.id}" href="${esc(c.href)}" ${c.attrs ?? ''}>${esc(c.label)}</a></li>`).join('')
}

// A project is its thumbnail and nothing else on the page — the details open in
// the panel. The title and role are still in the markup, visually hidden, so a
// screen reader and a crawler get what the eye gets from the picture.
function thumbnail(p) {
  const media = p.image
    ? `<img src="${esc(p.image)}" alt="" width="480" height="270" loading="lazy" decoding="async">`
    : '<span class="lv-thumb__empty">Capture pending</span>'

  return `
        <button class="lv-thumb" type="button" data-platform="project-${esc(p.id)}" data-project="${esc(p.id)}">
          ${media}
          <span class="sr-only">${esc(p.title)}${p.role ? `. ${esc(p.role)}` : ''}</span>
        </button>`
}

function wing(w) {
  const list = byWing(w.id)
  if (!list.length) return ''
  return `
    <section class="lv-section lv-wing" id="${esc(w.id)}" data-section="${esc(w.label)}">
      <h2 class="lv-heading" data-platform="wing-${esc(w.id)}">${esc(w.label)}<small>${list.length} project${list.length === 1 ? '' : 's'}</small></h2>
      <div class="lv-shelf">${list.map(thumbnail).join('')}
      </div>
    </section>`
}

export function levelMarkup() {
  const jobs = experience.map((job, i) => `
        <div class="lv-job">
          <h3 class="lv-line lv-job__head" data-platform="job-${i}">${esc(job.company)}<span class="lv-meta">${job.roles.map((r) => `${esc(r.title)}, ${esc(r.period)}`).join(' &middot; ')} &middot; ${esc(job.location)}</span></h3>
          <ul class="lv-points">${job.points.map((pt, j) => `
            <li class="lv-line" data-platform="job-${i}-${j}">${esc(pt)}</li>`).join('')}
          </ul>
        </div>`).join('')

  const schooling = education.map((e, i) => `
        <li class="lv-line lv-edu" data-platform="edu-${i}"><strong>${esc(e.title)}</strong><span class="lv-meta">${esc(e.org)}${e.detail ? ` &middot; ${esc(e.detail)}` : ''} &middot; ${esc(e.year)}</span></li>`).join('')

  // Every tag is its own platform, and so is each group's label.
  const skillGroups = skills.map((group, g) => `
        <div class="lv-skill-group">
          <h3 class="lv-skill-label" data-platform="skill-group-${g}">${esc(group.group)}</h3>
          <ul class="lv-tags">${group.items.map((item, i) =>
            `<li class="lv-tag" data-platform="skill-${g}-${i}-${slug(item)}">${esc(item)}</li>`).join('')}</ul>
        </div>`).join('')

  // `--player-h` is the body's height from movement.js, so the placeholder that
  // stands in until the robot loads is exactly the size of the thing that moves.
  return `<main class="level" id="level" style="--player-h:${PLAYER_HEIGHT}px">
    <section class="lv-section lv-intro" data-section="About">
      <h1 class="lv-name" data-platform="hero" data-spawn>${esc(OWNER.name)}</h1>
      <p class="lv-line lv-role" data-platform="role">${esc(OWNER.title)} &middot; ${esc(OWNER.location)}</p>
      <div class="lv-summary">${sentences(summary).map((s, i) => `
        <p class="lv-line" data-platform="summary-${i}">${esc(s)}</p>`).join('')}
      </div>
      <ul class="lv-contact">${contacts()}
      </ul>
    </section>
${WINGS.map(wing).join('')}

    <section class="lv-section" id="experience" data-section="Experience">
      <h2 class="lv-heading" data-platform="heading-experience">Experience</h2>
      <div class="lv-jobs">${jobs}
      </div>
    </section>

    <section class="lv-section" id="education" data-section="Education">
      <h2 class="lv-heading" data-platform="heading-education">Education</h2>
      <ul class="lv-list">${schooling}
      </ul>
    </section>

    <section class="lv-section" id="skills" data-section="Skills">
      <h2 class="lv-heading" data-platform="heading-skills">Skills</h2>
      <div class="lv-skills">${skillGroups}
      </div>
    </section>

    <footer class="lv-ground" data-platform="ground" data-solid data-section="Portal">
      <button class="portal" id="portal" type="button">
        <span class="portal__arrow" aria-hidden="true">&uarr;</span>
        <span class="portal__label">Back to the top</span>
      </button>
      <div class="lv-ground__info">
        <p><strong>${esc(OWNER.name)}</strong> &middot; <a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a></p>
        <p>In a hurry? <a href="./classic.html">${esc(ROUTE_NAMES.basic)}</a> has every project on one page.</p>
      </div>
    </footer>

    <div class="avatar" id="avatar" aria-hidden="true">
      <div class="avatar__placeholder"></div>
    </div>
  </main>`
}
