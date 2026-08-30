# Youssef Mohamed — Portfolio Showroom

Status document. Last updated 2026-08-29, at commit `7b49beb` (11 commits).

---

## 1. The target

A portfolio you walk around in — a small 3D showroom in the spirit of
[bruno-simon.com](https://bruno-simon.com), built to be **recognisably yours rather
than your team lead's**.

### The problem this exists to solve

The starting point was a fork of Shehab ElGendy's portfolio
(`Desktop/ShehabElGendy.github.io-main`). You worked together, so you share most of
a project list. **8 of the 13 projects here also appear on his site**, with the same
screenshots and the same one-line product descriptions.

A visitor comparing the two would see near-identical galleries. Two things fix that:

1. **The form.** A walkable showroom instead of a scrolling card grid.
2. **The attribution.** A `role` line on every project saying what *you* built.

The second matters more than the first. **It is now done** — all 13 written from
Youssef's own account, project by project.
A recruiter who reads "Multiplayer educational game teaching robotics" learns about
the product. One who reads "built the kart customisation system and the PUN
matchmaking layer" learns about you.

### Design constraints held throughout

| Constraint | Why |
|---|---|
| No lights, no shadow maps | Matcap-only rendering; the reason it runs on a phone |
| One content source of truth | The 3D world and the flat page both read `src/data/projects.js` |
| Never invent attribution | `role` stays `null` rather than guessing from an employer-level CV |
| A fast, crawlable fallback | Recruiters on mobile must never hit a loading bar with no way out |
| Verify, don't assume | Level geometry is checked headlessly; the browser is checked over CDP |

---

## 2. Current state

**Stack**: Vite 8.2 · Three.js r185.1 · Rapier 0.20 (WASM) · vanilla JS, no framework
**Size**: 24 source files, ~2,700 lines
**Tests**: 14/14 headless physics + layout checks · 7/7 in-browser checks over CDP
**Deployed**: no — runs locally only

### What the site is

Two parallel routes over the same data:

- **`index.html`** — the 3D showroom. A corridor with three rooms off it, walked in
  top-down view. Each project is a kiosk you approach and open.
- **`classic.html`** — generated at build time from the same data. Fast, crawlable,
  printable, and the automatic fallback when WebGL is missing.

### The world

```
        ┌──────────┐   ┌──────────────────┐   ┌──────────┐
        │  GAMES   │   │ XR & DIGITAL     │   │   LAB    │
        │    5     │   │ TWINS       3    │   │    5     │
        └────┬─────┘   └────────┬─────────┘   └────┬─────┘
   ══════════╧══════════════════╧══════════════════╧══════════
                          corridor  ~104 units
```

| Wing | Projects |
|---|---|
| **Games** | LU RUN · Sinai Heroes · Robotics · Harvest Haulers · Head Ball |
| **XR & Digital Twins** | VR-Connect · AR Rewards Hunt · Digito |
| **Lab** | Biohazard Breakout · Ballpop! · Tower of Hanoi · Whack a Hole To Whack a Mole · Visualising Novels with Generative AI |

Only the **Lab** wing is absent from Shehab's site. Games and XR overlap almost
entirely — hence the emphasis on `role`.

### Content completeness

```
13 projects
roles filled  13 / 13     ← done, 2026-08-30
images        11 / 13     ← missing: Biohazard Breakout, Novel Visualisation
videos         6 / 13     ← the 6 that had footage; the rest never had any
```

The roles came from an interview, not from the CV. Where a `cvHint` pointed at
something Youssef did not claim, it was left out rather than filled in — Robotics
carries no networking claim, Digito no GraphQL/REST, and Biohazard turned out to be
PlayFab rather than the Mirror/PUN the hint guessed. That restraint is the point:
an invented `role` is worse than an empty one, because it cannot survive a
follow-up question in an interview.

### Payload

| Asset | Raw | Gzip |
|---|---|---|
| Boot JS (blocks first paint) | 2.6 kB | **1.24 kB** |
| Engine chunk (Three + app) | 757 kB | 178 kB |
| Rapier WASM (parallel, cacheable) | 2,021 kB | 774 kB |
| `classic.html` (CSS inlined, one request) | 15.7 kB | 4.3 kB |
| `og.png` share card (2400×1260) | 376 kB | — |
| Video (6 files, self-hosted) | 62 MB | — |
| **`dist/` total** | **65 MB** | — |

Runtime: 29 draw calls, ~1,190 triangles, 0 console errors.

---

## 3. What is finished

### M0 — Scaffold
Vite + Three.js + Rapier project, git repo, folder structure, production build.

### M1 — Walkable world
Rapier `KinematicCharacterController` with autostep, slope limits and snap-to-ground.
Corridor and three rooms generated from data. Level geometry extracted into
`src/world/layout.js` as pure data — no THREE, no DOM — so the headless test drives
the *real* level rather than a copy of its arithmetic.

### M2 — Kiosks and the project modal
One kiosk per project, distributed in a U around each room (the doorway wall is
skipped so no kiosk faces your back on entry). Screens reshape to each image's true
aspect, so portrait captures are not stretched. Missing images get a generated
placeholder; a failed load falls back to the same, so one bad path cannot blank a
room. Nearest kiosk within 2.8 m lights up and drives the HUD prompt; **E** opens a
DOM modal — kept out of WebGL so text stays selectable and links keyboard-reachable.

### M3 — The classic page
`scripts/build-classic.mjs` generates `classic.html` from `projects.js` and
`profile.js`, wired into `npm predev` / `prebuild` so the two **cannot drift**.
Carries projects by wing plus Experience, Education and Skills transcribed from the
CV. Includes a print stylesheet, so it prints as a clean CV.

### M4 — Art pass
Matcaps shaded per-pixel (key light, bounce fill, rim, specular lobe) rather than as
a gradient. Per-wing accent colours — Games cyan, XR violet, Lab amber — carry the
wayfinding across floor strip, doorway uprights, sign and kiosk highlight. Canvas
signs above each doorway. Level geometry merged per material: the whole shell is 8
draw calls instead of one per box.

### M5 — Platform
- Swapped `rapier3d-compat` for `rapier3d` + `vite-plugin-wasm`, and made
  `Experience` a dynamic import. **Blocking JS fell from 1,236 kB gzip to 1.24 kB.**
- Touch (left half walks, right half looks) and gamepad with deadzones.
- Procedural Web Audio: room tone, distance-paced footsteps, kiosk and panel cues.
  No audio files.
- Loading screen, noscript fallback, OG meta, robots.txt, sitemap,
  `prefers-reduced-motion`, safe-area insets.
- GitHub Actions workflow deploying to Pages, gated on `npm test`.

### Post-milestone changes
- **Top-down camera** at ~54°, clamped short of overhead so vertical kiosk screens
  never go edge-on. Ceilings removed; ceiling lights relocated into the floor;
  kiosk panels tilted back to meet the camera.
- **Videos self-hosted** and verified playing in-browser.
- Walk speed 8 m/s.

### M6 — Movement feel
Velocity is now persistent and eased rather than set outright, so the walk has
weight instead of behaving like a cursor.

| Change | Detail |
|---|---|
| Momentum | `stepVelocity` eases toward the target with `1 - e^-kt`, so 30Hz and 144Hz reach top speed in the same wall-clock time. ~150 ms up, ~110 ms down |
| Asymmetric braking | Braking (28) beats acceleration (20). You park at a kiosk far more often than you launch, and a 0.2 m overshoot is the trigger radius missing |
| Wall fold-back | `resolveVelocity` folds the movement the solver *allowed* back into velocity — without it the player keeps running at full speed into a wall and rockets sideways when it ends |
| Sprint | Shift · L3 or left trigger · push a touch drag past full deflection. ×1.55, so 12.4 m/s |
| Speed framing | The camera widens 55° → 60.5° with speed², eased slower than the rig so it trails the acceleration rather than snapping with it |
| Jump forgiveness | 120 ms coyote time, 150 ms input buffer, and edge-triggered so resting on space no longer auto-hops on every landing |

All of it lives in `src/world/movement.js` as pure functions, so `physics-smoke.mjs`
drives the shipped model rather than a copy of its arithmetic — which is what lets
the suite check that a full-speed sprint into the end cap does not tunnel through it.

### M7 — The share surface
The link itself is part of the portfolio: it gets pasted into LinkedIn, a DM and an
email long before anyone loads the WebGL.

- **`og.png`, generated from the level.** `scripts/capture-og.mjs` boots the built
  site in headless Chrome, poses the player in the Games wing, drops the camera out
  of the gameplay pitch, captions it with `OWNER.name`/`OWNER.title` and captures
  2400×1260. Regenerate it and the card always matches the real rooms.
- **Absolute URLs from one constant.** `OWNER.site` drives `og:image`, `og:url`,
  `canonical`, `sitemap.xml` and `robots.txt`. Share cards reject a relative
  `og:image` and the sitemap spec rejects a relative `<loc>` — both were previously
  relative, so **`twitter:card` was set to `summary_large_image` with no image at
  all**, and the sitemap was inert.
- `index.html` gets its absolute tags injected by a `transformIndexHtml` plugin
  (the build uses a relative `base` for subpath hosting, so they cannot be static);
  `classic.html` and the crawl files are generated by `build-classic.mjs`. One
  constant, four outputs, no drift.
- **A favicon**: the showroom's own floorplan, three wings in their wayfinding
  colours over the corridor.

### Media pipeline
Two scripts, both reading from `projects.js` so neither can drift:
- `scripts/fetch-videos.mjs` — downloads footage, following Drive's >100 MB
  virus-scan interstitial, streaming to disk. No credentials.
- `scripts/encode-videos.mjs` — re-encodes to web sizes. **274 MB → 62 MB (−77%)**,
  worst case VR-Connect at 158 MB → 21 MB.

---

## 4. Bugs found and fixed

Recorded because several were invisible without deliberate verification.

| Bug | Cause |
|---|---|
| Player fell through the floor on spawn | Spawn `z=12`; corridor floor ended at `z=11.5` |
| Character drifted through walls | Physics stepped *before* the kinematic move was queued; a skipped step left `computeColliderMovement` reading a stale position |
| **W and S inverted** | Forward is the *negation* of the camera offset; the sign was flipped |
| **Camera rendered a blank grey field** | No occlusion handling — an 8.5-unit rig in a 9-wide corridor settled outside the wall. Hidden by screenshots taken mid-lerp |
| Scene near-black | Matcap ambient tuned blind at 0.26–0.34 |
| Dais read as a glowing slab | Reused `trim`, which is tuned bright for thin baseboards |
| Wing signs faced into empty rooms | `rotationY: Math.PI` pointed them away from the corridor |
| `classic.html` rows ragged | `aspect-ratio` on a flex-column container loses to the image's intrinsic height |
| `classic.html` built twice | Vite resolved `<link rel="canonical">` as an asset *and* as an entry |
| **Test harness silently corrupting itself** | `spawnCharacter()` never removed its body, so each check spawned inside the previous one's corpse |

The last one is the reason `walk()` now despawns: characters collide with each
other, and the leak was masking results across the whole suite.

---

## 5. Next phases

### Phase 6 — Content

1. ~~Write 13 `role` lines.~~ **Done.** See the header of `projects.js`.
2. **Two screenshots**: Biohazard Breakout, Visualising Novels with Generative AI.
   Both now have strong `role` lines carrying them, but they are the only two
   kiosks showing a generated placeholder.
3. **The AR Rewards Hunt blurb is now wrong.** It says "scan your surroundings",
   but the work described is geolocation-anchored placement at real-world
   locations. One line to fix in `projects.js`.
3. *(Optional)* Replace the Ballpop! and Whack-a-Hole art — both are itch thumbnails
   (280×500 and 347×195). Tower of Hanoi came at original resolution.

### Phase 7 — Ship it

0. **Set `OWNER.site` in `src/data/projects.js`** if the deploy URL is not
   `https://youssefsayed88.github.io`. Every absolute URL — share card, canonical,
   sitemap — comes from that one line, and a wrong value means share previews
   silently render blank.
0b. **The deploy workflow triggers on `main`; the local branch is `master`.**
   As it stands the first push deploys nothing and reports no error. Rename the
   branch or change the one line in `.github/workflows/deploy.yml`.
1. Create the GitHub repo (`Youssefsayed88.github.io`, or any name with Pages on).
2. Settings → Pages → **Source: GitHub Actions**.
3. `git push`. The workflow runs `npm test`, then `npm run build`, then deploys.
   A broken level fails the deploy rather than shipping.

Note the first push carries **65 MB**, mostly video. Well inside limits, but it is
permanent git history.

### Phase 8 — Polish

- **Test on a real phone.** Touch controls, the sprint gesture and safe-area insets
  are written but verified only on desktop Chrome. Highest-risk untested area.
- Fill the corridor's dead space in top-down view — an outer apron floor, or a
  tighter camera in narrow spaces.
- Minimap or wing overview — the top-down view makes this natural.
- Deep-link a project (`?project=lu-run`) so a single kiosk can be shared.

### Phase 9 — Optional depth

- Per-project case studies rather than one-line blurbs.
- A downloadable CV PDF from `profile.js`.
- Trim the Rapier WASM with a custom build (774 kB gzip; maybe 200–300 kB back).
- Analytics — deliberately none today. **Shehab's `G-95G4Y8NTMR` must never be
  copied**, and his `analytics.js` third-party IP lookup was not carried over.

---

## 6. Known debt

- **`@dimforge/rapier3d-compat` is a second copy of Rapier**, kept in devDependencies
  because Node cannot run Vite's WASM-ESM transform for the test. Both are 0.20.0.
- **ffmpeg on this machine is from 2013.** It works, but a modern build gives better
  quality per byte on exactly the files being shrunk.
- **62 MB of video in git history** — the cost of self-hosting. Switching to
  YouTube/Drive is one line per project; `Modal.js` already renders a bare
  `.mp4`/`.webm` inline and anything else as an iframe.
- No linter or formatter.

---

## 7. Running it

```bash
npm run dev       # regenerates classic.html, then serves on :5173
npm test          # 14 headless physics + layout checks, no browser needed
npm run verify    # builds, then drives real Chrome over CDP: 7 checks
npm run build     # -> dist/
npm run classic   # regenerate classic.html only
```

**Controls** — WASD / arrows to move · **shift** to sprint · drag to orbit ·
space to jump · **E** at a
kiosk. Touch: left half walks (push the drag further to sprint), right half looks.
Gamepad: sticks, A jumps, X opens, L3 or the left trigger sprints.

### Where things live

| Path | Purpose |
|---|---|
| `src/data/projects.js` | **Single source of truth.** Owner details, wings, all 13 projects |
| `src/data/profile.js` | CV content for `classic.html`. Nothing here is inferred |
| `src/world/layout.js` | Pure level geometry — no THREE, no DOM. Shared with the test |
| `src/world/movement.js` | Camera-relative movement basis and `SPEED`. Shared with the test |
| `src/world/Materials.js` | Matcap generation and the palette |
| `src/ui/Modal.js` | Project panel. Plays `.mp4` inline, embeds anything else |
| `src/world/Player.js` | Character controller: momentum, sprint, coyote time, jump buffer |
| `physics-smoke.mjs` | The 14 checks. Drives the real layout and movement through Rapier in Node |
| `scripts/verify-browser.mjs` | Boots the built site in headless Chrome and measures actual walk/sprint speeds |
| `scripts/build-classic.mjs` | Generates `classic.html`, `sitemap.xml`, `robots.txt` |
| `scripts/capture-og.mjs` | Screenshots the built showroom into `public/og.png` |

Adding a project is one object in `projects.js`. The room re-spaces its kiosks and
the classic page regenerates automatically. Adding a **wing** is one entry in
`WINGS` — the corridor resizes itself.
