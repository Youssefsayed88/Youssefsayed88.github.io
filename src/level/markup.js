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
import { trackAttrs } from '../core/analytics.js'
import { chatBubbleMarkup } from '../chat/markup.js'
import { summary, experience, education, skills } from '../data/profile.js'
import { testimonials } from '../data/testimonials.js'
import { ICONS } from '../ui/icons.js'
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

// The CV download and the ways to get in touch, counted the same way on both
// routes; `from` says which link on the page it was.
export function contactEvent(id, from) {
  return id === 'cv'
    ? trackAttrs('download-cv', { from })
    : trackAttrs('contact', { channel: id, from })
}

// ---------- The foot of both pages ----------

// Every way to reach him, as icons. The same list, in the same order, on both
// pages' footers.
function contactLinks() {
  return [
    OWNER.email && { id: 'email', label: `Email ${OWNER.email}`, href: `mailto:${OWNER.email}` },
    OWNER.phone && { id: 'phone', label: `Call ${OWNER.phone}`, href: `tel:${OWNER.phone.replace(/\s/g, '')}` },
    OWNER.linkedin && { id: 'linkedin', label: 'LinkedIn', href: OWNER.linkedin, attrs: external },
    OWNER.github && { id: 'github', label: 'GitHub', href: OWNER.github, attrs: external },
    OWNER.itch && { id: 'itch', label: 'itch.io', href: OWNER.itch, attrs: external },
    OWNER.cv && { id: 'cv', label: 'Download CV (PDF)', href: `./${OWNER.cv}`, attrs: external },
  ].filter(Boolean)
}

// `from` is where on the page, for the analytics events.
export function socialMarkup(from) {
  return `<ul class="social" aria-label="Contact">${contactLinks().map((c) => `
        <li><a class="social__link social__link--${c.id}" href="${esc(c.href)}" ${c.attrs ?? ''} aria-label="${esc(c.label)}" title="${esc(c.label)}" ${contactEvent(c.id, from)}>${ICONS[c.id]}</a></li>`).join('')}
      </ul>`
}

// The year is the build's, so it never goes stale.
export function copyrightMarkup() {
  return `<p class="copyright">&copy; ${new Date().getFullYear()} ${esc(OWNER.name)}. All rights reserved.</p>`
}

// Who said it, on one line: "Name, Role · Company".
export function attribution(t) {
  return [t.role, t.company].filter(Boolean).join(' · ')
}

// The level's testimonials. Like the summary, a quote is one platform per
// sentence, and the name under it one more: a paragraph would be a wall to
// climb. Nothing at all when the list is empty.
function testimonialsSection() {
  if (!testimonials.length) return ''
  return `
    <section class="lv-section lv-testimonials" id="testimonials" data-section="Testimonials">
      <h2 class="lv-heading" data-platform="heading-testimonials">Testimonials</h2>
      <div class="lv-quotes">${testimonials.map((t, i) => `
        <figure class="lv-quote">
          <blockquote class="lv-quote__text">${sentences(t.quote).map((s, j) => `
            <p class="lv-line" data-platform="quote-${i}-${j}">${esc(s)}</p>`).join('')}
          </blockquote>
          <figcaption class="lv-line lv-quote__by" data-platform="quote-${i}-by"><strong>${esc(t.name)}</strong>${attribution(t) ? `<span class="lv-meta">${esc(attribution(t))}</span>` : ''}</figcaption>
        </figure>`).join('')}
      </div>
    </section>
`
}

// A project is its thumbnail and nothing else on the page — it says the rest in
// a speech bubble when the robot lands on it. The title and role are still in
// the markup, visually hidden, so a screen reader and a crawler get what the eye
// gets from the picture.
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

// The sections, in page order, for the rail down the right side of both pages.
// Each id is the section's element id on the level and on classic.html, so the
// rail's links are ordinary anchors and still work with JavaScript off.
export const SECTIONS = [
  { id: 'about', label: 'About' },
  ...WINGS.filter((w) => byWing(w.id).length).map((w) => ({ id: w.id, label: w.label })),
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  ...(testimonials.length ? [{ id: 'testimonials', label: 'Testimonials' }] : []),
]

// The rail: a dot per section on a track, with a fill that runs down it as the
// page goes by. Script on either page (src/ui/Rail.js, and its inline copy in
// build-classic.mjs) moves the fill and marks the current section; on the level
// a click teleports the robot, on the plain page it scrolls there.
// The plain page passes its own list: it has an About me section the level
// does not (its paragraphs would be too tall to climb).
export function railMarkup(sections = SECTIONS) {
  return `<nav class="rail" id="rail" aria-label="Sections" style="--rail-count:${sections.length}">
    <span class="rail__track" aria-hidden="true"><span class="rail__fill"></span></span>
    <ol class="rail__list">${sections.map((s, i) => `
      <li style="--i:${i}"><a class="rail__item" href="#${esc(s.id)}" data-section-id="${esc(s.id)}"><span class="rail__label">${esc(s.label)}</span><span class="rail__dot" aria-hidden="true"></span></a></li>`).join('')}
    </ol>
  </nav>`
}

// The front door: which portfolio do you want? Covers the level until the
// visitor picks one; the game, and the robot's download, start only on the
// interactive choice. The basic choice is an ordinary link.
//
// Shown only when the inline check in index.html's head adds `has-door` to
// <html> — before first paint, and never without JavaScript, where the
// interactive choice could do nothing and the level underneath is already a
// readable page.
export function doorMarkup() {
  return `<section class="door" id="door" aria-labelledby="door-title">
    <div class="door__inner">
      <p class="door__name" id="door-title">${esc(OWNER.name)}</p>
      <p class="door__role">${esc(OWNER.title)} &middot; ${esc(OWNER.location)}</p>
      <p class="door__lede">Two ways in. The same work either way.</p>
      <div class="door__choices">
        <button class="door__card door__card--play" id="door-play" type="button">
          <span class="door__fill" aria-hidden="true"></span>
          <span class="door__title">${esc(ROUTE_NAMES.showroom)}<span class="door__arrow" aria-hidden="true">&rarr;</span></span>
          <span class="door__desc">Play through it as a platformer. A robot jumps down the page, and tells you about each project it lands on.</span>
          <span class="door__meta"><span class="door__status" aria-live="polite">Keyboard, touch or gamepad &middot; a few seconds to load</span><span class="door__percent" aria-hidden="true"></span></span>
        </button>
        <a class="door__card" href="./classic.html" ${trackAttrs('choose-portfolio', { route: 'basic' })}>
          <span class="door__title">${esc(ROUTE_NAMES.basic)}<span class="door__arrow" aria-hidden="true">&rarr;</span></span>
          <span class="door__desc">Every project on one readable page, with the experience, skills and CV alongside.</span>
          <span class="door__meta">Loads instantly &middot; works anywhere &middot; prints</span>
        </a>
      </div>
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
    <section class="lv-section lv-intro" id="about" data-section="About">
      <h1 class="lv-name" data-platform="hero" data-spawn>${esc(OWNER.name)}</h1>
      <p class="lv-line lv-role" data-platform="role">${esc(OWNER.title)} &middot; ${esc(OWNER.location)}</p>
      <div class="lv-summary">${sentences(summary).map((s, i) => `
        <p class="lv-line" data-platform="summary-${i}">${esc(s)}</p>`).join('')}
      </div>
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
${testimonialsSection()}
    <footer class="lv-ground" data-platform="ground" data-solid data-section="Portal">
      <button class="portal" id="portal" type="button">
        <span class="portal__arrow" aria-hidden="true">&uarr;</span>
        <span class="portal__label">Back to the top</span>
      </button>
      <div class="lv-ground__info">
        ${socialMarkup('footer')}
        ${copyrightMarkup()}
      </div>
    </footer>

    <div class="avatar" id="avatar" aria-hidden="true">
      <div class="avatar__placeholder"></div>
    </div>

    <div class="bubble" id="bubble" hidden aria-live="polite">
      <span class="bubble__typing" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="bubble__message">
        <p class="bubble__eyebrow"></p>
        <p class="bubble__title"></p>
        <p class="bubble__detail"></p>
        <button class="bubble__open" type="button"><span class="bubble__dwell" aria-hidden="true"></span><span class="bubble__verb">Open</span><kbd>E</kbd></button>
      </div>
      <svg class="bubble__tail" viewBox="0 0 22 12" aria-hidden="true"><path class="bubble__tail-fill" d="M0 0C6 0 10 3 11 12C12 3 16 0 22 0Z"/><path class="bubble__tail-line" d="M0 0.5C6 0.5 10 3 11 12C12 3 16 0.5 22 0.5"/></svg>
    </div>
${chatBubbleMarkup()}
  </main>`
}
