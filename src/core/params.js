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
export const PROJECT_PARAM = 'project'

// `play` is a link that has already chosen the interactive portfolio, so it
// skips the front door that asks (see doorMarkup in src/level/markup.js).
// classic.html's link to the level carries it. So does `project`, which names a
// thumbnail inside the level. And so does the old showroom's `showroom`: a link
// shared back then meant the same choice.
export const PLAY_PARAM = 'play'
export const DOOR_SKIP_PARAMS = [PLAY_PARAM, PROJECT_PARAM, 'showroom']

// What the two routes are CALLED, in the one place that names them.
//
// vite.config.js substitutes these into index.html, src/level/markup.js writes
// the basic one into the level's footer, and build-classic.mjs writes both into
// the page it generates — so a rename is this line and nothing else.
export const ROUTE_NAMES = {
  showroom: 'Interactive Portfolio',
  basic: 'Basic Portfolio',
}
