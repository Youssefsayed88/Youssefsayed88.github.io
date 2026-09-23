// Generates classic.html from the same data the platformer is built from.
//
//   node scripts/build-classic.mjs
//
// Runs via npm predev/prebuild, so the page can never drift from projects.js.
// CSS is inlined on purpose: this is the page someone lands on when they are in
// a hurry or want to print, so it should cost exactly one request. The one
// script it loads (src/classic.js, the video dialog) is small and deferred, and
// only fetches the player when a video is opened.

import fs from 'node:fs'
import { OWNER, OG_IMAGE, WINGS, projects, byWing } from '../src/data/projects.js'
import { PROJECT_PARAM, PLAY_PARAM, ROUTE_NAMES } from '../src/core/params.js'
import { summary, experience, education, skills } from '../src/data/profile.js'
import { railMarkup, contactEvent } from '../src/level/markup.js'
import { analyticsTag, trackAttrs } from '../src/core/analytics.js'
import { CHAT_URL, chatMeta } from '../src/chat/config.js'
import { chatPanelMarkup } from '../src/chat/markup.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// No trailing slash, so `${SITE}/${OG_IMAGE.path}` never doubles up.
const SITE = String(OWNER.site ?? '').replace(/\/+$/, '')

const socials = [
  OWNER.github && { id: 'github', label: 'GitHub', url: OWNER.github },
  OWNER.linkedin && { id: 'linkedin', label: 'LinkedIn', url: OWNER.linkedin },
  OWNER.itch && { id: 'itch', label: 'itch.io', url: OWNER.itch },
].filter(Boolean)

// The palette and theme handling shared by the two pages this script writes,
// classic.html and 404.html. The same tokens as :root in src/style.css, dark
// variant included; each page is one request, so they are copied rather than
// linked. A theme picked on any page is under the same storage key.
const TOKENS = `:root{color-scheme:light;--bg:#f5f3ee;--surface:#fff;--ink:#1f1f24;--muted:#55555c;--faint:#8b8a90;
  --rule:#dcd8cf;--accent:#e0782f;--ink-hover:#3a3a42;--surface-hover:#efece5}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#17171b;--surface:#24242a;
  --ink:#ecebe6;--muted:#b4b3b9;--faint:#8e8d94;--rule:#3a3a42;--accent:#f0913c;--ink-hover:#cfcdc6;--surface-hover:#2f2f36}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#17171b;--surface:#24242a;
  --ink:#ecebe6;--muted:#b4b3b9;--faint:#8e8d94;--rule:#3a3a42;--accent:#f0913c;--ink-hover:#cfcdc6;--surface-hover:#2f2f36}
*,*::before,*::after{box-sizing:border-box}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.skip-link{position:absolute;top:.6rem;left:.6rem;z-index:50;padding:.5rem .95rem;border-radius:6px;
  background:var(--ink);color:var(--surface);font-size:.9rem;font-weight:600;text-decoration:none;
  transform:translateY(calc(-100% - 1rem))}
.skip-link:focus{transform:none}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;
  animation-iteration-count:1!important;transition-duration:.001ms!important}html{scroll-behavior:auto!important}}`

// Applies a stored pick before first paint; goes in the head.
const THEME_EARLY = `<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`

const THEME_ICONS = `<svg class="theme-toggle__moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/></svg><svg class="theme-toggle__sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`

// The toggle's wiring, inline: src/ui/theme.js without modules.
const THEME_TOGGLE = `(function () {
  var button = document.getElementById('theme')
  if (!button) return
  var root = document.documentElement
  var system = matchMedia('(prefers-color-scheme: dark)')
  function current() { return root.dataset.theme || (system.matches ? 'dark' : 'light') }
  function render() {
    var theme = current()
    button.dataset.current = theme
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
  }
  button.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch (e) {}
    render()
  })
  system.addEventListener('change', render)
  render()
  button.hidden = false
})()`

// The chatbot's panel down the side, when the build has one: the pieces both
// pages share (src/chat/chat.css), then this page's own layout. On a wide
// screen the page makes room for it, so it sits beside the work rather than on
// top of it; on a phone it is a sheet up from the bottom.
const CHAT_CSS = CHAT_URL ? `${fs.readFileSync('src/chat/chat.css', 'utf8')}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.chat-fab{position:fixed;z-index:8;right:max(1.25rem,env(safe-area-inset-right));bottom:max(1.25rem,env(safe-area-inset-bottom));
  display:inline-flex;align-items:center;gap:.55rem;padding:.7rem 1.15rem;border:0;border-radius:999px;cursor:pointer;
  font:inherit;font-size:.92rem;font-weight:600;background:var(--ink);color:var(--surface);
  box-shadow:0 8px 24px rgba(31,31,36,.22);transition:background-color .15s ease}
.chat-fab:hover,.chat-fab:focus-visible{background:var(--ink-hover)}
.chat-fab__dot{width:.6rem;height:.6rem;border-radius:50%;background:var(--accent);animation:fab-pulse 2.4s ease-in-out infinite}
@keyframes fab-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent)}50%{box-shadow:0 0 0 6px transparent}}
.chat-panel{position:fixed;z-index:9;top:0;right:0;bottom:0;width:min(24rem,100%);display:flex;flex-direction:column;
  background:var(--surface);border-left:1px solid var(--rule);box-shadow:-12px 0 32px rgba(31,31,36,.12);animation:panel-side .22s ease-out}
@keyframes panel-side{from{transform:translateX(24px);opacity:0}}
.chat-panel__head{display:flex;justify-content:space-between;align-items:center;padding:.85rem 1rem;border-bottom:1px solid var(--rule)}
.chat-panel__title{margin:0;font-weight:700}
.chat-panel__log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:1rem;display:flex;flex-direction:column;gap:.7rem}
.chat-msg{max-width:88%;padding:.6rem .85rem;border-radius:16px;font-size:.9rem;line-height:1.5}
.chat-msg p{margin:0}
.chat-msg--bot{align-self:flex-start;background:var(--bg);border:1px solid var(--rule);border-bottom-left-radius:5px}
.chat-msg--bot.chat__reply p{margin:0 0 .45rem}
.chat-msg--user{align-self:flex-end;background:var(--ink);color:var(--surface);border-bottom-right-radius:5px;overflow-wrap:anywhere}
.chat-panel>.chat__error{margin:0 1rem .6rem}
.chat-panel__foot{padding:.75rem 1rem max(.75rem,env(safe-area-inset-bottom));border-top:1px solid var(--rule)}
.chat-typing{display:flex;gap:5px;padding:.25rem .1rem}
.chat-typing i{width:7px;height:7px;border-radius:50%;background:var(--faint);animation:chat-dot .9s ease-in-out infinite}
.chat-typing i:nth-child(2){animation-delay:.15s}.chat-typing i:nth-child(3){animation-delay:.3s}
@keyframes chat-dot{0%,60%,100%{transform:none;opacity:.5}30%{transform:translateY(-4px);opacity:1}}
html.is-chatting .chat-fab{display:none}
@media (min-width:1200px){html.is-chatting body{padding-right:24rem}html.is-chatting .rail{right:calc(24rem + .9rem)}}
@media (max-width:560px){.chat-panel{top:auto;height:min(88vh,40rem);border-left:0;border-top:1px solid var(--rule);
  border-radius:20px 20px 0 0;box-shadow:0 -12px 32px rgba(31,31,36,.18);animation-name:panel-up}}
@keyframes panel-up{from{transform:translateY(24px);opacity:0}}
@media print{.chat-fab,.chat-panel{display:none!important}html.is-chatting body{padding-right:0}}` : ''

function projectCard(p) {
  const media = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" width="480" height="270">`
    : `<div class="card__placeholder">Capture pending</div>`

  const links = [
    ...(p.links ?? []),
    p.video && { label: 'Watch video', url: p.video, video: true },
  ].filter(Boolean)

  // A hosted file opens in the page's own player (src/classic.js), as it does
  // in the platformer's panel; the href is the fallback with JavaScript off.
  // Anything else (YouTube, Drive) keeps its host's page. A hosted video counts
  // as `play-video` once it plays (src/classic.js); every other link counts as
  // it is followed.
  const link = (l) => {
    const hosted = l.video && /\.(mp4|webm)$/i.test(l.url)
    const data = hosted
      ? ` data-video data-project="${esc(p.id)}" data-title="${esc(p.title)}"${p.image ? ` data-poster="${esc(p.image)}"` : ''}`
      : ` ${trackAttrs('project-link', { project: p.id, link: l.label })}`
    return `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"${data}>${esc(l.label)}</a>`
  }

  // Same id the platformer answers `?project=` with, so one shared link resolves
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
          ${links.length ? `<p class="card__links">${links.map(link).join('')}</p>` : ''}
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
${THEME_EARLY}
${analyticsTag()}
${chatMeta()}
<style>
/* The platformer's palette, so the two routes read as one site: paper, ink,
   and the robot's orange as the only accent. */
${TOKENS}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.6;
  -webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:960px;margin:0 auto;padding:0 1.25rem}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--rule)}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-block:.7rem}
.bar strong{font-size:.95rem}
.bar__actions{display:flex;align-items:center;gap:.5rem}
.bar a,.theme-toggle{font:inherit;font-size:.85rem;text-decoration:none;color:var(--ink);background:none;
  border:1.5px solid var(--ink);border-radius:999px;padding:.35rem .9rem;cursor:pointer;
  transition:background-color .15s ease,color .15s ease,border-color .15s ease}
.bar a:hover,.bar a:focus-visible{background:var(--ink);color:var(--surface)}
.theme-toggle{display:grid;place-items:center;width:2.1rem;height:2.1rem;padding:0}
.theme-toggle[hidden]{display:none}
.theme-toggle:hover,.theme-toggle:focus-visible{background:var(--surface-hover)}
.theme-toggle svg{width:1rem;height:1rem}
.theme-toggle[data-current="dark"] .theme-toggle__moon,.theme-toggle:not([data-current="dark"]) .theme-toggle__sun{display:none}
header{padding:3.5rem 0 2.5rem}
h1{margin:0 0 .35rem;font-size:clamp(2rem,5vw,3rem);line-height:1.05;letter-spacing:-.02em}
.role{margin:0 0 1rem;color:var(--muted);font-size:1.05rem}
.summary{margin:0 0 1.5rem;color:var(--muted);max-width:62ch}
.contact{display:flex;flex-wrap:wrap;gap:.5rem;padding:0;margin:0;list-style:none}
.contact a{display:inline-block;padding:.4rem .85rem;background:var(--surface);border:1px solid var(--rule);
  border-radius:6px;font-size:.85rem;text-decoration:none}
.contact a{transition:background-color .15s ease,border-color .15s ease}
.contact a:hover,.contact a:focus-visible{border-color:var(--ink)}
/* The CV is the one link on this page a recruiter is actively looking for, so
   it is the only one that does not look like the rest of the row. */
.contact .cv a{background:var(--ink);border-color:var(--ink);color:var(--surface);font-weight:600}
.contact .cv a:hover,.contact .cv a:focus-visible{background:var(--ink-hover);border-color:var(--ink-hover)}
section{padding:2.25rem 0;border-top:1px solid var(--rule)}
h2{margin:0 0 .25rem;font-size:1.4rem}
.wing-note{margin:0 0 1.4rem;color:var(--faint);font-size:.88rem}
.grid{display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
/* The ink line along the top of each card is the platformer's ledge: the same
   mark for the same thing, a project. */
.card{background:var(--surface);border:1px solid var(--rule);border-top:3px solid var(--ink);
  border-radius:8px;overflow:hidden;display:flex;flex-direction:column;
  /* The bar is sticky, so an anchored card would otherwise land underneath it. */
  scroll-margin-top:4.5rem}
/* A deep-linked card says so, briefly. Without it, arriving via ?project= just
   scrolls somewhere and leaves you to guess which of the three cards on screen
   was meant. The outline is the one the platformer puts round the thumbnail
   the robot is standing on. */
.card.is-target{outline:3px solid var(--accent);outline-offset:3px}
/* aspect-ratio goes on the img, not the container: inside a flex column the
   container's height resolves from the image's intrinsic size and the ratio is
   ignored, which leaves the grid rows ragged. */
.card__media{background:var(--rule);overflow:hidden;flex:none}
/* Loading: a shimmer until the image decodes, then a fade. Only once the
   script at the foot of the page has marked what was already loaded, so with
   JavaScript off nothing is hidden. */
@keyframes shimmer{from{background-position:100% 0}to{background-position:-100% 0}}
.fades-images .card__media:has(img:not(.is-loaded)){
  background:linear-gradient(100deg,var(--rule) 40%,var(--surface-hover) 50%,var(--rule) 60%) 0 0/200% 100%;
  animation:shimmer 1.3s linear infinite}
.fades-images .card__media img{opacity:0;transition:opacity .35s ease}
.fades-images .card__media img.is-loaded{opacity:1}
.card__media img,.card__placeholder{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.card__placeholder{display:grid;place-items:center;color:var(--faint);font-size:.8rem;background:var(--rule)}
.card__body{padding:1rem 1.1rem 1.15rem;display:flex;flex-direction:column;gap:.5rem;flex:1}
.card__eyebrow{margin:0;font-size:.8rem;color:var(--faint)}
.card h3{margin:0;font-size:1.05rem}
.card__role{margin:0;padding-left:.7rem;border-left:3px solid var(--accent);font-size:.9rem}
.card__blurb{margin:0;color:var(--muted);font-size:.9rem}
.card__tech{display:flex;flex-wrap:wrap;gap:.3rem;margin:.15rem 0 0;padding:0;list-style:none}
.card__tech li{padding:.1rem .55rem;border:1px solid var(--rule);border-radius:999px;
  font-size:.74rem;color:var(--muted)}
.card__links{margin:auto 0 0;padding-top:.5rem;display:flex;flex-wrap:wrap;gap:.35rem 1rem}
.card__links a{font-size:.86rem;font-weight:600;text-underline-offset:3px}
.card__links a{transition:color .15s ease}
.card__links a:hover,.card__links a:focus-visible{color:var(--accent)}
.job{margin-bottom:1.6rem}
.job h3{margin:0;font-size:1.05rem}
.job .meta{margin:.1rem 0 .5rem;color:var(--faint);font-size:.85rem}
.job ul{margin:0;padding-left:1.1rem;color:var(--muted);font-size:.92rem}
.job li{margin-bottom:.25rem}
.edu{margin:0;padding:0;list-style:none}
.edu li{margin-bottom:.7rem;font-size:.92rem}
.edu span{color:var(--faint);font-size:.85rem}
.skills{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.skills h3{margin:0 0 .45rem;font-size:.92rem;font-weight:600;color:var(--muted)}
.skills ul{display:flex;flex-wrap:wrap;gap:.35rem;margin:0;padding:0;list-style:none}
.skills li{padding:.2rem .6rem;background:var(--surface);border:1px solid var(--rule);border-radius:6px;font-size:.8rem}
/* The rail: the level's section dots, from src/style.css. Here a click scrolls
   smoothly, and the fill follows the scroll position. */
section,header{scroll-margin-top:3.3rem}
.rail{--rail-row:3.1rem;--rail-col:2.6rem;--rail-dot:14px;--rail-line:4px;
  position:fixed;z-index:6;top:50%;translate:0 -50%;pointer-events:none;right:max(.9rem,env(safe-area-inset-right))}
.rail__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.rail__list li{animation:rail-in .5s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(.15s + var(--i) * 55ms)}
@keyframes rail-in{from{opacity:0;translate:1.2rem 0}}
.rail__item{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;height:var(--rail-row);
  color:var(--muted);font-size:1rem;text-decoration:none}
.rail__item.is-active{color:var(--ink);font-weight:600}
.rail__item:focus-visible{outline:none}
.rail__dot{flex:none;display:grid;place-items:center;width:var(--rail-col);height:100%;pointer-events:auto;cursor:pointer;
  -webkit-tap-highlight-color:transparent}
.rail__dot::before{content:"";width:var(--rail-dot);height:var(--rail-dot);border-radius:50%;background:var(--bg);
  border:2.5px solid var(--faint);transition:transform .25s cubic-bezier(.3,1.6,.5,1),background-color .25s ease,border-color .25s ease,box-shadow .25s ease}
.rail__item:hover .rail__dot::before{border-color:var(--ink);transform:scale(1.3)}
.rail__item:focus-visible .rail__dot::before{outline:2px solid var(--accent);outline-offset:4px}
.rail__item.is-active .rail__dot::before{background:var(--accent);border-color:var(--accent);transform:scale(1.5);
  box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 22%,transparent)}
.rail__label{padding:.25rem .8rem;border-radius:999px;white-space:nowrap;background:color-mix(in srgb,var(--bg) 90%,transparent);
  opacity:0;translate:.6rem 0;pointer-events:none;transition:opacity .2s ease,translate .2s ease}
.rail:hover .rail__label,.rail:focus-within .rail__label,.rail.is-announcing .is-active .rail__label{opacity:1;translate:0 0}
.rail:hover .rail__label,.rail:focus-within .rail__label{pointer-events:auto;cursor:pointer}
.rail__track{position:absolute;top:calc(var(--rail-row) / 2);bottom:calc(var(--rail-row) / 2);
  right:calc(var(--rail-col) / 2 - var(--rail-line) / 2);width:var(--rail-line);border-radius:var(--rail-line);
  background:var(--rule);overflow:hidden}
.rail__fill{position:absolute;inset:0;background:var(--accent);transform-origin:top;transform:scaleY(var(--progress,0));
  transition:transform .45s cubic-bezier(.2,.7,.2,1)}
@media (max-height:780px){.rail{--rail-row:2.6rem}}
@media (max-height:640px){.rail{--rail-row:2.15rem;--rail-dot:12px}}
@media (max-width:560px){.rail{--rail-col:2.2rem;--rail-dot:12px;--rail-line:3px;right:max(.25rem,env(safe-area-inset-right))}
  .rail::before{content:"";position:absolute;top:0;bottom:0;right:0;width:var(--rail-col);border-radius:999px;
  background:color-mix(in srgb,var(--bg) 85%,transparent)}.rail__item{font-size:.95rem}}
@media (max-height:520px){.rail{display:none}}
/* The video dialog: the platformer's panel (.modal in src/style.css), media only. */
.video{width:min(860px,calc(100% - 1.5rem));max-width:none;max-height:none;padding:0;border:0;border-radius:12px;
  overflow:hidden;background:#111114;box-shadow:0 20px 50px rgba(31,31,36,.25);
  --plyr-color-main:var(--accent);--plyr-video-background:#111114;--plyr-font-family:inherit}
.video[open]{animation:panel-in .2s ease-out}
.video::backdrop{background:rgba(31,31,36,.5)}
@keyframes panel-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.video__close{position:absolute;top:.75rem;right:.75rem;z-index:5;width:2rem;height:2rem;display:grid;place-items:center;
  background:var(--surface);color:var(--ink);border:1.5px solid var(--ink);border-radius:50%;
  font:inherit;font-size:1.2rem;line-height:1;cursor:pointer}
.video__close:hover,.video__close:focus-visible{background:var(--ink);color:var(--surface)}
.video__el{display:block;width:100%;aspect-ratio:16/9;max-height:min(80vh,484px);border:0;object-fit:contain;background:#111114}
@media (max-width:620px){.video .plyr__volume input[type="range"],.video .plyr__controls [data-plyr="pip"]{display:none}}
footer{padding:2.5rem 0 3.5rem;border-top:1px solid var(--rule);color:var(--faint);font-size:.85rem}
footer a{transition:color .15s ease}
footer a:hover{color:var(--accent)}
main:focus{outline:none}
${CHAT_CSS}
@media print{
  :root,:root[data-theme]{color-scheme:light;--bg:#fff;--surface:#fff;--ink:#000;--muted:#333;--faint:#555;--rule:#ccc}
  body{background:#fff;color:#000}
  .bar,.card__media,.skip-link,.rail,.video{display:none}
  a{color:#000}
  .card{border-top-width:1px}
}
</style>
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<div class="bar">
  <div class="wrap">
    <strong>${esc(OWNER.name)}</strong>
    <div class="bar__actions">
      <button class="theme-toggle" id="theme" type="button" aria-label="Switch to dark theme" hidden>${THEME_ICONS}</button>
      <a href="./index.html?${PLAY_PARAM}" ${trackAttrs('switch-route', { to: 'interactive', from: 'bar' })}>${esc(ROUTE_NAMES.showroom)}</a>
    </div>
  </div>
</div>

<main class="wrap" id="main" tabindex="-1">

  <header id="about">
    <h1>${esc(OWNER.name)}</h1>
    <p class="role">${esc(OWNER.title)} &middot; ${esc(OWNER.location)}</p>
    <p class="summary">${esc(summary)}</p>
    <ul class="contact">
      ${OWNER.cv ? `<li class="cv"><a href="${esc(OWNER.cv)}" target="_blank" rel="noopener noreferrer" ${contactEvent('cv', 'header')}>Download CV (PDF)</a></li>` : ''}
      <li><a href="mailto:${esc(OWNER.email)}" ${contactEvent('email', 'header')}>${esc(OWNER.email)}</a></li>
      <li><a href="tel:${esc(OWNER.phone.replace(/\s/g, ''))}" ${contactEvent('phone', 'header')}>${esc(OWNER.phone)}</a></li>
      ${socials.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" ${contactEvent(s.id, 'header')}>${esc(s.label)}</a></li>`).join('\n      ')}
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
    <p>Prefer to play through it? <a href="./index.html?${PLAY_PARAM}" ${trackAttrs('switch-route', { to: 'interactive', from: 'footer' })}>${esc(ROUTE_NAMES.showroom)}</a>.</p>
  </footer>

</main>

${railMarkup()}

<dialog class="video" id="video" aria-label="Project video">
  <button class="video__close" type="button" aria-label="Close">&times;</button>
  <div class="video__media"></div>
</dialog>
${chatPanelMarkup()}
<script type="module" src="./src/classic.js"></script>

<script>
${THEME_TOGGLE}

// Thumbnails fade in once decoded. What is already loaded is marked first, in
// the same task, so nothing on screen blinks out.
;(function () {
  var imgs = document.querySelectorAll('.card__media img')
  for (var i = 0; i < imgs.length; i++) {
    (function (img) {
      function done() { img.classList.add('is-loaded') }
      if (img.complete) done()
      else { img.addEventListener('load', done); img.addEventListener('error', done) }
    })(imgs[i])
  }
  document.body.classList.add('fades-images')
})()

// The rail. The current section is the last one whose top has passed a line a
// third of the way down the screen, and the fill runs between dots in
// proportion; at the foot of the page it is the last section, however short.
// A click scrolls there smoothly, without a hash in the history.
;(function () {
  var rail = document.getElementById('rail')
  if (!rail) return
  var items = [].slice.call(rail.querySelectorAll('[data-section-id]'))
  var targets = items.map(function (a) { return document.getElementById(a.dataset.sectionId) })
  var reduced = matchMedia('(prefers-reduced-motion: reduce)')
  var index = -1, timer = 0, queued = false

  function update() {
    queued = false
    var y = scrollY + innerHeight / 3
    var tops = targets.map(function (el) { return el ? el.getBoundingClientRect().top + scrollY : 0 })
    var last = tops.length - 1
    var at = 0, progress = 1
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) at = last
    else {
      for (var i = 0; i <= last; i++) if (tops[i] <= y + 1) at = i
      var span = at < last ? tops[at + 1] - tops[at] : 0
      var along = span > 0 ? Math.min(1, Math.max(0, (y - tops[at]) / span)) : 0
      progress = last > 0 ? Math.min(1, (at + along) / last) : 0
    }
    rail.style.setProperty('--progress', progress.toFixed(3))
    if (at === index) return
    if (index !== -1) {
      items[index].classList.remove('is-active')
      items[index].removeAttribute('aria-current')
      rail.classList.add('is-announcing')
      clearTimeout(timer)
      timer = setTimeout(function () { rail.classList.remove('is-announcing') }, 1500)
    }
    items[at].classList.add('is-active')
    items[at].setAttribute('aria-current', 'true')
    index = at
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(update) } }

  rail.addEventListener('click', function (event) {
    var item = event.target.closest('[data-section-id]')
    var target = item && document.getElementById(item.dataset.sectionId)
    if (!target) return
    event.preventDefault()
    if (event.detail > 0) item.blur()
    target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' })
  })
  addEventListener('scroll', queue, { passive: true })
  addEventListener('resize', queue)
  update()
})()

// Deep links. The platformer answers ?project=<id> by standing the robot on that thumbnail;
// here the same URL scrolls to the same project's card and says which one it
// meant. Progressive enhancement on purpose — the anchor #project-<id> already
// works with JavaScript off, and this only adds the query form and the
// highlight on top of it.
;(function () {
  var id = new URLSearchParams(location.search).get('${PROJECT_PARAM}')
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

// 404.html, for any address on the site that does not exist. GitHub Pages
// serves it at whatever path was asked for, so a relative link would resolve
// against a directory that is not there: every URL here is absolute, from
// OWNER.site. Written to public/, so Vite copies it to the root of dist.
//
// The scene is the level's own vocabulary: a ledge that ends, the robot at its
// edge looking over, and the portal door on the far side.
const HOME = SITE || '.'
const notFound = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page not found — ${esc(OWNER.name)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${esc(HOME)}/favicon.svg" type="image/svg+xml">
${THEME_EARLY}
${analyticsTag()}
<style>
${TOKENS}
body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:2rem 1.25rem;
  background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit}
main{width:100%;max-width:32rem}
.scene{display:block;width:min(20rem,100%);height:auto;margin:0 0 2rem;overflow:visible}
.scene .ledge{fill:var(--ink)}
.scene .arc{fill:none;stroke:var(--faint);stroke-width:2;stroke-dasharray:3 7;stroke-linecap:round;
  animation:march 1.6s linear infinite}
.scene .door{fill:var(--surface);stroke:var(--ink);stroke-width:3}
.scene .door-arrow{fill:var(--accent);font:600 16px system-ui,sans-serif}
/* Peering over the edge: a lean from the feet, and back. */
.scene .bot{transform-box:fill-box;transform-origin:50% 100%;animation:peer 3.2s ease-in-out infinite}
@keyframes peer{0%,45%,100%{transform:none}60%,85%{transform:rotate(9deg)}}
@keyframes march{to{stroke-dashoffset:-20}}
.code{margin:0 0 .35rem;color:var(--faint);font-size:.85rem;font-weight:600;letter-spacing:.04em}
h1{margin:0 0 .75rem;font-size:clamp(1.8rem,6vw,2.5rem);line-height:1.1;letter-spacing:-.02em}
.lede{margin:0 0 1.75rem;color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:0 0 2rem}
.actions a{padding:.6rem 1.1rem;border:1.5px solid var(--ink);border-radius:999px;font-size:.95rem;
  text-decoration:none;transition:background-color .15s ease,border-color .15s ease,color .15s ease}
.actions a:hover,.actions a:focus-visible{background:var(--surface-hover)}
.actions .primary{background:var(--ink);color:var(--surface);font-weight:600}
.actions .primary:hover,.actions .primary:focus-visible{background:var(--ink-hover);border-color:var(--ink-hover)}
.small{margin:0;color:var(--faint);font-size:.85rem}
.small a{transition:color .15s ease}
.small a:hover{color:var(--accent)}
</style>
</head>
<body>
<main>
  <svg class="scene" viewBox="0 0 320 128" aria-hidden="true">
    <path class="arc" d="M134 52 Q200 -14 266 40"/>
    <rect class="ledge" x="0" y="104" width="130" height="3" rx="1.5"/>
    <rect class="ledge" x="226" y="104" width="94" height="3" rx="1.5"/>
    <g class="bot">
      <rect x="96" y="36" width="30" height="68" rx="15" fill="#f0913c"/>
      <rect x="111" y="47" width="14" height="9" rx="4.5" fill="#1f1f24"/>
    </g>
    <path class="door" d="M256 104 V72 a17 17 0 0 1 34 0 V104"/>
    <text class="door-arrow" x="273" y="92" text-anchor="middle">&uarr;</text>
  </svg>
  <p class="code">404</p>
  <h1>This platform isn&rsquo;t here.</h1>
  <p class="lede">The link you followed runs off the edge of the level. The page may have moved, or the address has a typo in it.</p>
  <p class="actions">
    <a class="primary" href="${esc(HOME)}/?${PLAY_PARAM}">Back to the level</a>
    <a href="${esc(HOME)}/classic.html">${esc(ROUTE_NAMES.basic)}</a>
  </p>
  <p class="small">Looking for something specific? <a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a></p>
</main>
</body>
</html>
`
fs.writeFileSync('public/404.html', notFound)

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
