// Visitor analytics: PostHog, in its cookieless mode, so no consent banner.
//
// Both routes and the 404 page carry the same inline tag in their heads
// (vite.config.js and build-classic.mjs write `analyticsTag()`), and every event
// is named either in `track()` calls or in the `data-event` attributes that
// `trackAttrs()` writes. The page an event fired on is recorded with it, so no
// event says which route it came from.
//
// PostHog loads only on the live site, so `npm run dev`, `vite preview` and the
// headless verification never show up in the numbers and never make a request
// off the machine. It loads async: the game never waits on it.
//
// Pure module: nothing touches the DOM on import, so the build scripts can
// import it under Node.

import { OWNER } from '../data/projects.js'

// The token comes from the environment at build time, never from the repo: the
// deploy workflow passes it in from a GitHub Actions secret (see
// .github/workflows/deploy.yml). A local build has none, and so has no analytics
// at all, which is what a local build should have. To try it locally anyway:
//
//   POSTHOG_TOKEN=phc_… npm run build
//
// The token ends up in the published HTML regardless — a browser cannot send
// an event without it — and it is write-only by design. Keeping it out of the
// repo keeps it out of its history, not out of view-source.
//
// In the browser bundle there is no `process`; it only needs `track()`, which
// does not read the token.
const env = globalThis.process?.env ?? {}

// PostHog: Project settings -> General -> Project token (starts `phc_`).
// `POSTHOG_HOST` is the region the project was created in:
// https://us.i.posthog.com (the default) or https://eu.i.posthog.com.
export const POSTHOG = {
  token: (env.POSTHOG_TOKEN ?? '').trim(),
  host: (env.POSTHOG_HOST ?? '').trim() || 'https://us.i.posthog.com',
}

const LIVE_HOST = new URL(OWNER.site).hostname

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// PostHog's own loader, verbatim from posthog.com/docs/libraries/js: it defines
// a `posthog` stub at once, queues calls on it, and fetches the real library
// async. So `track()` works from the first line of any script after it.
const POSTHOG_LOADER = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`

// - cookieless_mode 'always': nothing in cookies or storage; visitors are
//   counted by a daily-salted hash on PostHog's servers. Needs "Cookieless
//   server hash mode" on in the project's Web analytics settings.
// - capture_pageview true: the first load only. The platformer rewrites
//   `?project=` whenever a panel opens or closes, and 'history_change' would
//   count each rewrite as a page view; those are `open-project` events instead.
// - autocapture off: every event worth having is named below, and anything
//   else would spend the free tier on clicks nobody reads.
// - No session recording: it would need consent this page does not ask for.
const POSTHOG_CONFIG = {
  api_host: POSTHOG.host,
  defaults: '2026-05-30',
  cookieless_mode: 'always',
  capture_pageview: true,
  autocapture: false,
  disable_session_recording: true,
}

// A click on anything carrying `data-event` is that event, with each
// `data-event-<key>` as a property. Delegated from the document, so markup
// rendered later (the project panel) is covered too. sendBeacon, because a
// same-tab link would otherwise unload the page with the event still queued.
const CLICKS = `document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-event]');if(!el||!window.posthog)return;var p={};for(var k in el.dataset)if(k.length>5&&k.indexOf('event')===0)p[k.charAt(5).toLowerCase()+k.slice(6)]=el.dataset[k];try{window.posthog.capture(el.dataset.event,p,{transport:'sendBeacon'})}catch(x){}},true);`

export function analyticsTag() {
  if (!POSTHOG.token) return ''
  const load = `${POSTHOG_LOADER}posthog.init(${JSON.stringify(POSTHOG.token)},${JSON.stringify(POSTHOG_CONFIG)});`
  // `</` cannot appear inside the inline script; nothing above has one, and the
  // token is a plain identifier.
  return `<script>${CLICKS}if(location.hostname===${JSON.stringify(LIVE_HOST)}){${load}}</script>`
}

// A click event, for links and buttons in generated markup.
//
//   <a href="…" ${trackAttrs('download-cv', { from: 'level' })}>
export function trackAttrs(name, data = {}) {
  if (!POSTHOG.token) return ''
  const props = Object.entries(data).map(([k, v]) => ` data-event-${k}="${esc(v)}"`).join('')
  return `data-event="${esc(name)}"${props}`
}

// An event from script. Off the live site there is no `posthog`, and this does
// nothing.
export function track(name, data) {
  if (typeof window === 'undefined') return
  try { window.posthog?.capture?.(name, data) } catch { /* analytics never breaks the page */ }
}
