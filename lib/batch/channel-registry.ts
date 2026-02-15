import type { ChannelConfig } from './types';

/**
 * All 107 channels across 4 tiers.
 *
 * Tier 1: ALL videos (small/focused channels)
 * Tier 2: Top 20-30+ by views + recency
 * Tier 3: Top 10-15, keyword-filtered
 * Tier 4: Smart sample (massive channels)
 */
export const CHANNEL_REGISTRY: ChannelConfig[] = [
  // ========== TIER 1 — ALL VIDEOS ==========
  { id: 'UCWN3xxRkmTPphYit3_V47PA', name: 'Andrej Karpathy', handle: '@AndrejKarpathy', tier: 1, category: 'ai_ml', maxVideos: null },
  { id: 'UCLB7AzTwc6VFZrBsO2ucBMg', name: 'Robert Miles AI Safety', handle: '@RobertMilesAI', tier: 1, category: 'safety', maxVideos: null },
  { id: 'UCJZnJGpRDMJMN2lmoeQruxQ', name: '@arjay_the_dev', handle: '@arjay_the_dev', tier: 1, category: 'programming', maxVideos: null },
  { id: 'UCj8shE7aFNdAHPJSjYPRqJg', name: 'The AI Epiphany', tier: 1, category: 'ai_ml', maxVideos: null },
  { id: 'UCD8yeTczadqdARzQUp29PJw', name: 'William Fiset', tier: 1, category: 'math_cs', maxVideos: null },

  // ========== TIER 2 — TOP 20-30+ ==========
  { id: 'UCYO_jab_esuFRV4b17AJtAw', name: '3Blue1Brown', handle: '@3blue1brown', tier: 2, category: 'math_cs', maxVideos: 30,
    forceInclude: ['aircAruvnKk', 'wjZofJX0v4M', 'eMlx5fFNoYc', 'Ilg3gGewQ5U', 'IHZwWFHWa-w'] },
  { id: 'UCZHmQk67mSJgfCCTn7xBfew', name: 'Yannic Kilcher', handle: '@yannickilcher', tier: 2, category: 'ai_ml', maxVideos: 20,
    forceInclude: ['iDulhoQ2pro', 'GIolUzi8V5w', '9b2Vqf3i4fU', '-pLN7jgVdfE'] },
  { id: 'UCMLtBahI5DMrt0NPvDSoIRQ', name: 'ML Street Talk', handle: '@MachineLearningStreetTalk', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UC5_6ZD6s8klmMu9TXEB_1IA', name: 'CodeEmporium', tier: 2, category: 'ai_ml', maxVideos: 25,
    forceInclude: ['JCJk9hoYjJI', '0v0Is3JL834', 'NseBQj16HXE'] },
  { id: 'UCtYLUTtgS3k1Fg4y5tAhLbw', name: 'StatQuest', tier: 2, category: 'math_cs', maxVideos: 30,
    forceInclude: ['5Z9OIYA8He8', 'HMOI_lkzW08', 'J4Wdy0Wc_xQ'] },
  { id: 'UCcIXc5mJsHVYTZR1maL5l9w', name: 'DeepLearning.ai', tier: 2, category: 'ai_ml', maxVideos: 25,
    forceInclude: ['NZJfDf1Vlo4', 'Wyk2-FWp0p0', 'vUeq1z_Y50Y'] },
  { id: 'UCbfYPyITQ-7l4upoX8nvctg', name: 'Two Minute Papers', handle: '@TwoMinutePapers', tier: 2, category: 'ai_ml', maxVideos: 25,
    forceInclude: ['M-5kW_CdKcg', 'zCE3XMRdHMA', '0N5-cEa0ku4'] },
  { id: 'UCHnyfMqiRRG1u-2MsSQLbXA', name: 'Veritasium', handle: '@veritasium', tier: 2, category: 'science', maxVideos: 20,
    forceInclude: ['bB60eKCu5P8', 't4Bo1eS5XRM', 'Iyp-d-s4Zo4'] },
  { id: 'UCsXVk37bltHxD1rDPwtNM8Q', name: 'Kurzgesagt', handle: '@kurzgesagt', tier: 2, category: 'science', maxVideos: 20,
    forceInclude: ['sNhhvQGsMEc', 'NQdJWee9_zQ', 'GJ4Qp2xeRds'] },
  { id: 'UCkw4JCwteGrDHIsyIIKo4tQ', name: 'Nicholas Renotte', tier: 2, category: 'ai_ml', maxVideos: 20,
    forceInclude: ['O18sPIcdPXY', 'q2c-UIjGuhw', 'hwxj4eYjfTc'] },
  { id: 'UCnVzApLJE2cRIsHAOIo6Weg', name: 'Data School', tier: 2, category: 'ai_ml', maxVideos: 25,
    forceInclude: ['tiTXi0vv7E4', 'DVRQoVRUFaE', 'DRtcH-SOZm4'] },
  { id: 'UC2D2CMWXMOVWx7giW1n3LIg', name: 'Lexica AI News', tier: 2, category: 'ai_ml', maxVideos: 20,
    forceInclude: ['RjG9ppzn5gM', 'vdV2HeHkbgQ', '4HMZkq1yu1s'] },
  { id: 'UC7_gcs09iThXybpVgjHZ_7g', name: 'PBS Space Time', handle: '@pbsspacetime', tier: 2, category: 'science', maxVideos: 20 },
  { id: 'UC6107grRI4m0o2-emgoDnAA', name: 'SmarterEveryDay', tier: 2, category: 'science', maxVideos: 15,
    forceInclude: ['cMEo3N0FGrw', '6YwMzgkC0Hk', '_cZTWzBz9X0'] },
  { id: 'UC_mYaQAE6-71rjSN6CeCA-g', name: 'NeetCode', handle: '@NeetCode0', tier: 2, category: 'programming', maxVideos: 30 },
  { id: 'UC4SVo0Ue36XCfOyb5Lh1viQ', name: 'Bro Code', handle: '@BroCodez', tier: 2, category: 'programming', maxVideos: 25 },
  { id: 'UCoHhuummRZaIVX7bD4t2czg', name: 'Professor Leonard', tier: 2, category: 'math_cs', maxVideos: 25 },
  { id: 'UCCezIgC97PvUuR4_gbFUs5g', name: 'Corey Schafer', handle: '@coreyms', tier: 2, category: 'programming', maxVideos: 30 },
  // NEW: AI/ML Tier 2
  { id: 'UCZCFT11CWBi3MHNlGf019nw', name: 'Welch Labs', handle: '@WelchLabsVideo', tier: 2, category: 'ai_ml', maxVideos: 25 },
  { id: 'UCNJ1Ymd5yFuUPtn21xtRbbw', name: 'AI Explained', handle: '@ai-explained-', tier: 2, category: 'ai_ml', maxVideos: 25 },
  { id: 'UCoBvAPy3AHPLw3Nfzu_zsyg', name: 'Matthew Berman', handle: '@matthew_berman', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UCFM6oCMMjhN36vGbcm-p-Ig', name: 'Weights & Biases', handle: '@WeightsBiases', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UCrjtKRgkliZWjNWRlsE_9qQ', name: 'AI Coffee Break with Letitia', handle: '@AICoffeeBreak', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UCv83tO5cePwHMt1952IVVHw', name: 'James Briggs', handle: '@jamesbriggs', tier: 2, category: 'ai_ml', maxVideos: 25 },
  // NEW: Systems/Low-level Tier 2
  { id: 'UC0p5jTq6Xx_DosDFxVXnWaQ', name: 'fasterthanlime', handle: '@fasterthanlime', tier: 2, category: 'programming', maxVideos: 20 },
  { id: 'UC_iD0xppBwwsrM9DegC5cQQ', name: 'Jon Gjengset', handle: '@jonhoo', tier: 2, category: 'programming', maxVideos: 25 },
  { id: 'UC6biysICWOJ-C3P4Tyeggzg', name: 'Low Level Learning', handle: '@LowLevelLearning', tier: 2, category: 'programming', maxVideos: 25 },
  { id: 'UC6nSFpj9HTCZ5t-N3Rm3-HA', name: 'No Boilerplate', handle: '@NoBoilerplate', tier: 2, category: 'programming', maxVideos: 20 },
  { id: 'UCEUGDUdEpxLEZYOjCkXBMmA', name: 'Hussein Nasser', handle: '@hnasr', tier: 2, category: 'programming', maxVideos: 25 },
  // NEW: Math Tier 2
  { id: 'UC1_uAIS3r8Vu6JjXWvastJg', name: 'Mathologer', handle: '@Mathologer', tier: 2, category: 'math_cs', maxVideos: 20 },
  { id: 'UCSju5G2aFaWMqn-_0YBtq5A', name: 'Stand-up Maths', handle: '@standupmaths', tier: 2, category: 'math_cs', maxVideos: 25 },
  { id: 'UCrlZs71h3mTR45FgQNINfrg', name: 'Mathemaniac', handle: '@mathemaniac', tier: 2, category: 'math_cs', maxVideos: 20 },
  { id: 'UCxiWCEdx7aY88bSEUzainYQ', name: 'Zach Star', handle: '@ZachStar', tier: 2, category: 'math_cs', maxVideos: 20 },
  { id: 'UC9rTsvTxJnx1DNrDA3Rqa6A', name: 'Dr. Trefor Bazett', handle: '@DrTrefor', tier: 2, category: 'math_cs', maxVideos: 30 },
  // NEW: Data Science Tier 2
  { id: 'UCNU_lfiiWBdtULKOw6X0Dig', name: 'Krish Naik', handle: '@krishnaik06', tier: 2, category: 'ai_ml', maxVideos: 25 },
  { id: 'UCiT9RITQ9PW6BhXK0y2jaeg', name: 'Ken Jee', handle: '@KenJee1', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UC2UXDak6o7rBm23k3Vv5dww', name: 'Luke Barousse', handle: '@LukeBarousse', tier: 2, category: 'ai_ml', maxVideos: 20 },
  { id: 'UC7cs8q-gJRlGwj4A8OmCmXg', name: 'Alex The Analyst', handle: '@AlexTheAnalyst', tier: 2, category: 'ai_ml', maxVideos: 25 },

  // ========== TIER 3 — TOP 10-15, KEYWORD-FILTERED ==========
  { id: 'UCsBjURrPoezykLs9EqgamOA', name: 'Fireship', handle: '@Fireship', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['explained', '100 seconds', 'AI', 'machine learning'] },
  { id: 'UC8ENHE5xdFSwx71u3fDH5Xw', name: 'ThePrimeagen', handle: '@ThePrimeTimeagen', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['systems', 'performance', 'architecture'] },
  { id: 'UCoxcjq-8xIDTYp3uz647V5A', name: 'Numberphile', handle: '@numberphile', tier: 3, category: 'math_cs', maxVideos: 15,
    keywords: ['prime', 'infinity', 'proof', 'pi', 'topology'] },
  { id: 'UC9-y-6csu5WGm29I7JiwpnA', name: 'Computerphile', handle: '@Computerphile', tier: 3, category: 'math_cs', maxVideos: 15,
    keywords: ['AI', 'safety', 'neural', 'Rob Miles'] },
  { id: 'UC6jM0RFkr4eNQtFiSwE5qwg', name: 'Michael Penn', tier: 3, category: 'math_cs', maxVideos: 15,
    keywords: ['topology', 'Riemann', 'algebra', 'proof'] },
  { id: 'UC4JX40jDee_tINbkjycV4Sg', name: 'Tech With Tim', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['python', 'AI', 'machine learning'] },
  { id: 'UCWX3yGbODI6PoE1zK9Ual0Q', name: 'Abdul Bari', tier: 3, category: 'math_cs', maxVideos: 15,
    keywords: ['algorithm', 'sorting', 'graph', 'dynamic programming'] },
  { id: 'UC29ju8bIPH5as8OGnQzwJyA', name: 'Traversy Media', handle: '@TraversyMedia', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['javascript', 'react', 'node', 'python', 'crash course'] },
  { id: 'UCWv7vMbMWH4-V0ZXdmDpPBA', name: 'Programming with Mosh', handle: '@programmingwithmosh', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['python', 'javascript', 'java', 'react'] },
  { id: 'UCFbNIlppjAuEX4znoulh0Cw', name: 'Web Dev Simplified', handle: '@WebDevSimplified', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['javascript', 'react', 'css'] },
  { id: 'UCvjgXvBlbQINdrneIFnn3aw', name: 'The Coding Train', handle: '@TheCodingTrain', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['algorithm', 'neural', 'genetic', 'coding challenge'] },
  { id: 'UCRPMAqdtSgd0cpjTN5bMB_w', name: 'Gaurav Sen', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['system design', 'distributed', 'cache', 'load balancer'] },
  { id: 'UCUHW94eEFW7hkUMVaZz4eDg', name: 'MinutePhysics', handle: '@minutephysics', tier: 3, category: 'science', maxVideos: 15,
    keywords: ['quantum', 'relativity', 'physics'] },
  { id: 'UCjPimgBGkNt47tVafuDyPUw', name: 'Krista King Math', tier: 3, category: 'math_cs', maxVideos: 15,
    keywords: ['calculus', 'linear algebra', 'differential equations'] },
  // NEW: AI/ML Tier 3
  { id: 'UC55ODQSvARtgSyc8ThfiepQ', name: 'Sam Witteveen', handle: '@samwitteveenai', tier: 3, category: 'ai_ml', maxVideos: 15,
    keywords: ['LLM', 'GPT', 'prompt engineering', 'AI agents'] },
  { id: 'UCP7jMXSY2xbc3KCAE0MHQ-A', name: 'Dave Ebbelaar', handle: '@daveebbelaar', tier: 3, category: 'ai_ml', maxVideos: 15,
    keywords: ['python', 'AI', 'data science', 'LLM'] },
  { id: 'UCm1aLz-2Jnkq6kcpzhA2MhA', name: 'AssemblyAI', handle: '@AssemblyAI', tier: 3, category: 'ai_ml', maxVideos: 15,
    keywords: ['NLP', 'speech', 'audio', 'AI'] },
  // NEW: Design/Frontend Tier 3
  { id: 'UCJZv4d5rbIKd4QHMPkcABCw', name: 'Kevin Powell', handle: '@KevinPowell', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['CSS', 'responsive', 'grid', 'flexbox'] },
  { id: 'UCW9pyonagDWGMCy7V_Kro6g', name: 'Hyperplexed', handle: '@Hyperplexed', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['CSS', 'animation', 'creative coding'] },
  { id: 'UCVyRiMvfUNMA1UPlDPzG5Ow', name: 'DesignCourse', handle: '@DesignCourse', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['UI', 'UX', 'design', 'frontend'] },
  { id: 'UCRdHEVfNjBFhTWK_OvBZJhQ', name: 'Juxtopposed', handle: '@juxtopposed', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['UI', 'design', 'creative coding'] },
  // NEW: Rust/Go/Systems Tier 3
  { id: 'UC7Fs1WM7T1J7e5WpJjp62Ww', name: "Let's Get Rusty", handle: '@letsgetrusty', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['rust', 'systems', 'ownership', 'borrow checker'] },
  { id: 'UCG_gbao0kQ2vdAqJMuQ79vg', name: 'Anthony GG', handle: '@anthonygg_', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['go', 'golang', 'backend', 'microservices'] },
  { id: 'UC2eYFnH61tmytImy1mTYvhA', name: 'Dreams of Code', handle: '@dreamsofcode', tier: 3, category: 'programming', maxVideos: 15,
    keywords: ['rust', 'go', 'neovim', 'terminal'] },

  // ========== TIER 4 — SMART SAMPLE ==========
  { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman', handle: '@lexfridman', tier: 4, category: 'ai_ml', maxVideos: 10,
    keywords: ['AI', 'Anthropic', 'ML', 'deep learning'],
    forceInclude: ['Mde2q7GFCrQ', 'QB-tppuG5-0'] },
  { id: 'UCEBb1b_L6zDS3xTUrIALZOw', name: 'MIT OpenCourseWare', handle: '@mitocw', tier: 4, category: 'math_cs', maxVideos: 8,
    keywords: ['linear algebra', 'ML', 'deep learning', 'probability'] },
  { id: 'UCBcRF18a7Qf58cCRy5xuWwQ', name: 'Stanford Online', handle: '@stanfordonline', tier: 4, category: 'ai_ml', maxVideos: 8,
    keywords: ['CS229', 'CS224N', 'CS231N', 'deep learning'] },
  { id: 'UCfzlCWGWYyIQ0aLC5w48gBQ', name: 'Sentdex', tier: 4, category: 'ai_ml', maxVideos: 10,
    keywords: ['neural', 'ML', 'GPT', 'deep learning'],
    forceInclude: ['tPYj3fFJGjk', '5NPugH_E6uM'] },
  { id: 'UC4a-Gbdw7vOaccHmFo40b9g', name: 'Khan Academy', handle: '@khanacademy', tier: 4, category: 'math_cs', maxVideos: 250,
    keywords: ['math', 'calculus', 'algebra', 'statistics', 'CS', 'physics'] },
  { id: 'UCEWpbFLzoYGPfuWUMFPSaoA', name: 'The Organic Chemistry Tutor', tier: 4, category: 'math_cs', maxVideos: 100,
    keywords: ['math', 'physics', 'statistics', 'calculus'] },
  { id: 'UC8butISFwT-Wl7EV0hUK0BQ', name: 'freeCodeCamp', handle: '@freecodecamp', tier: 4, category: 'programming', maxVideos: 50,
    keywords: ['CS', 'ML', 'Python', 'machine learning', 'full course'] },
  // NEW: Startups/Business Tier 4
  { id: 'UCcefcZRL2oaA_uBNeo5UOWg', name: 'Y Combinator', handle: '@ycombinator', tier: 4, category: 'general', maxVideos: 15,
    keywords: ['startup', 'founder', 'funding', 'YC', 'entrepreneur'] },
  { id: 'UC-eTr3kH8M-6jCBhb0C4cRA', name: 'a16z', handle: '@a16z', tier: 4, category: 'general', maxVideos: 10,
    keywords: ['startup', 'VC', 'tech trends', 'AI', 'crypto'] },
  { id: 'UCIgDwxLvg3g2sHv5w6jC62A', name: 'First Round Capital', handle: '@firstround', tier: 4, category: 'general', maxVideos: 8,
    keywords: ['startup', 'founder', 'product', 'growth'] },
  { id: 'UC3O9h0aEtyOlZJLWDKmF5CA', name: 'Sequoia Capital', handle: '@sequoiacap', tier: 4, category: 'general', maxVideos: 10,
    keywords: ['startup', 'VC', 'founder', 'scaling'] },
  { id: 'UCESLZhusAkFfsNsApnjF_Cg', name: 'All-In Podcast', handle: '@allin', tier: 4, category: 'general', maxVideos: 12,
    keywords: ['tech', 'startup', 'markets', 'AI', 'business'] },
  // NEW: General CS/Engineering Tier 4
  { id: 'UCmtyQOKKmrMVaKuRXz02jbQ', name: 'Sebastian Lague', handle: '@SebastianLague', tier: 4, category: 'programming', maxVideos: 12,
    keywords: ['game dev', 'algorithm', 'simulation', 'procedural'] },
  { id: 'UCS0N5baNlQWJCUrhCEo8WlA', name: 'Ben Eater', handle: '@BenEater', tier: 4, category: 'programming', maxVideos: 10,
    keywords: ['computer', 'hardware', 'CPU', '8-bit'] },
  { id: 'UCBDqDX7V8PvdvKNGdZ8sxew', name: 'Tom Scott', handle: '@TomScottGo', tier: 4, category: 'general', maxVideos: 10,
    keywords: ['CS', 'internet', 'tech', 'engineering'] },
  { id: 'UCY1kMZp36IQSyNx_9h4mpCg', name: 'Mark Rober', handle: '@MarkRober', tier: 4, category: 'science', maxVideos: 8,
    keywords: ['engineering', 'science', 'invention'] },
  { id: 'UC3KEoMzNz8eYnwBC34RaKCQ', name: 'Stuff Made Here', handle: '@StuffMadeHere', tier: 4, category: 'science', maxVideos: 8,
    keywords: ['engineering', 'robotics', 'invention', 'machining'] },
];

/** Get all channels for a specific tier */
export function getChannelsByTier(tier: 1 | 2 | 3 | 4): ChannelConfig[] {
  return CHANNEL_REGISTRY.filter(c => c.tier === tier);
}

/** Get all channels for a specific category */
export function getChannelsByCategory(category: ChannelConfig['category']): ChannelConfig[] {
  return CHANNEL_REGISTRY.filter(c => c.category === category);
}

/** Get total estimated video count across all channels */
export function getEstimatedTotalVideos(): number {
  return CHANNEL_REGISTRY.reduce((sum, c) => sum + (c.maxVideos ?? 100), 0);
}

/** Math-heavy channels for LaTeX enrichment */
export const MATH_CHANNEL_IDS = new Set(
  CHANNEL_REGISTRY
    .filter(c => ['math_cs'].includes(c.category) || [
      '3Blue1Brown',
      'Khan Academy',
      'Professor Leonard',
      'The Organic Chemistry Tutor',
      'StatQuest',
      'Krista King Math',
      'Michael Penn',
      'Numberphile',
      'Mathologer',
      'Stand-up Maths',
      'Mathemaniac',
      'Zach Star',
      'Dr. Trefor Bazett'
    ].includes(c.name))
    .map(c => c.id)
);
