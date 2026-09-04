# Youssef Mohamed — Portfolio Showroom

Status document. Last updated 2026-09-04, at commit `1a49fc0` (27 commits),
plus the uncommitted M11 work described below.

---

## 1. The target

A portfolio you walk around in — a small 3D showroom in the spirit of
[bruno-simon.com](https://bruno-simon.com), built to be **recognisably yours rather
than your team lead's**.

### The problem this exists to solve

The starting point was a fork of Shehab ElGendy's portfolio
(`Desktop/ShehabElGendy.github.io-main`). You worked together, so you share most of
a project list. **8 of the 14 projects here also appear on his site**, with the same
screenshots and the same one-line product descriptions.

A visitor comparing the two would see near-identical galleries. Two things fix that:

1. **The form.** A walkable showroom instead of a scrolling card grid.
2. **The attribution.** A `role` line on every project saying what *you* built.

The second matters more than the first. **It is now done** — all 14 written from
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
**Size**: 35 source files, ~5,500 lines (app + scripts + tests)
**Tests**: 22/22 headless physics + layout checks · 19/19 in-browser checks over CDP
**Deployed**: **yes** — <https://youssefsayed88.github.io>, from `main` via GitHub Actions

### What the site is

A front door onto two parallel routes over the same data:

- **`index.html`** — asks which portfolio you want, then, if you pick the showroom,
  fetches the engine and starts it. A corridor with three rooms off it, walked in
  top-down view; each project is a kiosk you approach and open.
- **`classic.html`** — generated at build time from the same data. Fast, crawlable,
  printable, and the automatic fallback when WebGL is missing.

`?project=<id>` and `?showroom` both skip the front door: each is a link that has
already answered its question.

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
14 projects
roles filled  14 / 14     ← 13 on 2026-08-30, Football is Life on 2026-09-04
images        14 / 14     ← 13 on 2026-09-01, Football is Life on 2026-09-04
videos         7 / 14     ← the 7 that had footage; the rest never had any
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
| Boot JS (blocks first paint, incl. the front door logic) | 3.3 kB | **1.49 kB** |
| Engine chunk (Three + app + GLTFLoader) | 863 kB | 207 kB |
| Rapier WASM (parallel, cacheable) | 2,021 kB | 774 kB |
| `character.glb` (fetched after first paint) | 464 kB | — |
| `classic.html` (CSS inlined, one request) | 23.1 kB | 6.5 kB |
| `og.jpg` share card (2400×1260) | 274 kB | — |
| CV PDF (linked, never auto-fetched) | 95 kB | — |
| Video (7 files, self-hosted) | 68 MB | — |
| **`dist/` total** | **72 MB** | — |

Runtime: 49 draw calls, ~4,020 triangles, 0 console errors. The level shell is
still 8 of those; the character's 14 skinned meshes account for most of the rest.
Surface maps are generated at boot rather than downloaded: 3 canvases, 6 textures.

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

- **`og.jpg`, generated from the level.** `scripts/capture-og.mjs` boots the built
  site in headless Chrome, poses the player in the Games wing, drops the camera out
  of the gameplay pitch, captions it with `OWNER.name`/`OWNER.title` and captures
  2400×1260. Regenerate it and the card always matches the real rooms — including
  the character, who now stands in it. (It was a PNG until M8 made that a 2 MB
  file; see the bug table.)
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

### M8 — The character, the surfaces and the phone

Three things that had each been standing in for something better.

**An animated character replaces the capsule.** `character.glb` is
"RobotExpressive" by Tomás Laulhé, CC0, from the three.js examples — 464 kB, and
chosen mostly because its three materials are flat untextured colours, so they
convert to matcap exactly and the character shades under the same no-lights model
as everything else. A typical free PBR rig would have meant adding lights for one
object. `Character.js` blends `Idle`/`Walking`/`Running` by the speed the
*solver* produced — walk into a wall and the stride stops, because
`resolveVelocity` has already folded the velocity back. Clip playback is scaled
by speed over a reference ground speed, so the feet do not skate at 12.4 m/s. The
`Jump` clip is never advanced by the mixer: it is posed by hand at one frame
while rising and another while falling, so a long fall holds a falling pose
instead of running off the end of a one-second clip. The GLB is fetched after
first paint and the greybox capsule stays until it lands — and permanently if it
never does.

**Surfaces.** `surfaces.js` generates one height field per material and derives
both an albedo (`map`, which multiplies the matcap) and a `normalMap` (which
perturbs the normal it samples) from that same field — so the joint you can see
is the joint that catches the light. Floors get one-metre tiles, walls one-metre
panels on two-metre courses, the dais a finer grid. Nothing is downloaded.

The part that actually mattered: **UVs are projected in world space**, by
dominant face normal, in `TEXTURE_SCALE` metres. `BoxGeometry` ships 0..1 UVs per
face, so the 104-metre corridor floor and a 0.7-metre kiosk plinth would each
have got exactly one tile. Projecting by metres instead means tiles run
continuously across the seams of the merged mesh, and a wall panel is the same
size wherever it lands. Anisotropy comes from the renderer's real limit, because
a tiled floor at a ~54-degree pitch is the textbook case for it.

**Touch controls, rebuilt.** What was there — drag the left half to walk, the
right half to look — reads fine in a design document and fails on a phone:
nothing on screen says it exists, there is no thumb rest and no feedback, and the
two invisible halves have a seam down the middle you find by walking the wrong
way. Jumping was not reachable at all.

| Control | Behaviour |
|---|---|
| Floating joystick | The base jumps to wherever the thumb lands in a large bottom-left zone. Fixed bases are the main reason a mobile stick feels wrong — a thumb never lands twice on the same pixel |
| Analogue speed | Deflection *is* the speed, so the stick walks as well as it runs |
| Sprint | Push *past* the rim, at `SPRINT_AT` = 1.25 radii. `Input` and the ring that lights read the one exported constant, so they cannot drift apart |
| Open button | The E key's counterpart, driven by the same prompt signal the HUD gets — so it is never a dead control someone taps at nothing |
| Jump button | Held, not tapped, so it feeds the same edge-triggered buffer the spacebar does, and coyote time still applies |
| The canvas | Now means one thing on every device: drag to look |

They appear on a coarse pointer, or on the first touch on a hybrid — a Windows
laptop should not get a joystick for owning a touchscreen. On touch the HUD's
centre column moves to the top of the screen, because the bottom is where both
thumbs are and the stick was landing on top of the kiosk prompt.

### M9 — The jump, the share surface, and the last of the drift

Seven things, found by reviewing the deployed site rather than the plan.

**The jump was three bugs wearing one constant.** It fired perfectly every time,
which is why it had survived: the fault was entirely in what it did afterwards.
Measured in a real browser over CDP it rose **1.47 m and hung for 0.75 s** — a
body height, in a building whose tallest obstacle is a 1.0 m kiosk plinth — and
a **tap and a one-second hold produced the same height to within 6 mm**. There
was no variable jump height at all, so the control had exactly one output. And
it sat badly against the walk beside it, which reaches full speed in 150 ms and
stops in 110: the ground movement was crisp and the air movement was floaty.

The model moved into `movement.js` as `stepJump`, next to the walk, which is what
let the test suite drive it. Three standard devices, none exotic:

| Change | Detail |
|---|---|
| Asymmetric gravity | −26 rising, −42 falling. The arc spends its time near the ground where it can be read, instead of hanging at the top |
| Cut on release | Letting go while still rising halves what is left of it, so a tap is a 0.28 m hop and a hold is a 1.11 m jump. Applied ONCE, on the release edge, so it cannot depend on frame rate |
| Lower apex | 1.11 m, sized to clear the plinths. Airtime 0.52 s against the old 0.75 |

Writing the test found a **fourth** bug that predated all of it: the jump was
**higher on a slow machine** — 1.24 m at 30fps against 1.14 m at 120 — because
the takeoff frame moved at the full launch speed before gravity had been applied
even once. That is the same frame-rate dependence the walk's `1 - e^-kt` easing
exists to avoid, left in the one part of the movement model with no test on it.
Half a step of gravity taken off the launch is the standard leapfrog correction
and closes it: every rate now apexes within **1 mm** of the same height.

**The camera stops jamming at kiosks.** Pulling the boom in was the only answer
the rig had to a blocked view, and at a kiosk in the front half of a room that is
the wrong one — the orbit sits behind the south wall, the ray clamps to the 3 m
floor, and the character fills the frame at the exact moment the screen behind
them is the point. It now walks the pitch up from wherever the player left it and
takes the **shallowest** angle that clears, going *over* the wall; the ceilings
were removed for the top-down view, so up is always clear. Distance clamping
stays as the fallback. Verified at 0.62 rad (the shallowest the player can go)
two metres off a wall: the boom holds 17 m where it used to collapse to 3.

**`?project=<id>` deep-links a single kiosk.** The showroom places the player at
that kiosk with the camera already there — no swoop — and opens its panel;
`classic.html` answers the same parameter by scrolling to that card and
highlighting it; and `main.js` carries the query through the no-WebGL redirect,
which it previously dropped. Opening any panel writes the parameter back with
`replaceState`, so the address bar is always a link to what is on screen.
A stale id lands in the corridor rather than on an error.

**A CV, and the last of the title drift.** `index.html` said "Unity Game
Developer" while `classic.html` derived "Senior Unity Developer" from `OWNER` —
the two routes of the same site introduced their owner differently. Title,
description and the CV link are now injected from `OWNER` by the same plugin that
already injected the absolute URLs. `OG_IMAGE` is new and holds the share card's
logical size and scale in one place, because `capture-og.mjs` rendered at
1200×630 and doubled it while the meta tags declared 1200×630 — **the card was
advertising a quarter of its own pixels**.

**Two missing screenshots, and one blurb that argued with itself.** Biohazard
Breakout and Novel Visualisation were the only two kiosks still on a generated
placeholder. `scripts/encode-images.mjs` borrows headless Chrome's canvas as a
WebP encoder (the ffmpeg on this machine is from 2013 with no libwebp), 1 MB PNG
→ 30 kB. The AR Rewards Hunt blurb said "scan your surroundings" directly above a
role line describing geolocation-anchored placement.

**Video panels no longer open black.** `preload="metadata"` is right for 3–21 MB
files most visitors will never play, but on its own it reads as a broken video
rather than a paused one. The project's own screenshot is now the `poster` — it
is already being downloaded for the kiosk, so it costs nothing.

**And the modal stopped cropping its own pictures.** `object-fit: cover` at 16:9
suits the grid on `classic.html`, where rows have to align, but in a single panel
it threw away a row and a half of the Novel Visualisation collage. Images there
now keep their own shape, which is the rule the kiosk screen already followed.

### M10 — A fourteenth project, and the phone held the right way up

**Football is Life.** A first-person striker game built end to end and published
to CrazyGames — the first project here that is entirely Youssef's from design to
release, and the newest by a year. It leads the Games wing, which now holds six
kiosks; `kioskPlacements` redistributes the U around the room, so adding it was
one entry in `projects.js` and nothing else. The 1080p capture was re-encoded
with the same constants `encode-videos.mjs` uses (38 MB → 6 MB), and the cover
art arrived as AVIF, a type `encode-images.mjs` had no MIME entry for.

**Landscape, insisted on as far as the web allows.** The camera looks down a
104-unit corridor; in portrait it sees a wall. There is no API that pins a page
to landscape — `screen.orientation.lock()` is refused outside fullscreen
everywhere it exists, and Safari on iOS does not implement it at all — so this is
both halves of the honest version: a full-screen panel raised by a CSS media
query, `(orientation: portrait) and (pointer: coarse)`, plus a button that does
the fullscreen-then-lock dance where the platform offers it. `pointer: coarse` is
what keeps the panel off a desktop window someone dragged tall and narrow.

The panel is markup in `index.html` rather than something JavaScript builds, so
it is up from the first paint — over the loading screen, before the 800 kB engine
behind it has arrived. `Orientation.js` does only the parts CSS cannot: pause the
world, and drop whatever direction the joystick was holding when the phone was
turned. `Experience.paused` became a getter over `panelOpen || portrait`, because
the two reasons to pause must not clear each other — closing a project panel
while the phone is still upright would otherwise start the game running behind
the rotate screen.

**Zoom, refused — on the showroom only.** Three pieces, because no single one
works everywhere: `user-scalable=no, maximum-scale=1` in the viewport tag for
Chrome on Android; `touch-action: manipulation` for double-tap; and `gesture*`
listeners in `src/ui/zoom.js` for Safari on iOS, which has ignored `user-scalable`
since iOS 10 and delivers pinches to the page as those events instead.
`classic.html` deliberately keeps its zoom — that page is a document someone
reads, and a recruiter who needs to magnify it must be able to. The showroom is a
game whose canvas already reads a drag as a look, and where a zoomed viewport
pushes the joystick and the Open button off an edge that cannot be scrolled back.

Verified on an emulated phone over CDP: portrait raises the panel and reports
`paused: true`, landscape hides it and resumes, and it survives the round trip.

### M11 — A front door, and the corner controls stood up

**The showroom stopped being compulsory.** Landing on the site started a 3D
building whether or not that was what the visitor came for, and the way out was
a corner button they had to notice while it loaded. `index.html` now asks:
**Interactive Portfolio** or **Basic Portfolio**, named, described and costed
("needs a landscape screen · a moment to load" against "loads instantly · works
anywhere · prints"). Neither is the other's cancel button — a recruiter choosing
the plain page is choosing, not giving up.

The engine moved behind that choice, which is the part with a number attached:
**someone who wants the plain page no longer downloads 868 kB of Three.js and
2 MB of Rapier WASM to be shown a button that takes them away from it.** The
front door is static markup, so it is on screen at first paint with no script
involved, and the `<h1>` is now in the HTML a crawler sees rather than only on
a sign inside the world. The name and title are injected from `OWNER` by the
same plugin that injects the `<title>`, for the reason recorded in M9: this is
exactly the kind of place a second copy of the owner's job title takes root.

Two parameters skip the door, because each is a link that has already answered
it: `?project=<id>`, the shareable form of one kiosk, and `?showroom`, which is
what classic.html's link back now carries — a link that says
which portfolio it means must not be asked again. Both live in
`src/core/params.js`, a module of its own precisely because `main.js` has to
recognise them before the engine that answers them has been fetched;
`build-classic.mjs` interpolates the same constants, so no route can drift from
another over the spelling of a link.

Those two names then turned out to be five separate strings — the two cards,
the corner button that left the showroom, and two links back from classic.html —
so they are now one constant, `ROUTE_NAMES` in the same module. The showroom's
exit had been reading "Skip the game", which named what you were leaving rather
than what you were getting; it says **Basic Portfolio**, the same thing the
front door calls it. classic.html's footer link was also still landing on the
front door while promising the showroom, and now carries `?showroom` like the
one in its header.

`is-showroom` on the body is what tells the stylesheet the game is running. It
gates the HUD, the corner controls and — the one that matters — the
rotate-to-landscape panel, which would otherwise have met a visitor on a
portrait phone with an instruction to turn it before they had been asked whether
they wanted the 3D at all. On that phone the front door now sits upright, both
choices reachable, and the rotate panel appears only after the showroom is
picked. Verified over CDP, in both orientations.

**And the corner controls stack.** Three buttons at twice their old size do not
fit across the top of a phone; laid out as a column they cannot reach the room
label in the opposite corner at any width, which retires the wrapping the row
needed as a guard. A column spends height instead, and on a short viewport the
bottom of it landed on the Jump and Open buttons — two controls overlapping is a
bug, not a crowded corner — so under 560px of height they step back to roughly
their old size. Checked for collisions against the room label, the touch buttons
and the viewport edges at every width from 480px to 1280px.

### Media pipeline
Two scripts, both reading from `projects.js` so neither can drift:
- `scripts/fetch-videos.mjs` — downloads footage, following Drive's >100 MB
  virus-scan interstitial, streaming to disk. No credentials.
- `scripts/encode-videos.mjs` — re-encodes to web sizes. **274 MB → 62 MB (−77%)**,
  worst case VR-Connect at 158 MB → 21 MB. Football is Life was encoded with the
  same settings a clip at a time (38 MB → 6 MB); its cover art came in as AVIF,
  which is why `encode-images.mjs` now knows that type.

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
| **Jumping was impossible on touch** | `Input` set `touchJump = false` in its constructor and nothing ever wrote to it again. Nothing errored; the jump simply did not exist on a phone |
| Sprint fired before the stick reached its rim | The threshold was 0.9 stick-radii — *under* full deflection — so an analogue stick sprinted almost any time it was pushed. Now one exported constant at 1.25, read by both the input and the ring |
| The joystick anchored itself off-screen | Safe-area padding on the touch root did nothing: an absolutely positioned child is laid out against its ancestor's **padding edge**, so the insets had to move onto the pieces themselves |
| **`verify-browser.mjs` was measuring this machine, not the movement** | It sampled speed at a fixed 700ms. Speed ramps in *simulated* time and `Time.delta` is clamped to 1/20, so on a software rasteriser a fixed window catches the ramp half-finished — the checks began failing on a loaded machine with nothing wrong in the app. It now settles on the reading, and counts stability in **rendered frames**: two identical samples with no frame drawn between them prove nothing, which was the first fix's own bug |
| **The share card quintupled to 2 MB** | Not a code bug, a consequence. Flat-shaded walls squeezed into a 376 kB PNG; once every surface carried tile joints and grain there was no flat colour left to run-length away. It is a photograph of a render, so it is now `og.jpg` at 274 kB |

| **The jump had one output** | A tap and a one-second hold rose the same 1.23 m, to within 6 mm. Nothing cut the rise on release, so every press was the maximum one |
| **The jump was higher on a slow machine** | 1.24 m at 30fps against 1.14 m at 120. The takeoff frame moved at the full launch speed before gravity had been applied once — a `v·dt/2` bias. Invisible until there was a test that ran the same press at three frame rates |
| **The camera jammed at kiosks** | Occlusion could only shorten the boom, so a blocked view collapsed to the 3 m floor and filled the frame with the character. The level has no ceilings; pitching up was always available and never tried |
| **The share card advertised a quarter of its pixels** | `capture-og.mjs` renders 1200×630 at `deviceScaleFactor: 2`; the meta tags in two other files declared 1200×630. Three files, one number, no shared constant |
| **The two routes introduced their owner differently** | `index.html` hardcoded "Unity Game Developer"; `classic.html` derived "Senior Unity Developer" from `OWNER.title`. The M7 fix for absolute URLs had not been extended to the title |
| **The no-WebGL redirect dropped the query string** | Only mattered once `?project=` existed — but it sent exactly the visitor least able to go looking to the top of a thirteen-project page |
| **A blurb contradicted the role line under it** | AR Rewards Hunt said "scan your surroundings" above a role describing geolocation-anchored placement at real-world locations |
| **The modal cropped its own pictures** | `object-fit: cover` at 16:9, inherited from the `classic.html` grid where rows must align. In a single panel it cost the Novel Visualisation collage a row and a half |

The character-collision one is the reason `walk()` despawns: characters collide
with each other, and the leak was masking results across the whole suite.

---

## 5. Next phases

### Phase 6 — Content

1. ~~Write 13 `role` lines.~~ **Done.** See the header of `projects.js`.
2. ~~Two screenshots: Biohazard Breakout, Visualising Novels with Generative AI.~~
   **Done, 2026-09-01.** Both encoded through `scripts/encode-images.mjs`.
3. ~~The AR Rewards Hunt blurb contradicts its own role line.~~ **Done.**
4. *(Optional)* Replace the Ballpop! and Whack-a-Hole art — both are itch thumbnails
   (280×500 and 347×195). Tower of Hanoi came at original resolution.
   `encode-images.mjs` now makes this a one-command job if the originals turn up.

### Phase 7 — Ship it ✅

**Done.** Live at <https://youssefsayed88.github.io>, deploying from `main` via
GitHub Actions, gated on `npm test`. `OWNER.site` matches the deploy URL, so the
share card, canonical and sitemap all resolve.

The one thing to remember: **every absolute URL still comes from `OWNER.site`**.
If the site ever moves, that one line is the change — and a wrong value means
share previews silently render blank rather than erroring.

### Phase 8 — Polish

- **Analytics.** Deliberately still none, and now the only thing standing between
  the site being live and knowing whether anyone opens it or bounces at the
  loading bar. A cookieless counter needs no consent banner. Deferred pending
  credentials. **Shehab's `G-95G4Y8NTMR` must never be copied.**
- **Test on a real phone.** The joystick, the sprint push, the Open and Jump
  buttons and the safe-area insets are exercised in an emulated 390×844 viewport
  by real `PointerEvent`s over CDP, which proves the wiring rather than the
  ergonomics. Thumb reach and button size still want a real hand. Highest-risk
  remaining area — and the jump retune means the Jump button now wants a second
  look too.
- ~~The camera jams to `MIN_DISTANCE` at a kiosk.~~ **Fixed in M9** — it pitches
  over the wall instead. Regression-checked at the shallowest pitch two metres
  off a wall.
- ~~Deep-link a project (`?project=lu-run`).~~ **Done in M9**, on both routes.
- Fill the corridor's dead space in top-down view — an outer apron floor, or a
  tighter camera in narrow spaces.
- Minimap or wing overview — the top-down view makes this natural.
- **First load is still ~1 MB gzip before you can take a step** — 208 kB of
  engine and 774 kB of Rapier WASM, for a level made entirely of axis-aligned
  boxes. This is the largest remaining cost to a recruiter on mobile data. A
  custom Rapier build claws back 200–300 kB; replacing it with a hand-rolled AABB
  controller removes it entirely, but `physics-smoke.mjs` is built around Rapier
  and that is a real project rather than a tidy-up.

### Phase 9 — Optional depth

- Per-project case studies rather than one-line blurbs.
- ~~A downloadable CV PDF.~~ **Done in M9** — `public/`, linked from both routes,
  path held in `OWNER.cv`. Note the file in the repo ROOT is still named
  `YoussefMohamed_MidLevelUnityDev_CV.pdf`; only the published copy was renamed,
  because the headline says Senior and the CV body agrees with the headline.
- Trim the Rapier WASM with a custom build (774 kB gzip; maybe 200–300 kB back).

---

## 6. Known debt

- **`@dimforge/rapier3d-compat` is a second copy of Rapier**, kept in devDependencies
  because Node cannot run Vite's WASM-ESM transform for the test. Both are 0.20.0.
- **ffmpeg on this machine is from 2013.** It works, but a modern build gives better
  quality per byte on exactly the files being shrunk.
- **68 MB of video in git history** — the cost of self-hosting. Switching to
  YouTube/Drive is one line per project; `Modal.js` already renders a bare
  `.mp4`/`.webm` inline and anything else as an iframe.
- No linter or formatter.
- **Email and phone are in plain `mailto:`/`tel:` markup on a public page**, so
  they are scrapeable. That may well be the intent for a job hunt — it is listed
  here as a decision to have made deliberately, not as a defect.
- The CV in the repo root is still `YoussefMohamed_MidLevelUnityDev_CV.pdf`. Only
  the copy under `public/` was renamed. Regenerating the CV means updating both.

---

## 7. Running it

```bash
npm run dev       # regenerates classic.html, then serves on :5173
npm test          # 22 headless physics + layout checks, no browser needed
npm run verify    # builds, then drives real Chrome over CDP: 18 checks
npm run build     # -> dist/
npm run classic   # regenerate classic.html only

# One-offs
node scripts/capture-og.mjs                        # re-shoot the share card
node scripts/encode-images.mjs <src> <dest.webp>   # add a project screenshot
node scripts/ground-stick.mjs                      # the evidence for GROUND_STICK
```

**Deep links** — `?project=<id>` opens a single kiosk, and works on both routes:
`/?project=lu-run` walks you to it in the showroom, `/classic.html?project=lu-run`
scrolls to its card. Ids are the `id` field in `projects.js`.

**Controls** — WASD / arrows to move · **shift** to sprint · drag to orbit ·
space to jump (held jumps higher than tapped) · **E** at a kiosk.
Touch: on-screen joystick to walk (push it past the rim to sprint), drag anywhere
else to look, **Jump** and **Open** buttons bottom-right.
Gamepad: sticks, A jumps, X opens, L3 or the left trigger sprints.

### Where things live

| Path | Purpose |
|---|---|
| `src/data/projects.js` | **Single source of truth.** Owner details, wings, all 14 projects |
| `src/data/profile.js` | CV content for `classic.html`. Nothing here is inferred |
| `src/world/layout.js` | Pure level geometry — no THREE, no DOM. Shared with the test |
| `src/world/movement.js` | The whole movement model — walk basis, `SPEED`, and `stepJump` (gravity, coyote, buffer, release cut). Pure; shared with the test |
| `src/core/Camera.js` | Top-down orbit, and the occlusion assist that pitches over walls |
| `scripts/lib/chrome.mjs` | Headless Chrome launch + CDP client, shared by the scripts that need a browser |
| `scripts/encode-images.mjs` | Source screenshot → web-sized WebP, using Chrome's canvas as the encoder |
| `src/world/Materials.js` | Matcap generation and the palette |
| `src/world/surfaces.js` | Procedural tile/panel maps, and the world-space UV projection |
| `src/world/Character.js` | Loads the GLB, converts it to matcap, blends the clips by speed |
| `src/ui/TouchControls.js` | The joystick and the Jump / Open buttons |
| `public/models/README.md` | Where the character model came from, and its licence |
| `src/ui/Modal.js` | Project panel. Plays `.mp4` inline, embeds anything else |
| `src/world/Player.js` | Character controller: momentum, sprint, coyote time, jump buffer |
| `physics-smoke.mjs` | The 14 checks. Drives the real layout and movement through Rapier in Node |
| `scripts/verify-browser.mjs` | Boots the built site in headless Chrome and measures actual walk/sprint speeds |
| `scripts/build-classic.mjs` | Generates `classic.html`, `sitemap.xml`, `robots.txt` |
| `scripts/capture-og.mjs` | Screenshots the built showroom into `public/og.jpg` |

Adding a project is one object in `projects.js`. The room re-spaces its kiosks and
the classic page regenerates automatically. Adding a **wing** is one entry in
`WINGS` — the corridor resizes itself.
