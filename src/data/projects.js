// SINGLE SOURCE OF TRUTH — the 3D showroom and classic.html both render from this.
//
// STATUS OF THE `role` FIELD — all 13 filled, 2026-08-30.
// Written from Youssef's own answers in a project-by-project interview, NOT
// inferred from the CV. `cvHint` is kept as provenance: where a hint pointed at
// something he did not claim, the claim was left out. Three cases worth knowing:
//   - robotics    — cvHint suggested Mirror/PUN networking; he named only the
//                   kart, weapon, power-up and UI work, so no networking claimed.
//   - digito      — cvHint suggested the GraphQL/REST layer; he named only camera
//                   movement and navigation.
//   - biohazard   — cvHint guessed Mirror/PUN; the real stack was the PlayFab SDK.
// Anything added here later should come from him the same way. Do not fill a gap
// from an employer-level CV bullet: that is inventing attribution.
//
// `videoSource` = the file ID the footage was originally pulled from.
// `video` is a path under public/, self-hosted: 62MB total after re-encoding,
// which GitHub Pages carries comfortably and which avoids Drive's iframe,
// its branding and its "too many requests" quota wall. To move to YouTube or
// Drive later, swap the path for the embed URL — Modal.js already renders a
// bare .mp4/.webm inline and anything else as an iframe.

export const OWNER = {
  // The deployed origin, no trailing slash. Share cards need ABSOLUTE urls —
  // LinkedIn, Twitter/X, Slack and WhatsApp all refuse a relative og:image — and
  // the sitemap spec requires absolute <loc>. Everything absolute is derived
  // from this one line, so a move is a one-line change.
  //
  // CHANGE THIS if the site is deployed anywhere other than the user Pages site.
  site: 'https://youssefsayed88.github.io',
  name: 'Youssef Mohamed',
  title: 'Senior Unity Developer',
  tagline: 'Multiplayer systems and VR, shipped on mobile and WebGL.',
  email: 'youssefsayed88@gmail.com',
  phone: '+201227248910',
  location: 'Cairo, Egypt',
  linkedin: 'https://www.linkedin.com/in/youssef-mohamed-759380204/',
  github: 'https://github.com/Youssefsayed88',
  itch: 'https://mr34.itch.io/',
}

// Rebalanced to 3 wings after the Digito and VR-Connect merges left two rooms
// holding a single project each. Adding a wing back is one entry here.
export const WINGS = [
  { id: 'games', label: 'Games' },
  { id: 'xr', label: 'XR & Digital Twins' },
  { id: 'lab', label: 'Lab' },
]

export const projects = [
  // ===== GAMES ===========================================================
  {
    id: 'lu-run',
    wing: 'games',
    title: 'LU RUN',
    blurb: 'Endless runner: secret agent Lu chases an escaped lab monster through a collapsing city.',
    role: 'Revived a Unity 5-era codebase, upgrading the project to a modern Unity version and refactoring it as part of the migration.',
    cvHint: 'Appsinnovate — "Added features and optimized multiplayer games"',
    company: 'Appsinnovate',
    image: 'images/lu-run.webp',
    video: 'videos/lu-run.mp4',
    videoSource: '1jJS54oP1i5j09zQVxZW4ZQ0cwj7-Oljh',
    links: [{ label: 'Play Store', url: 'https://play.google.com/store/apps/details?id=com.appsinnovate.lurun' }],
    tech: ['Unity', 'C#'],
  },
  {
    id: 'sinai-heroes',
    wing: 'games',
    title: 'Sinai Heroes',
    blurb: 'First-person shooter with 50k+ downloads, casting the player as an Egyptian army hero in historical Sinai operations.',
    role: 'Built the team deathmatch mode and the mission 3 artillery barrage system, fixed the tank combat in mission 4, and drove much of the profiling and optimisation.',
    cvHint: 'Listed under your own Technical Projects. Genesis Creations era — SDK integration, PlayFab matchmaking, Profiler/logcat debugging.',
    company: 'Genesis Creations',
    image: 'images/sinai-heroes.webp',
    video: 'videos/sinai-heroes.mp4',
    videoSource: '15xyE3T_DzzRp_Wt69PhqHCvWntsOTyFU',
    links: [
      { label: 'Play Store', url: 'https://play.google.com/store/apps/details?id=com.GenesisCreations.sinaiheroes' },
      { label: 'App Store', url: 'https://apps.apple.com/us/app/sinai-heroes/id6467144418' },
    ],
    tech: ['Unity', 'C#', 'PlayFab'],
  },
  {
    id: 'robotics',
    wing: 'games',
    title: 'Robotics',
    blurb: 'Multiplayer educational game teaching robotics through kart building — bodies, tyres and weapons.',
    role: 'Built the kart customisation system, kart movement, weapon aiming and power-ups, along with the visual effects and UI improvements.',
    cvHint: 'Multiplayer prototypes with Mirror/PUN; "Developed learning experiences and mini games"',
    company: null,
    image: 'images/robotics.webp',
    video: 'videos/robotics.mp4',
    videoSource: '1QNK3hpy1AStBzry5usKmo-jAtabFyUcE',
    links: [],
    tech: ['Unity', 'Multiplayer'],
  },
  {
    id: 'harvest-haulers',
    wing: 'games',
    title: 'Harvest Haulers',
    blurb: 'Idle clicker: harvest resources, upgrade the fleet, automate the farm.',
    role: 'Built the upgrade system and its UI, and fixed bugs across the game.',
    cvHint: 'Appsinnovate — "Developed learning experiences and mini games", "Maintained published webgl projects"',
    company: 'Appsinnovate',
    image: 'images/harvest-haulers.webp',
    video: null,
    videoSource: null,
    links: [{ label: 'Play', url: 'https://playgama.com/game/harvest-haulers' }],
    tech: ['Unity', 'WebGL'],
  },
  {
    id: 'head-ball',
    wing: 'games',
    title: 'Head Ball',
    blurb: 'World Cup 2026 mini game — Egypt vs Argentina in a fast head-ball showdown.',
    role: "Built the game's entire gameplay, end to end.",
    cvHint: 'Appsinnovate — "mini games for e-content team", "Maintained published webgl projects"',
    company: 'Appsinnovate',
    image: 'images/headball.webp',
    video: null,
    videoSource: null,
    links: [{ label: 'Play', url: 'https://appsinnovate.com/en/products/headball' }],
    tech: ['Unity', 'WebGL'],
  },

  // ===== XR & DIGITAL TWINS ==============================================
  {
    id: 'vr-connect',
    wing: 'xr',
    // Shehab's site lists this generically as "Advanced Training and Simulations";
    // VR-Connect is the actual product name, so it leads.
    title: 'VR-Connect',
    blurb: 'VR training simulator that guides and evaluates medical staff on cleaning procedures and compliance with medical standards.',
    role: 'Contributed to the interaction layer, and built the multithreaded pixel-based cleaning system, a point-cloud system that evaluated poses over time, full-body movement integration and the session-management endpoints.',
    cvHint: 'Genesis Creations — "Developed and Maintained VR Solutions and Training Development". Also one of your own listed Technical Projects.',
    company: 'Genesis Creations',
    // This shot is from inside the experience itself, so it stays.
    image: 'images/vr-simulation.webp',
    video: 'videos/vr-connect.mp4',
    videoSource: '1xJIepycbbY_BFpPrHi5mcYXEel8KtL9J',
    links: [],
    tech: ['Unity', 'VR', 'URP'],
  },
  {
    id: 'ar-rewards-hunt',
    wing: 'xr',
    title: 'AR Rewards Hunt',
    blurb: 'AR summer campaign: scan your surroundings to place and collect beach-themed items, unlocking a reward.',
    role: 'Integrated PlayFab for inventory and player management, handing out items by rarity, and improved the geolocation accuracy behind placing objects at real-world locations.',
    cvHint: 'Appsinnovate — "Developed AR experiences using ARFoundation and WebAR". Strongest direct match on the CV.',
    company: 'Appsinnovate',
    image: 'images/ar-rewards-hunt.webp',
    video: 'videos/ar-rewards-hunt.mp4',
    videoSource: '15Z2_ij_KXJ3Cme3_dwrJaRfKCWGEIiOR',
    links: [],
    tech: ['Unity', 'AR Foundation', 'WebAR'],
  },
  {
    id: 'digito',
    wing: 'xr',
    // Shehab's site lists this generically as "Digital Twin Projects";
    // Digito is the actual product name.
    title: 'Digito',
    blurb: 'Digital twin of a real restaurant — view and interact with the space virtually, backed by live data from the real venue.',
    role: 'Built the camera movement and navigation through the virtual space.',
    cvHint: 'Your own listed Technical Project. "Wrote Graphql and REST API calls" likely applies.',
    company: null,
    image: 'images/Digital-Twin.webp',
    video: 'videos/digito.mp4',
    videoSource: '1ivv3SsybwivDc-QBTiKNSkA1nfF5S40e',
    links: [],
    tech: ['Unity', 'GraphQL', 'IoT'],
  },

  // ===== LAB =============================================================
  {
    id: 'biohazard-breakout',
    wing: 'lab',
    title: 'Biohazard Breakout',
    blurb: 'Co-operative survival shooter with a hidden-impostor mechanic.',
    role: 'Built server creation and matchmaking on the PlayFab SDK, proximity voice chat with Vivox, and the weapon-holding animation IK, integrating those weapons into the weapon system.',
    cvHint: 'Your own project. "Designed 2+ multiplayer prototypes using Mirror/PUN" almost certainly covers this.',
    company: null,
    image: null,          // TODO: screenshot needed — check itch.io
    video: null,
    videoSource: null,
    links: [],
    tech: ['Unity', 'Mirror/PUN'],
  },
  {
    id: 'ballpop',
    wing: 'lab',
    title: 'Ballpop!',
    blurb: 'Arcade game where the player keeps the screen from filling up by popping balls and chaining combos. Published to the Play Store.',
    role: 'Built the whole game solo and shipped it to the Play Store.',
    cvHint: 'Your own project, published on itch.io and the Play Store.',
    company: null,
    // 280x500 from the itch.io page; itch does not expose a full-res original.
    // Replace with your source capture if you still have it.
    image: 'images/ballpop.png',
    video: null,
    videoSource: null,
    links: [{ label: 'itch.io', url: 'https://mr34.itch.io/ballpop' }],
    tech: ['Unity', 'C#'],
  },
  {
    id: 'tower-of-hanoi',
    wing: 'lab',
    title: 'Tower of Hanoi',
    blurb: 'A browser build of the classic puzzle, written to exercise recursion alongside architectural and design patterns.',
    role: 'Built solo as an exercise in recursion and architecture, structured around the state and command patterns.',
    cvHint: 'Your own project. Explicitly a patterns/recursion demonstration.',
    company: null,
    image: 'images/tower-of-hanoi.jpg',
    video: null,
    videoSource: null,
    links: [{ label: 'Play (HTML5)', url: 'https://mr34.itch.io/towerofhanoi' }],
    tech: ['Unity', 'C#', 'WebGL'],
  },
  {
    id: 'whack-a-hole',
    wing: 'lab',
    title: 'Whack a Hole To Whack a Mole',
    blurb: 'Game jam entry inverting whack-a-mole: open the hole before the mole appears, and you only get three misses.',
    role: 'Designed and built solo for a game jam.',
    cvHint: 'Your own project, and your first published game.',
    company: null,
    image: 'images/whack-a-hole.png',
    video: null,
    videoSource: null,
    links: [{ label: 'itch.io', url: 'https://mr34.itch.io/holemoled' }],
    tech: ['Unity', 'C#'],
  },
  {
    id: 'novel-viz',
    wing: 'lab',
    title: 'Visualising Novels with Generative AI',
    blurb: 'Graduation project: generative models turning novel scenes into visual representations.',
    role: 'Fine-tuned Stable Diffusion 1.5 and built it into a pipeline with a GPT-2 prompt auto-completion model trained on well-formed Stable Diffusion prompts, plus an upscaling stage.',
    cvHint: 'B.Sc. Computers & AI, Cairo University. Python + generative AI libraries.',
    company: 'Cairo University',
    image: null,          // TODO: screenshot needed
    video: null,
    videoSource: null,
    links: [],
    tech: ['Python', 'PyTorch', 'Generative AI'],
  },
]

export const byWing = (wingId) => projects.filter((p) => p.wing === wingId)

// Videos still awaiting re-host, for scripts/fetch-videos.mjs.
export const pendingVideos = projects
  .filter((p) => p.videoSource && !p.video)
  .map((p) => ({ id: p.id, title: p.title, fileId: p.videoSource }))
