// CV content for classic.html, the level and the chatbot. Transcribed from
// YoussefMohamed_MidLevelUnityDev_CV.pdf — nothing here is inferred.
//
// AFTER EDITING THIS FILE, redeploy the chatbot as well as the site:
//
//   git push                            # the site: GitHub Actions rebuilds it
//   cd worker && npx wrangler deploy    # the chatbot: it does NOT redeploy itself
//
// The chatbot's knowledge is this data, bundled into the Cloudflare Worker at
// deploy time (src/chat/context.js). Push without the second step and the site
// shows the new content while the robot still answers from the old.
//
// NOTE: the CV filename says "MidLevel" but its body lists Senior Unity
// Developer at Appsinnovate from Dec 2025. The role titles below follow the
// CV body. OWNER.title in projects.js is the headline shown at the top.

export const summary =
  'Unity Developer with 3+ years of experience in multiplayer systems and VR development. ' +
  'Proven track record of optimizing performance and delivering scalable prototypes, with a ' +
  'solid foundation in computer science and data science.'

export const experience = [
  {
    company: 'Appsinnovate',
    location: 'Cairo, Egypt',
    roles: [{ title: 'Senior Unity Developer', period: 'Dec 2025 – Present' }],
    points: [
      'Developed AR experiences using AR Foundation and WebAR.',
      'Developed learning experiences and mini games for the e-content team.',
      'Maintained published WebGL projects.',
      'Added features to and optimized multiplayer games.',
    ],
  },
  {
    company: 'Genesis Creations',
    location: 'Cairo, Egypt',
    roles: [
      { title: 'Mid-Level Unity Developer', period: 'Jan 2024 – Dec 2025' },
      { title: 'Junior Unity Developer', period: 'Nov 2023 – Dec 2023' },
    ],
    points: [
      'Designed 2+ multiplayer prototypes using Mirror and PUN.',
      'Developed and maintained VR solutions and training applications.',
      'Integrated SDKs and services with published games.',
      'Implemented matchmaking and server allocation using PlayFab services.',
      'Architected custom shaders using Unity Shader Graph.',
      'Wrote GraphQL and REST API calls.',
      'Debugged with tools including the Unity Profiler and logcat.',
      'Developed proof-of-concept projects using Unreal Engine.',
    ],
  },
]

export const education = [
  { title: 'B.Sc. in Computers & AI', org: 'Cairo University', detail: 'GPA 3.21', year: '2023' },
  { title: 'Machine Learning Specialization', org: 'Stanford University (Coursera)', detail: null, year: '2022' },
  { title: 'Game Development with C# and Unity', org: 'Colorado University (Coursera)', detail: null, year: '2020' },
]

export const skills = [
  { group: 'Game Development', items: ['Unity', 'Unreal Engine', 'C#', 'C++', 'VR/AR SDKs', 'Shader Graph', 'Profiler', 'Animator', 'URP', 'Addressables'] },
  { group: 'Multiplayer', items: ['Netcode for GameObjects', 'Photon Fusion', 'Mirror', 'PUN'] },
  { group: 'Platforms', items: ['Android', 'iOS', 'WebGL', 'Meta Quest', 'PC'] },
  { group: 'AI / ML', items: ['PyTorch', 'TensorFlow', 'NumPy', 'Pandas', 'Python tooling'] },
  { group: 'Tools', items: ['Git', 'Basic CI/CD', 'Firebase', 'PlayFab', 'ClickUp', 'SQL'] },
  { group: 'Ways of working', items: ['Agile development', 'Mentoring', 'Technical documentation'] },
]

// Who he is beyond the CV, from his own answers on 2026-09-24. In the first
// person, as he would say it. Not shown on either page: only the chatbot gets
// it, as context, and retells it in the third person.
export const aboutMe = [
  { label: "Who I am", text: "I'm a gamer at heart with a lot of attention to detail, self-aware, and always looking for the next technology to learn." },
  { label: "How I got here", text: 'I wanted to make games from a young age and started tinkering at around 15. What got me properly into it was entering the Ludum Dare game jam with a friend.' },
  { label: "What I enjoy most", text: 'VR and AR, mastering game feel, and shaders.' },
  { label: "Strengths", text: "I'm most confident building VR/AR experiences and multiplayer. Shaders are what I'm working on getting better at now." },
  { label: "Shipped on", text: 'Android, iOS, WebGL, Meta Quest and PC, on Unity versions from 2022 to Unity 6.' },
  { label: "What I'm looking for", text: "A new challenge: mentoring young talent and working on a large indie game. I'm open to any kind of company, remote or on-site, and to relocating." },
  { label: "Long term", text: 'My own studio: a couple of small projects bringing in steady income while we work on the next hit.' },
  { label: "How I work", text: 'Clear communication with the team, sharing my perspective cleanly, and reviewing work and giving feedback.' },
  { label: "Optimisation", text: 'I reach for the Profiler and let the numbers answer: find the bottleneck, fix the small problems, and let the improvements add up.' },
  { label: "Mentoring", text: "I mentored interns at Genesis Creations for a while, without being above them in the hierarchy. I enjoy it, and I want more practice at it." },
  { label: "Hardest problem so far", text: 'Real-time hand-washing recognition in VR-Connect: I captured hand poses as point clouds of joint positions and rotations and matched them as a sequence.' },
  { label: "A lesson learned", text: 'Biohazard Breakout taught me how much passion for the game matters to a team.' },
  { label: "Outside work", text: "Sports and the gym. I play competitive games like Valorant and single-player ones like Dead Cells and Stardew Valley." },
  { label: "Languages", text: 'Arabic (native), English, and a little French.' },
  { label: "Not on this page", text: 'More game-jam games on my itch.io, and Unreal projects and cinematics in Unity and Unreal that are under NDA.' },
]
