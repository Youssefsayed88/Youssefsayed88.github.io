# Youssef Mohamed — Portfolio Platformer

Status document. Last updated 2026-09-14. The M12 and M13 work described below
is committed on the `platformer` branch, which is **not yet merged into `main`**.

---

## 1. The target

A portfolio you **play through**. The page is the level: every block on it is a
platform, and a robot starts at the top and makes its way down by jumping from
block to block. The name is a platform, each project is a platform showing only
its thumbnail, every skill tag is a platform, and a portal at the bottom takes
you back to the top.

It replaces the 3D walk-around showroom (M0–M11, see §5), and it keeps a plain,
game-free page alongside it for anyone who would rather just read.

### The problem this exists to solve

The starting point was a fork of Shehab ElGendy's portfolio. **8 of the 14
projects here also appear on his site**, with the same screenshots and the same
one-line product descriptions. Two things set this one apart:

1. **The form.** A page you play, not a scrolling card grid.
2. **The attribution.** A `role` line on every project saying what *you* built.
   All 14 are written from Youssef's own account.

### Design constraints held throughout

| Constraint | Why |
|---|---|
| The page is real HTML | Readable at first paint, selectable, crawlable, and still a page with JavaScript off |
| One content source of truth | The level and the plain page both come from `src/data/` |
| Never invent attribution | `role` stays `null` rather than guessing from an employer-level CV |
| A fast, game-free route | `classic.html`: one request, prints as a CV |
| Verify, don't assume | The model is checked headlessly; reachability is checked on the real laid-out page in Chrome |

---

## 2. Current state

**Stack**: Vite 8.2 · vanilla JS · Three.js r185 (the robot only) · Plyr 3.8 (the video player only)
**Physics engine**: none. One-way platforms stepped by hand in `src/game/physics.js`
**Tests**: 14/14 headless (`npm test`) · 20/20 in-browser over CDP (`npm run verify`)
**Deployed**: the live site at <https://youssefsayed88.github.io> is still the
showroom until the `platformer` branch is merged into `main` and pushed. `main` deploys through GitHub
Actions, and the deploy is gated on `npm test`.

### Routes

- **`index.html`**: the platformer. The level markup is generated from the data at
  build time, so it is in the page before any script runs. A **front door** covers
  it first and asks which portfolio: Interactive or Basic. Nothing is built, and
  the robot is not downloaded, until Interactive is picked; then the door fades
  and the robot drops in. No loading screen. The door is skipped by `?play`
  (what classic.html and the 404 page link with), `?project=`, and old
  `?showroom` links, and it never shows without JavaScript.
- **`classic.html`**: the plain page, generated from the same data. It is reached
  from the **Basic Portfolio** button in the corner and from the level's footer.

`?project=<id>` works on both routes. On the platformer it stands the robot on
that thumbnail with the panel open. On the plain page it scrolls to that project's
card.

### How the level works

```
  markup.js ──build──▶ index.html  (every block carries data-platform)
                          │
             Level.js measures each block's rect  ─── re-measured on resize / font load
                          │
  input ──▶ physics.js (one-way platforms, swept landing) ──▶ body {x, y, on, …}
                          │                          │
                 Camera.js scrolls the page    Avatar.js moves the robot
                                               (Robot.js: Three.js in a small canvas)
```

- **Platforms are the top edges of real elements**, measured relative to the level
  itself, so scrolling never moves them. You land on a platform from above and
  pass through it from below. **Down** drops through the platform underfoot. The
  ground is `data-solid`.
- **Landing is a sweep** from last frame's feet to this frame's, so a
  terminal-velocity fall at 20fps cannot tunnel through a thin skill tag.
- **The camera is the scroll position.** The robot is inside the level, so it
  scrolls with the blocks it stands on, with no lag between them. While playing,
  `html.is-playing` hands the scroll to the camera.
- **The movement model** is the showroom's, carried over in pixels: exponential
  run easing, asymmetric gravity, cut on release, coyote time, jump buffer, and
  the leapfrog launch correction. The jump apexes at 220 px at every frame rate.
- **Resizing** re-measures the page and keeps the robot on the block it was
  standing on, at the same fraction of the way along it.

### Projects: a speech bubble, then the panel

Landing on a thumbnail outlines it, and the **robot speaks** about it. A chat
bubble pops up over the robot's head, tail pointing down at it: a moment of
typing dots (`TYPING`, 0.35 s), then the title, the wing and company, the role
line, and an Open button.

- The bubble follows the robot as it walks along the thumbnail.
- Near a wall it slides to stay inside the level; the tail still points at the robot.
- The camera keeps it on screen, below the corner controls and, on touch, with
  the feet clear of the touch controls.

Opening the project takes one more step:

- press **E**,
- click the bubble's Open button (or the thumbnail itself, without playing at all),
- tap **Open** on touch,
- or **stand still** for `DWELL` (1.4 s), while a bar along the bubble fills.

Closing the panel does not re-open it while you are still standing on the same
thumbnail. The panel plays video in **Plyr**, which is loaded the first time a
video panel opens. Its icon sprite is self-hosted and its CDN "blank video" is
overridden, so **no request leaves the site**. If Plyr fails to load, the browser's
own controls remain.

### The layout is a set of jumps, in both directions

The body clears 220 px. The reach audit counts on 85% of that (`CLIMB_HEIGHT` =
187 px) and on 85% of the horizontal arc. It asks three questions of every
platform:

1. Can you get to it from the top?
2. Can you get from it down to the portal?
3. **Can you climb from it back up to the top?**

The third question is what shapes the page. You can only climb onto a platform
from something less than a jump below its top, so a tall block is a wall from
underneath. That's why nothing on the page is tall:

| Section | Shape |
|---|---|
| About | Name (spawn), role line, the summary one sentence per platform, contact chips |
| Wing shelves | 4 columns on desktop, 3 below 860 px, 2 below 560 px. Every other column sits **half a row lower**, written as a percentage margin of the column width so it holds at any width. The column count keeps a thumbnail under ~140 px tall, and that plus a section gap is the tallest step on the page |
| Headings | At least 60% wide (or 22 rem), so each reaches under the lowest thumbnail of the shelf above it and leaves room at its end to fall past |
| Experience | Company line, then one platform per bullet, stacked straight down |
| Education | One line per entry |
| Skills | One column. Every tag is a platform |
| Ground | Full level width, solid, with the portal door standing on it |

`scripts/verify-browser.mjs` audits the real layout at **17 widths from 360 to
1440 px**, covering every breakpoint from both sides. At every width, all 72
platforms pass all three questions.

### Payload

| Asset | Raw | Gzip |
|---|---|---|
| `index.html`, level markup included | 17.4 kB | 4.8 kB |
| Game JS (blocks nothing; page already painted) | 34.6 kB | **12.3 kB** |
| Game CSS | 16.6 kB | 4.6 kB |
| Robot chunk (Three.js + GLTFLoader), after first paint, WebGL only | 617 kB | 157 kB |
| `character.glb` | 464 kB | — |
| Plyr JS + CSS + sprite, first video panel only | 150 kB | 40 kB |

Before this change, the showroom needed **207 kB of engine plus 774 kB of Rapier
WASM** (gzip) before a first step. The platformer is playable after 12 kB of script.

---

## 3. M12: from showroom to platformer

Decisions, as answered by Youssef on 2026-09-14:

| Question | Answer |
|---|---|
| Keep a game-free version? | Yes, as now: `classic.html`, linked from the corner and the footer |
| The character | Keep the robot for now |
| Landing on a project | Card first, then E / click / Open / stand still to open the panel |
| Video player | A library: Plyr |
| Skills | Every skill tag is its own platform |
| Getting back up | A tappable portal at the bottom that returns you to the top |
| Layout | Free to change as the game needs |
| The 3D showroom | Delete it (it stays in git history) |

### What was removed

The corridor and rooms (`Level`, `layout`, `World`, `ProjectKiosk`, `Sign`,
`surfaces`, `textures`, `Materials`), the Rapier character controller
(`Player`, `Physics`), the orbit camera, `Experience`, `Renderer`, `Sizes`, the
front door, the loading screen, the rotate-to-landscape panel (`Orientation`),
`physics-smoke.mjs`, `scripts/ground-stick.mjs`, and the dependencies
`@dimforge/rapier3d`, `@dimforge/rapier3d-compat` and `vite-plugin-wasm`.

### What carried over

- `Character.js` (now `src/robot/`) and the matcap generator.
- The movement model's devices and their tests, rewritten in pixels.
- `Audio.js`, with new jump, landing, target and portal sounds.
- `TouchControls.js`: the stick now runs sideways and a firm pull down drops
  through a platform. Jump is the big button.
- `Modal.js`, which now mounts Plyr.
- `zoom.js`, `Time.js`, `Emitter.js`, deep links, and the owner-data injection in
  `vite.config.js`.

A phone held upright now suits the game, so there is no rotate screen.

### Found while building it

| Issue | Cause / fix |
|---|---|
| Plyr would call its CDN twice per panel | Default `iconUrl` and `blankVideo` both point at cdn.plyr.io. The sprite is bundled and the blank video is `data:,`. The browser suite asserts no request leaves the site |
| `plyr/dist/plyr.svg` would not resolve | Plyr's `exports` map publishes the CSS but not the sprite. It is imported by file path instead |
| Two smoke checks failed against a correct model | The tap test ignored the frame of rise before the release registers. The reach test put its target level with the ground, and the ground won the tie. Both were test fixes, not model fixes |
| The browser scripts could not reach `vite preview` | It bound only `::1` on this machine. The scripts now pass `--host 127.0.0.1` and use that origin |
| Phone: the controls hint covered the robot at spawn | Too little sky above the name for the corner row, section label and two-line hint. The level's top padding is 12.5 rem under 560 px, and the hint hides while a card is up |
| Phone: Plyr's seek bar was a stub | The volume slider and PiP are hidden under 620 px. Mute stays |

---

## 3b. M13: climbable, plainer, and projects that talk

Requested on 2026-09-14, after playing the first version:

| Request | What changed |
|---|---|
| Be able to jump back up to an earlier platform | The audit gained a third question: can every platform climb back to the top? It is checked at 17 widths. Platforms were made short to pass it (§2), and the jump was raised from 190 to 220 px |
| A much simpler look than the sci-fi one | Light paper and ink, with one warm accent taken from the robot. Plain ledge lines; no glow, blur or uppercase labels; the portal is a plain arched door. Every colour is a token in `:root`, so a dark variant is a few lines |
| Make the popup look like the project is talking | `src/ui/Bubble.js` and `src/game/bubble.js`: a chat bubble over the robot's head (§2). The screen-fixed card is gone |
| Stop the scrollbar flickering over the video | Reproduced, then fixed; see below |

**The flicker, reproduced before it was fixed.**

- **Cause:** the whole panel scrolled, and the video inside it was sized to the
  panel's width.
- **Trigger:** with the video playing and the mouse moving over it, Plyr's
  controls added 4 px of overflow each time they appeared.
- **Loop:** at 1280×870 and 1920×950 the content sat within a few pixels of the
  panel's height limit. Those 4 px brought in a scrollbar, which narrowed the
  video from 858 to 843 px. Then the overflow went away, the scrollbar went with
  it, and the cycle repeated: 80 to 97 size changes in 15 seconds of normal
  viewing.
- **Fix:** the video now sits outside anything that scrolls, capped in height.
  Only the text below it scrolls, and its scrollbar space is always reserved.
- **Guard:** the browser suite plays the video, sweeps the mouse over it at four
  screen sizes, and requires a single layout state throughout.

**Also found:** a held jump from a bullet overshoots the line directly above and
lands two platforms up. That is correct physics (a tap is the one-line hop). The
first draft of the check asserted otherwise, so the check was wrong, not the game.

**The plain page, restyled to match.** `classic.html` uses the same paper, ink
and orange tokens. They are copied into `scripts/build-classic.mjs`, because that
page is meant to cost one request. It also borrows the platformer's marks: an ink
line along the top of each project card, like the ledges, and the same orange
outline for a deep-linked card.

---

## 4. Next phases

- **Merge and deploy.** Nothing above is live yet. The work is on the
  `platformer` branch. Fast-forward `main` to it and push, and the Pages workflow
  deploys it.
- **If light is the wrong direction**, a dark variant means swapping the `:root`
  tokens in `src/style.css` and the matching ones at the top of the CSS in
  `scripts/build-classic.mjs`.
- **Test on a real phone.** The joystick, drop-through pull, Jump and Open buttons
  are verified in an emulated 390×844 viewport, which proves the wiring but not
  the ergonomics. Highest-risk area.
- **Replace the robot** when there is art for a character of your own. Only
  `src/robot/` changes. `Robot.js` scales whatever `Character.js` loads to
  `PLAYER_HEIGHT`.
- **Plain page video.** `classic.html` still links to the raw `.mp4`. Plyr could
  play it inline there too. This was asked but not yet answered.
- **Robot chunk**: 157 kB gzip is Three.js for one character. A lighter renderer
  (or a sprite sheet baked from the model) would remove it. Vite's chunk-size
  warning is about this file.
- **Favicon** is still the showroom's floor plan.
- **Analytics**: still none, deliberately. A cookieless counter needs no consent
  banner. **Shehab's `G-95G4Y8NTMR` must never be copied.**
- Optional: replace the Ballpop! and Whack-a-Hole art (itch thumbnails);
  `scripts/encode-images.mjs` makes it a one-command job.

## 5. History: the showroom (M0–M11)

The first version was a 3D building: a corridor with three wings, kiosks per
project, Rapier physics, a top-down orbit camera, an animated robot, touch
controls, a front door asking which portfolio you wanted, and a
rotate-to-landscape screen. Its milestones, bug table and measurements are in
this file's git history (`git show 5d41c5a:PROJECT.md`). The parts that outlived
it are listed in §3.

## 6. Known debt

- **68 MB of video in git history**, the cost of self-hosting. Moving to
  YouTube/Drive is one line per project, since `Modal.js` embeds any
  non-`.mp4/.webm` URL.
- **ffmpeg on this machine is from 2013.**
- No linter or formatter.
- **Email and phone are plain `mailto:`/`tel:` links on public pages**, so they
  can be scraped. That may be the intent for a job hunt; it is listed as a
  decision, not a defect.
- `scripts/encode-images.mjs` still sizes images with the kiosk screen in mind.
  The thumbnails are smaller, so its output is simply generous.

---

## 7. Running it

```bash
npm run dev       # regenerates classic.html, then serves on :5173
npm test          # 14 headless checks: movement, platforms, reach model, markup, bubble placement, rail
npm run verify    # builds, then drives real Chrome over CDP: 19 checks
npm run build     # -> dist/
npm run classic   # regenerate classic.html only

node scripts/capture-og.mjs                        # re-shoot the share card (after a build)
node scripts/encode-images.mjs <src> <dest.webp>   # add a project screenshot
```

**Controls**: ← → / A D to run · **shift** to sprint · space / W / ↑ to jump
(hold for higher) · ↓ / S to drop through · **E** to open what you are standing
on · Esc to close.
Touch: stick to run (push past the rim to sprint, pull down to drop), **Jump**
and **Open** buttons.
Gamepad: stick or d-pad, A jumps, X opens, down drops, L3 or left trigger sprints.

### Where things live

| Path | Purpose |
|---|---|
| `src/data/projects.js` | **Single source of truth.** Owner details, wings, all 14 projects |
| `src/data/profile.js` | CV content: summary, experience, education, skills |
| `src/level/markup.js` | The level as HTML, from the data. Pure; injected by `vite.config.js` |
| `src/game/movement.js` | The movement model and its constants, in px. Pure |
| `src/game/physics.js` | One-way platforms, drop-through, swept landing. Pure |
| `src/game/reach.js` | Can the body get from one platform to another? The layout audit, in both directions. Pure |
| `src/game/bubble.js` | Where the chat bubble goes over the robot's head. Pure |
| `src/game/Level.js` | Measures `[data-platform]` elements; re-measures on reflow |
| `src/game/Game.js` | The loop: input → physics → card / dwell → avatar → camera; portal; deep links |
| `src/game/Camera.js` | Scroll-position camera |
| `src/game/Avatar.js` | The positioned robot element, hidden until the model loads; a capsule only if it never can |
| `src/robot/` | Three.js robot in a small canvas: `Robot.js`, `Character.js`, `matcap.js` |
| `src/ui/Hud.js` · `src/ui/Bubble.js` | Section label and hint · the robot's chat bubble about a project or the portal |
| `src/ui/Rail.js` | The section rail down the right side. A click teleports the robot to that section's first platform. `classic.html` has an inline copy that scrolls smoothly instead |
| `src/ui/Modal.js` · `src/ui/player.js` | Project panel · Plyr setup |
| `src/ui/TouchControls.js` | Joystick, Jump, Open |
| `platformer-smoke.mjs` | Headless checks (`npm test`) |
| `scripts/verify-browser.mjs` | In-browser checks, including reachability at three widths |
| `scripts/build-classic.mjs` | Generates `classic.html`, `sitemap.xml`, `robots.txt` |
| `scripts/capture-og.mjs` | Screenshots the built level into `public/og.jpg` |

Adding a project is one object in `projects.js`: it appears as a thumbnail on its
wing's shelf, and on the plain page. Run `npm run verify` after layout changes.
The reach audit will name any platform nobody can get to.
