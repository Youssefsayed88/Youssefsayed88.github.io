// Project references in a reply, `[[lu-run]]`, which both pages turn into a
// link to that project. The prompt (context.js) teaches the syntax and the
// renderer (render.js) reads it, so it lives here, in neither: the renderer
// ships to the basic page, and must not bring the whole prompt with it.
export const PROJECT_REF = /\[\[([a-z0-9-]+)\]\]/g
