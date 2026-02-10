export function classifyQuery(query: string): 'fast' | 'deep' | 'creative' {
  const simplePatterns = [
    /^(plot|graph|show)\s+(me\s+)?[a-z]+\([a-z]\)/i,
    /^(what is|what's)\s+\d/i,
    /^(show|draw)\s+the\s+(unit circle|number line)/i,
  ];
  if (simplePatterns.some(p => p.test(query))) return 'fast';

  const creativePatterns = [
    /beautiful|stunning|amazing|wow|impressive|viral|showcase/i,
    /animate|cinematic|dramatic|artistic|creative/i,
    /blow.my.mind|make.it.beautiful|go.all.out/i,
  ];
  if (creativePatterns.some(p => p.test(query))) return 'creative';

  const complexPatterns = [
    /explain|visually|intuition|why|how does|proof|derive/i,
    /fourier|eigen|gradient|transform|theorem|convergence/i,
    /step.by.step|break.down|walk.me.through/i,
  ];
  if (complexPatterns.some(p => p.test(query))) return 'deep';

  return 'deep';
}
