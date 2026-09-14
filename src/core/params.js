// The query parameter both routes answer, in the one place that spells it.
//
// `project` is the shareable form of a single piece of work. `?project=lu-run` is
// what goes into a job application when the point is that ONE project rather
// than the whole page: the platformer stands the robot on that thumbnail with its
// panel open, and classic.html scrolls to the same project's card and says which
// one it meant.
//
// build-classic.mjs interpolates the same constant into the page it generates, so
// no route can drift from another over the spelling of a link.
//
// (`showroom` used to live here too, to skip a front door that asked which
// portfolio you wanted. The platformer IS the page now, readable before any
// script runs, so there is no door left to skip. An old link that still carries
// the parameter is simply ignored.)
export const PROJECT_PARAM = 'project'

// What the two routes are CALLED, in the one place that names them.
//
// vite.config.js substitutes these into index.html, src/level/markup.js writes
// the basic one into the level's footer, and build-classic.mjs writes both into
// the page it generates — so a rename is this line and nothing else.
export const ROUTE_NAMES = {
  showroom: 'Interactive Portfolio',
  basic: 'Basic Portfolio',
}
