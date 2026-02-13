/**
 * Adaptive thinking budget classifier.
 *
 * Maps user message complexity to an Opus 4.6 budgetTokens value,
 * enabling "adaptive thinking as adaptive teaching" — the model
 * thinks harder when the student needs more help.
 */

export type DepthLevel = 'quick' | 'moderate' | 'deep' | 'intensive';

export interface ThinkingBudgetResult {
  budgetTokens: number;
  depthLevel: DepthLevel;
  depthLabel: string;
}

const QUICK_PATTERNS = [
  /^what (did|does|was|is) /i,
  /^when (did|does|was|is) /i,
  /^who (did|does|was|is) /i,
  /^where (did|does|was|is) /i,
  /^at what time/i,
  /^what time/i,
  /^what happened at/i,
  /^recap/i,
  /^summarize/i,
  /^summary/i,
  /^what are the main/i,
  /^list /i,
];

const DEEP_PATTERNS = [
  /\bwhy\b/i,
  /\bhow does\b/i,
  /\bhow do\b/i,
  /\bhow can\b/i,
  /\bexplain\b/i,
  /\bcompare\b/i,
  /\bcontrast\b/i,
  /\bdifference between\b/i,
  /\brelationship between\b/i,
  /\bconnect(ion|ed|s)?\b/i,
  /\bimplications?\b/i,
  /\bwhat if\b/i,
  /\bcould .+ instead\b/i,
];

const INTENSIVE_PATTERNS = [
  /\bthink (deeply|harder|more carefully)\b/i,
  /\bexplore this\b/i,
  /\bgo deeper\b/i,
  /\bI don't understand\b/i,
  /\bI'm confused\b/i,
  /\bthat doesn't make sense\b/i,
  /\bstill don't get\b/i,
  /\bwhat am I missing\b/i,
  /\bbreak (it|this) down\b/i,
];

export function classifyThinkingBudget(
  message: string,
  conversationLength: number,
  learnScore?: { correct: number; total: number },
  mode: 'explore' | 'learn' | 'chat' = 'explore',
): ThinkingBudgetResult {
  // Check intensive signals first (highest priority)
  if (INTENSIVE_PATTERNS.some((p) => p.test(message))) {
    return { budgetTokens: 16000, depthLevel: 'intensive', depthLabel: 'Deep analysis' };
  }

  // Post-wrong-answer boost in learn mode
  if (learnScore && learnScore.total > 0) {
    const accuracy = learnScore.correct / learnScore.total;
    if (accuracy < 0.5) {
      return { budgetTokens: 12000, depthLevel: 'intensive', depthLabel: 'Adapting to you' };
    }
  }

  // Long conversation signals accumulated complexity
  if (conversationLength > 6) {
    if (DEEP_PATTERNS.some((p) => p.test(message))) {
      return { budgetTokens: 12000, depthLevel: 'intensive', depthLabel: 'Deep analysis' };
    }
  }

  // Deep patterns
  if (DEEP_PATTERNS.some((p) => p.test(message))) {
    return { budgetTokens: 8000, depthLevel: 'deep', depthLabel: 'Thinking carefully' };
  }

  // Multi-clause questions (contain commas, "and", semicolons suggesting compound questions)
  const clauseCount = (message.match(/,|;|\band\b|\bor\b|\bbut\b|\balso\b/gi) || []).length;
  if (clauseCount >= 2 || message.length > 200) {
    return { budgetTokens: 8000, depthLevel: 'deep', depthLabel: 'Thinking carefully' };
  }

  // Quick patterns
  if (QUICK_PATTERNS.some((p) => p.test(message))) {
    return { budgetTokens: 1024, depthLevel: 'quick', depthLabel: 'Quick recall' };
  }

  // Short simple messages default to moderate
  if (message.length < 50) {
    return { budgetTokens: 3000, depthLevel: 'moderate', depthLabel: 'Considering' };
  }

  // Default for medium-length messages
  return { budgetTokens: 5000, depthLevel: 'moderate', depthLabel: 'Considering' };
}
