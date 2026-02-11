import { formatTimestamp } from './video-utils';

interface SuggestionTemplate {
  text: string | ((ts: string) => string);
  needsTranscript: boolean;
  includesTimestamp: boolean;
  category: 'comprehension' | 'summary' | 'recall' | 'explore';
}

const TEMPLATES: SuggestionTemplate[] = [
  {
    text: (ts) => `Explain what's at ${ts}`,
    needsTranscript: true,
    includesTimestamp: true,
    category: 'comprehension',
  },
  {
    text: 'Break this down simply',
    needsTranscript: true,
    includesTimestamp: false,
    category: 'comprehension',
  },
  {
    text: (ts) => `What did they mean at ${ts}?`,
    needsTranscript: true,
    includesTimestamp: true,
    category: 'comprehension',
  },
  {
    text: 'Summarize so far',
    needsTranscript: true,
    includesTimestamp: false,
    category: 'summary',
  },
  {
    text: 'Key takeaways so far',
    needsTranscript: true,
    includesTimestamp: false,
    category: 'summary',
  },
  {
    text: 'Quiz me on this',
    needsTranscript: true,
    includesTimestamp: false,
    category: 'recall',
  },
  {
    text: (ts) => `What should I know from ${ts}?`,
    needsTranscript: true,
    includesTimestamp: true,
    category: 'recall',
  },
  {
    text: 'What is this video about?',
    needsTranscript: false,
    includesTimestamp: false,
    category: 'explore',
  },
];

/**
 * Pick N diverse suggestions from the template pool.
 * Guarantees at most one per category, resolves timestamp functions.
 */
export function pickSuggestions(
  currentTime: number,
  hasTranscript: boolean,
  count: number = 3,
): string[] {
  const ts = `[${formatTimestamp(currentTime)}]`;

  const eligible = TEMPLATES.filter((s) => {
    if (s.needsTranscript && !hasTranscript) return false;
    if (s.includesTimestamp && currentTime < 5) return false;
    return true;
  });

  // Pick one from each category, shuffled
  const byCategory = new Map<string, SuggestionTemplate[]>();
  for (const s of eligible) {
    const list = byCategory.get(s.category) || [];
    list.push(s);
    byCategory.set(s.category, list);
  }

  const picked: string[] = [];
  const categories = [...byCategory.keys()].sort(() => Math.random() - 0.5);

  for (const cat of categories) {
    if (picked.length >= count) break;
    const pool = byCategory.get(cat)!;
    const item = pool[Math.floor(Math.random() * pool.length)];
    const resolved = typeof item.text === 'function' ? item.text(ts) : item.text;
    picked.push(resolved);
  }

  return picked;
}
