export interface ExamplePrompt {
  label: string;
  prompt: string;
  category: 'calculus' | 'algebra' | '3d' | 'applied' | 'trig' | 'probability';
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  // 3D — demo showstoppers
  {
    label: 'Gradient descent on a loss surface',
    prompt: 'Visualize gradient descent finding the minimum of a 3D loss surface',
    category: '3d',
  },
  {
    label: 'Saddle point surface',
    prompt: 'Show me a saddle point on a 3D surface and explain why optimization gets stuck there',
    category: '3d',
  },
  // Calculus
  {
    label: 'Fourier transform',
    prompt: 'Show me how a Fourier transform decomposes a square wave into sine waves',
    category: 'calculus',
  },
  {
    label: 'Derivatives visually',
    prompt: 'Explain derivatives visually — show the tangent line sliding along a curve',
    category: 'calculus',
  },
  // Trig
  {
    label: 'Sin, cos, and tan',
    prompt: 'Plot sin(x), cos(x), and tan(x) and explain how they relate',
    category: 'trig',
  },
  {
    label: 'Unit circle',
    prompt: 'Show me the unit circle and how sin and cos trace out as the angle changes',
    category: 'trig',
  },
  // Algebra
  {
    label: 'Eigenvalues explained',
    prompt: 'Show me eigenvalues — what does it mean for a vector to be an eigenvector?',
    category: 'algebra',
  },
  {
    label: 'Complex numbers',
    prompt: 'Visualize complex number multiplication as rotation in the complex plane',
    category: 'algebra',
  },
  // Applied / real-world
  {
    label: 'Compound interest',
    prompt: 'How does compound interest actually work? Show me the math behind growing money',
    category: 'applied',
  },
  {
    label: 'Normal distribution',
    prompt: 'Explain the normal distribution — why does everything in nature follow a bell curve?',
    category: 'probability',
  },
  {
    label: 'Exponential growth',
    prompt: 'Why does exponential growth feel so unintuitive? Show me visually',
    category: 'applied',
  },
  {
    label: 'Gaussian bell surface',
    prompt: 'Show me a 3D Gaussian bell curve surface — the foundation of statistics',
    category: '3d',
  },
];

/** Get a shuffled subset of examples for the welcome screen */
export function getWelcomeExamples(count = 6): ExamplePrompt[] {
  // Ensure variety: pick from different categories
  const byCategory = new Map<string, ExamplePrompt[]>();
  for (const ex of EXAMPLE_PROMPTS) {
    const arr = byCategory.get(ex.category) || [];
    arr.push(ex);
    byCategory.set(ex.category, arr);
  }

  const picks: ExamplePrompt[] = [];
  const categories = Array.from(byCategory.keys());

  // Round-robin through categories
  let catIdx = 0;
  while (picks.length < count && picks.length < EXAMPLE_PROMPTS.length) {
    const cat = categories[catIdx % categories.length];
    const arr = byCategory.get(cat)!;
    if (arr.length > 0) {
      const randIdx = Math.floor(Math.random() * arr.length);
      picks.push(arr.splice(randIdx, 1)[0]);
    }
    catIdx++;
  }

  return picks;
}
