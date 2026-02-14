import type { ChannelConfig } from './types';

/**
 * All 44 channels across 4 tiers.
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
    .filter(c => ['math_cs'].includes(c.category) || ['3Blue1Brown', 'Khan Academy', 'Professor Leonard', 'The Organic Chemistry Tutor', 'StatQuest', 'Krista King Math', 'Michael Penn', 'Numberphile'].includes(c.name))
    .map(c => c.id)
);
