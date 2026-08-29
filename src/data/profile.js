// CV content for classic.html. Transcribed from
// YoussefMohamed_MidLevelUnityDev_CV.pdf — nothing here is inferred.
//
// NOTE: the CV filename says "MidLevel" but its body lists Senior Unity
// Developer at Appsinnovate from Dec 2025. The role titles below follow the
// CV body. OWNER.title in projects.js is the headline shown at the top.

export const summary =
  'Unity Developer with 2+ years of experience in multiplayer systems and VR development. ' +
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
  { group: 'Game Development', items: ['Unity', 'Unreal Engine', 'C#', 'C++', 'VR/AR SDKs', 'Shader Graph', 'Profiler', 'Animator', 'URP'] },
  { group: 'AI / ML', items: ['PyTorch', 'TensorFlow', 'NumPy', 'Pandas'] },
  { group: 'Tools', items: ['Git', 'Firebase', 'PlayFab', 'ClickUp', 'SQL'] },
  { group: 'Ways of working', items: ['Agile development', 'Mentoring', 'Technical documentation'] },
]
