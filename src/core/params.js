// The query parameters both routes answer, in the one place that spells them.
//
// `project` is the shareable form of a single kiosk. `?project=lu-run` is what
// goes into a job application when the point is that ONE piece of work rather
// than the whole building: the showroom walks you to that kiosk and opens it,
// classic.html scrolls to the same project's card and says which one it meant,
// and main.js carries the parameter through the no-WebGL redirect so the link
// resolves on every route.
//
// `showroom` skips the front door. The choice between the two portfolios is the
// right question for someone arriving cold, and the wrong one for someone who
// has already answered it — the "Enter the 3D showroom" link on classic.html
// means enter it, not ask again.
//
// This is a module of its own, and a tiny one, because main.js has to recognise
// both parameters BEFORE the engine that answers them has been fetched. Reading
// them off Experience.js would pull 800 kB into the chunk that blocks first
// paint. build-classic.mjs interpolates the same two constants into the page it
// generates, so no route can drift from another over the spelling of a link.
export const PROJECT_PARAM = 'project'
export const SHOWROOM_PARAM = 'showroom'

// What the two routes are CALLED, in the one place that names them.
//
// These labels were five separate strings a moment ago — two cards on the front
// door, the corner button inside the showroom, and two links on classic.html —
// which is four chances for the same destination to be introduced by a
// different name depending on where you met it. The showroom's own exit said
// "Skip the game", which named what you were leaving rather than what you were
// getting.
//
// vite.config.js substitutes these into index.html and build-classic.mjs writes
// them into the generated page, so a rename is this line and nothing else.
export const ROUTE_NAMES = {
  showroom: 'Interactive Portfolio',
  basic: 'Basic Portfolio',
}
