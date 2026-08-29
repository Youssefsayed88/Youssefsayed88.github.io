// SINGLE SOURCE OF TRUTH — the 3D showroom and classic.html both render from this.
//
// STATUS OF THE `role` FIELD
// Every `role` is still null on purpose. The CV lists achievements per EMPLOYER,
// not per project, so filling these in would mean inventing attribution. Each entry
// carries a `cvHint` with the CV bullets that most plausibly apply — use them as a
// prompt, then replace `role` with one concrete sentence about what YOU built.
// This is the field that separates this portfolio from Shehab's; the rest is shared.
//
// `videoSource` = file ID on the ORIGINAL owner's Drive, pending re-host.
// `video` stays null until the footage lives on an account you control.

export const OWNER = {
  name: 'Youssef Mohamed',
  title: 'Unity Game Developer',
  tagline: 'Multiplayer systems and VR, shipped on mobile and WebGL.',
  email: 'youssefsayed88@gmail.com',
  phone: '+201227248910',
  location: 'Cairo, Egypt',
  // TODO(youssef): the CV hyperlinks did not survive text extraction — paste the URLs.
  linkedin: null,
  github: null,
  itch: null,
}

export const WINGS = [
  { id: 'games', label: 'Games' },
  { id: 'xr', label: 'XR & Simulation' },
  { id: 'twins', label: 'Digital Twins' },
  { id: 'lab', label: 'Lab' },
]

export const projects = [
  // ===== GAMES ===========================================================
  {
    id: 'harvest-haulers',
    wing: 'games',
    title: 'Harvest Haulers',
    blurb: 'Idle clicker: harvest resources, upgrade the fleet, automate the farm.',
    role: null,
    cvHint: 'Appsinnovate — "Developed learning experiences and mini games", "Maintained published webgl projects"',
    company: 'Appsinnovate',
    image: 'images/harvest-haulers.webp',
    video: null,
    videoSource: null,
    links: [{ label: 'Play', url: 'https://playgama.com/game/harvest-haulers' }],
    tech: ['Unity', 'WebGL'],
  },
  {
    id: 'lu-run',
    wing: 'games',
    title: 'LU RUN',
    blurb: 'Endless runner: secret agent Lu chases an escaped lab monster through a collapsing city.',
    role: null,
    cvHint: 'Appsinnovate — "Added features and optimized multiplayer games"',
    company: 'Appsinnovate',
    image: 'images/lu-run.webp',
    video: null,
    videoSource: '1jJS54oP1i5j09zQVxZW4ZQ0cwj7-Oljh',
    links: [{ label: 'Play Store', url: 'https://play.google.com/store/apps/details?id=com.appsinnovate.lurun' }],
    tech: ['Unity', 'C#'],
  },
  {
    id: 'sinai-heroes',
    wing: 'games',
    title: 'Sinai Heroes',
    blurb: 'First-person shooter with 50k+ downloads, casting the player as an Egyptian army hero in historical Sinai operations.',
    role: null,
    cvHint: 'Listed under your own Technical Projects. Genesis Creations era — SDK integration, PlayFab matchmaking, Profiler/logcat debugging.',
    company: 'Genesis Creations',
    image: 'images/sinai-heroes.webp',
    video: null,
    videoSource: '15xyE3T_DzzRp_Wt69PhqHCvWntsOTyFU',
    links: [
      { label: 'Play Store', url: 'https://play.google.com/store/apps/details?id=com.GenesisCreations.sinaiheroes' },
      { label: 'App Store', url: 'https://apps.apple.com/us/app/sinai-heroes/id6467144418' },
    ],
    tech: ['Unity', 'C#', 'PlayFab'],
  },
  {
    id: 'head-ball',
    wing: 'games',
    title: 'Head Ball',
    blurb: 'World Cup 2026 mini game — Egypt vs Argentina in a fast head-ball showdown.',
    role: null,
    cvHint: 'Appsinnovate — "mini games for e-content team", "Maintained published webgl projects"',
    company: 'Appsinnovate',
    image: 'images/headball.webp',
    video: null,
    videoSource: null,
    links: [{ label: 'Play', url: 'https://appsinnovate.com/en/products/headball' }],
    tech: ['Unity', 'WebGL'],
  },
  {
    id: 'robotics',
    wing: 'games',
    title: 'Robotics',
    blurb: 'Multiplayer educational game teaching robotics through kart building — bodies, tyres and weapons.',
    role: null,
    cvHint: 'Multiplayer prototypes with Mirror/PUN; "Developed learning experiences and mini games"',
    company: null,
    image: 'images/robotics.webp',
    video: null,
    videoSource: '1QNK3hpy1AStBzry5usKmo-jAtabFyUcE',
    links: [],
    tech: ['Unity', 'Multiplayer'],
  },
  {
    id: 'biohazard-breakout',
    wing: 'games',
    title: 'Biohazard Breakout',
    blurb: 'Co-operative survival shooter with a hidden-impostor mechanic.',
    role: null,
    cvHint: 'Your own project. "Designed 2+ multiplayer prototypes using Mirror/PUN" almost certainly covers this.',
    company: null,
    image: null,          // TODO: needs a screenshot
    video: null,
    videoSource: null,
    links: [],
    tech: ['Unity', 'Mirror/PUN'],
  },
  {
    id: 'ballpop',
    wing: 'games',
    title: 'Ballpop!',
    blurb: 'Fast-paced arcade game: stop the balls before they flood the screen.',
    role: null,
    cvHint: 'Your own project.',
    company: null,
    image: null,          // TODO: needs a screenshot
    video: null,
    videoSource: null,
    links: [],
    tech: ['Unity', 'C#'],
  },

  // ===== XR & SIMULATION =================================================
  {
    id: 'vr-training',
    wing: 'xr',
    title: 'Advanced Training & Simulations',
    blurb: 'Immersive training environments with realistic physics for industrial scenarios.',
    role: null,
    cvHint: 'Genesis Creations — "Developed and Maintained VR Solutions and Training Development"',
    company: 'Genesis Creations',
    image: 'images/vr-simulation.webp',
    video: null,
    videoSource: '1xJIepycbbY_BFpPrHi5mcYXEel8KtL9J',
    links: [],
    tech: ['Unity', 'VR', 'URP'],
  },
  {
    id: 'ar-rewards-hunt',
    wing: 'xr',
    title: 'AR Rewards Hunt',
    blurb: 'AR summer campaign: scan your surroundings to place and collect beach-themed items, unlocking a reward.',
    role: null,
    cvHint: 'Appsinnovate — "Developed AR experiences using ARFoundation and WebAR". Strongest direct match on the CV.',
    company: 'Appsinnovate',
    image: 'images/ar-rewards-hunt.webp',
    video: null,
    videoSource: '15Z2_ij_KXJ3Cme3_dwrJaRfKCWGEIiOR',
    links: [],
    tech: ['Unity', 'AR Foundation', 'WebAR'],
  },
  {
    id: 'vr-connect',
    wing: 'xr',
    title: 'VR-Connect',
    blurb: 'VR training simulator that guides and evaluates medical staff on cleaning procedures and compliance standards.',
    role: null,
    cvHint: 'Your own project. Genesis Creations VR training work.',
    company: null,
    image: null,          // TODO: needs a screenshot
    video: null,
    videoSource: null,
    links: [],
    tech: ['Unity', 'VR'],
  },

  // ===== DIGITAL TWINS ===================================================
  {
    id: 'digital-twin',
    wing: 'twins',
    title: 'Digital Twin Projects',
    blurb: 'IoT-driven virtual replicas for real-time monitoring, simulation and predictive insight.',
    role: null,
    cvHint: 'Genesis Creations — GraphQL/REST API calls, Unreal POC work.',
    company: null,
    image: 'images/Digital-Twin.webp',
    video: null,
    videoSource: '1ivv3SsybwivDc-QBTiKNSkA1nfF5S40e',
    links: [],
    tech: ['Unity', 'IoT', 'REST'],
  },
  {
    id: 'digito',
    wing: 'twins',
    title: 'Digito',
    blurb: 'Digital twin of a real restaurant — view, interact with, and pull live data from the space virtually.',
    role: null,
    cvHint: 'Your own project. "Wrote Graphql and REST API calls" likely applies.',
    company: null,
    image: null,          // TODO: needs a screenshot
    video: null,
    videoSource: null,
    links: [],
    tech: ['Unity', 'GraphQL', 'IoT'],
  },

  // ===== LAB =============================================================
  {
    id: 'novel-viz',
    wing: 'lab',
    title: 'Visualising Novels with Generative AI',
    blurb: 'Graduation project: generative models turning novel scenes into visual representations.',
    role: null,
    cvHint: 'B.Sc. Computers & AI, Cairo University. Python + generative AI libraries.',
    company: 'Cairo University',
    image: null,          // TODO: needs a screenshot
    video: null,
    videoSource: null,
    links: [],
    tech: ['Python', 'PyTorch', 'Generative AI'],
  },
]

export const byWing = (wingId) => projects.filter((p) => p.wing === wingId)

// Videos still awaiting re-host, for the migration script.
export const pendingVideos = projects
  .filter((p) => p.videoSource && !p.video)
  .map((p) => ({ id: p.id, title: p.title, fileId: p.videoSource }))
