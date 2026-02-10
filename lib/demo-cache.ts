import type { ChalkSpec } from '@/lib/schemas';

interface DemoCacheEntry {
  prompt: string;
  text: string;
  thinking: string;
  spec: ChalkSpec;
}

/**
 * Pre-cached "golden" specs for demo reliability.
 * These render instantly without an API call — used as fallback
 * if the API is slow during video recording.
 */
export const DEMO_CACHE: Record<string, DemoCacheEntry> = {
  'gradient-descent': {
    prompt: 'Visualize gradient descent finding the minimum of a 3D loss surface',
    text: "Gradient descent is like rolling a ball downhill on a landscape of errors. The algorithm starts at a random point and repeatedly steps in the direction of steepest descent — the negative gradient — until it reaches a valley. Here's that loss landscape in 3D — rotate it to see how the surface curves toward the minimum.",
    thinking: "The user wants to visualize gradient descent on a 3D loss surface. I should create a compelling 3D surface that has a clear minimum — a paraboloid or bowl shape works well. I'll use exp(-(x^2 + y^2)/4) inverted to show a loss landscape, or simply x^2 + y^2 for a clean bowl. Let me also add the gradient descent equation in LaTeX and an insight about why the learning rate matters.\n\nFor the 3D surface, I'll use a more interesting landscape: something with a clear global minimum but some curvature. The function (x^2 + y^2)/8 gives a nice smooth bowl. I'll use blue-to-red coloring to show low-to-high loss values.",
    spec: {
      root: 'c1',
      elements: {
        c1: {
          type: 'vizContainer',
          props: {
            title: 'Gradient Descent: Rolling Downhill on a Loss Surface',
            description: 'The algorithm follows the steepest path to the minimum',
          },
          children: ['eq1', 'surface1', 'text1'],
        },
        eq1: {
          type: 'latex',
          props: {
            expression: '\\theta_{t+1} = \\theta_t - \\alpha \\nabla L(\\theta_t)',
            displayMode: 'block',
            fontSize: 'lg',
          },
        },
        surface1: {
          type: 'plot3d',
          props: {
            expr: '(x^2 + y^2) / 4 + sin(x) * 0.3',
            xDomain: [-5, 5],
            yDomain: [-5, 5],
            colorLow: '#3B82F6',
            colorHigh: '#EF4444',
            resolution: 64,
            height: 450,
            wireframe: false,
            autoRotate: true,
            showAxes: true,
          },
        },
        text1: {
          type: 'textBlock',
          props: {
            content: 'The learning rate \u03B1 controls step size. Too large and you overshoot the minimum. Too small and you crawl. The gradient \u2207L points uphill \u2014 we go the opposite direction to descend.',
            variant: 'insight',
          },
        },
      },
    },
  },

  'fourier-transform': {
    prompt: 'Show me how a Fourier transform decomposes a square wave into sine waves',
    text: "A square wave looks rigid and angular, but it's secretly made of smooth sine waves stacked on top of each other. Fourier's insight: ANY periodic signal can be decomposed into a sum of sine waves at different frequencies. The more harmonics you add, the closer you get to the sharp edges.",
    thinking: "The user wants to see Fourier decomposition of a square wave. I should show the individual harmonics being added together. A square wave is the sum of odd harmonics: sin(x) + sin(3x)/3 + sin(5x)/5 + ... I'll plot several partial sums to show the convergence, plus the individual harmonics.\n\nI'll use a plot2d with:\n1. The first harmonic sin(x)\n2. First 3 harmonics: sin(x) + sin(3x)/3 + sin(5x)/5\n3. First 5 harmonics for a better approximation\nThis visually shows how adding more frequencies sharpens the approximation.",
    spec: {
      root: 'c1',
      elements: {
        c1: {
          type: 'vizContainer',
          props: {
            title: 'Fourier Series: Building a Square Wave from Sine Waves',
            description: 'Each harmonic gets us closer to the sharp edges',
          },
          children: ['eq1', 'plot1', 'text1'],
        },
        eq1: {
          type: 'latex',
          props: {
            expression: 'f(x) = \\frac{4}{\\pi}\\sum_{n=1,3,5,...}^{\\infty} \\frac{1}{n}\\sin(nx)',
            displayMode: 'block',
            fontSize: 'lg',
          },
        },
        plot1: {
          type: 'plot2d',
          props: {
            functions: [
              { expr: 'sin(x)', color: '#3B82F6', label: '1 harmonic', style: 'dashed', weight: 1.5 },
              { expr: 'sin(x) + sin(3*x)/3 + sin(5*x)/5', color: '#8B5CF6', label: '3 harmonics', style: 'dashed', weight: 1.5 },
              { expr: 'sin(x) + sin(3*x)/3 + sin(5*x)/5 + sin(7*x)/7 + sin(9*x)/9 + sin(11*x)/11 + sin(13*x)/13', color: '#EF4444', label: '7 harmonics', weight: 2.5 },
            ],
            xDomain: [-6.28, 6.28],
            yDomain: [-1.5, 1.5],
            showGrid: true,
            height: 400,
          },
        },
        text1: {
          type: 'textBlock',
          props: {
            content: "Notice the Gibbs phenomenon \u2014 those little overshoots near the edges never fully disappear, even with infinite harmonics. It's one of the beautiful quirks of Fourier analysis.",
            variant: 'insight',
          },
        },
      },
    },
  },

  'sin-cos-tan': {
    prompt: 'Plot sin(x), cos(x), and tan(x)',
    text: "Here are the three fundamental trig functions \u2014 sine, cosine, and tangent. Notice how sin and cos are just shifted copies of each other, while tan explodes to infinity wherever cos(x) = 0.",
    thinking: '',
    spec: {
      root: 'c1',
      elements: {
        c1: {
          type: 'vizContainer',
          props: {
            title: 'The Trig Trinity: sin, cos, tan',
            description: 'f(x) = sin(x), cos(x), tan(x)',
          },
          children: ['eq1', 'plot1'],
        },
        eq1: {
          type: 'latex',
          props: {
            expression: '\\tan(x) = \\frac{\\sin(x)}{\\cos(x)}',
            displayMode: 'block',
          },
        },
        plot1: {
          type: 'plot2d',
          props: {
            functions: [
              { expr: 'sin(x)', color: '#3B82F6', label: 'sin(x)', weight: 2.5 },
              { expr: 'cos(x)', color: '#10B981', label: 'cos(x)', weight: 2.5 },
              { expr: 'tan(x)', color: '#EF4444', label: 'tan(x)', style: 'dashed', weight: 2 },
            ],
            xDomain: [-6.28, 6.28],
            yDomain: [-4, 4],
            showGrid: true,
            height: 350,
          },
        },
      },
    },
  },

  'gaussian-bell': {
    prompt: 'Show me a 3D Gaussian bell curve surface',
    text: "The Gaussian is the most important function in all of statistics \u2014 the famous bell curve. In 3D, it forms a beautiful symmetric mound that peaks at the origin and falls off exponentially in every direction. This is the joint distribution of two independent normal variables.",
    thinking: "I need to show the 2D Gaussian in 3D space. The function is exp(-(x^2 + y^2) / (2*sigma^2)). Using sigma=1.5 gives a nice visible bell. I'll use a warm color scheme to make it visually striking \u2014 deep blue at the base to bright gold at the peak.",
    spec: {
      root: 'c1',
      elements: {
        c1: {
          type: 'vizContainer',
          props: {
            title: 'The 3D Gaussian: The Bell Curve in Two Dimensions',
            description: 'The foundation of statistics, beautifully symmetric',
          },
          children: ['eq1', 'surface1', 'text1'],
        },
        eq1: {
          type: 'latex',
          props: {
            expression: 'f(x, y) = e^{-\\frac{x^2 + y^2}{2\\sigma^2}}',
            displayMode: 'block',
            fontSize: 'lg',
          },
        },
        surface1: {
          type: 'plot3d',
          props: {
            expr: 'exp(-(x^2 + y^2) / 4)',
            xDomain: [-5, 5],
            yDomain: [-5, 5],
            colorLow: '#3B82F6',
            colorHigh: '#F59E0B',
            resolution: 64,
            height: 450,
            wireframe: false,
            autoRotate: true,
            showAxes: true,
          },
        },
        text1: {
          type: 'textBlock',
          props: {
            content: 'The height at any point tells you the probability density. 68% of the distribution falls within one standard deviation of the center. The further you go from the peak, the exponentially less likely you are to land there.',
            variant: 'insight',
          },
        },
      },
    },
  },
};

/**
 * Check if a prompt matches a cached demo example.
 * Uses fuzzy matching — checks if the prompt contains key phrases.
 */
export function getDemoCacheEntry(prompt: string): DemoCacheEntry | null {
  const lower = prompt.toLowerCase();

  if (lower.includes('gradient descent') && (lower.includes('3d') || lower.includes('surface') || lower.includes('loss'))) {
    return DEMO_CACHE['gradient-descent'];
  }
  if (lower.includes('fourier') && (lower.includes('square wave') || lower.includes('decompos'))) {
    return DEMO_CACHE['fourier-transform'];
  }
  if (/sin.*cos.*tan|trig.*trinity/i.test(lower)) {
    return DEMO_CACHE['sin-cos-tan'];
  }
  if (lower.includes('gaussian') && lower.includes('3d') || lower.includes('bell') && lower.includes('surface')) {
    return DEMO_CACHE['gaussian-bell'];
  }

  return null;
}
