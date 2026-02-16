"use client";

import { useState, useEffect } from "react";
import { HeroColumn } from "./HeroColumn";


// 40 curated educational videos — 5 columns × 8 videos
// Max 2 per channel, no same channel in same column, topic diversity per column
const CURATED_VIDEOS = [
  // Column 1 (scrolls UP) — math, AI, science, creative coding
  [
    {
      videoId: "WUvTyaaNkzM",
      title: "The Essence of Linear Algebra",
      channelName: "3Blue1Brown",
      viewCount: 8200000,
      publishedText: "7 years ago",
      duration: "17:52",
      conversation: {
        question: "What does it actually mean to multiply two matrices?",
        answer:
          "Matrix multiplication is composing transformations, chaining how space gets warped",
        timestamp: "7:24",
      },
    },
    {
      videoId: "kCc8FmEb1nY",
      title: "Let's build GPT from scratch",
      channelName: "Andrej Karpathy",
      viewCount: 9500000,
      publishedText: "2 years ago",
      duration: "1:56:20",
      conversation: {
        question:
          "How do you build a GPT language model from scratch?",
        answer:
          "Start with bigram statistics, add self-attention to let tokens communicate, then stack transformer blocks",
        timestamp: "45:10",
      },
    },
    {
      videoId: "h6fcK_fRYaI",
      title: "The Egg",
      channelName: "Kurzgesagt",
      viewCount: 32000000,
      publishedText: "5 years ago",
      duration: "7:51",
      conversation: {
        question: "What happens after you die in this story?",
        answer:
          "You're reincarnated as every human who ever lived, all of history is your journey toward growing up",
        timestamp: "3:42",
      },
    },
    {
      videoId: "spUNpyF58BY",
      title: "The beauty of Bezier curves",
      channelName: "Freya Holmer",
      viewCount: 2100000,
      publishedText: "3 years ago",
      duration: "11:12",
      conversation: {
        question:
          "How do designers create smooth curves with just a few control points?",
        answer:
          "Bezier curves use recursive linear interpolation between points, creating mathematically smooth paths from simple blending",
        timestamp: "3:18",
      },
    },
    {
      videoId: "sDv4f4s2SB8",
      title: "Gradient Descent, Step-by-Step",
      channelName: "StatQuest",
      viewCount: 2800000,
      publishedText: "5 years ago",
      duration: "9:02",
      conversation: {
        question: "Why does gradient descent actually find the minimum?",
        answer:
          "It follows the steepest downhill slope at each step, adjusting parameters proportionally to how wrong the prediction was",
        timestamp: "4:15",
      },
    },
    {
      videoId: "MFzDaBzBlL0",
      title: "The Backwards Brain Bicycle",
      channelName: "SmarterEveryDay",
      viewCount: 50000000,
      publishedText: "9 years ago",
      duration: "7:57",
      conversation: {
        question: "Why can't you ride a bike with reversed steering?",
        answer:
          "Your brain has deeply wired algorithms for balance that can't just be overwritten, it takes months to relearn",
        timestamp: "3:40",
      },
    },
    {
      videoId: "AuA2EAgAegE",
      title: "e (Euler's Number) - Numberphile",
      channelName: "Numberphile",
      viewCount: 4700000,
      publishedText: "12 years ago",
      duration: "10:42",
      conversation: {
        question: "Why does the number e keep appearing in growth and decay?",
        answer:
          "e is the unique base where the exponential function equals its own derivative, the natural rate of continuous change",
        timestamp: "4:15",
      },
    },
    {
      videoId: "17WoOqgXsRM",
      title: "Coding Challenge: Starfield Simulation",
      channelName: "The Coding Train",
      viewCount: 2000000,
      publishedText: "8 years ago",
      duration: "12:28",
      conversation: {
        question: "How do you simulate depth with just moving dots?",
        answer:
          "Map 3D coordinates to 2D using division by z-depth, then reset stars that pass the camera",
        timestamp: "5:30",
      },
    },
  ],
  // Column 2 (scrolls DOWN) — evolution, dev, physics, creative AI
  [
    {
      videoId: "MHS-htjGgSY",
      title: "Simulating Natural Selection",
      channelName: "Primer",
      viewCount: 12000000,
      publishedText: "5 years ago",
      duration: "10:33",
      conversation: {
        question: "Can evolution emerge from simple rules in a simulation?",
        answer:
          "When creatures compete for food and reproduce based on success, useful traits spread naturally through the population",
        timestamp: "5:20",
      },
    },
    {
      videoId: "pEfrdAtAmqk",
      title: "God-Tier Developer Roadmap",
      channelName: "Fireship",
      viewCount: 7000000,
      publishedText: "2 years ago",
      duration: "11:07",
      conversation: {
        question:
          "What skills actually matter for getting hired as a developer?",
        answer:
          "Master one language deeply, build real projects, understand system design — frameworks change but fundamentals don't",
        timestamp: "6:45",
      },
    },
    {
      videoId: "YuIIjLr6vUA",
      title: "How Electricity Actually Works",
      channelName: "Veritasium",
      viewCount: 16000000,
      publishedText: "2 years ago",
      duration: "19:42",
      conversation: {
        question:
          "Does electricity really flow through wires at the speed of light?",
        answer:
          "Energy propagates through electromagnetic fields around the wire, not through the conductor itself",
        timestamp: "9:12",
      },
    },
    {
      videoId: "Cp5WWtMoeKg",
      title: "Coding Adventure: Ray Marching",
      channelName: "Sebastian Lague",
      viewCount: 4800000,
      publishedText: "5 years ago",
      duration: "20:27",
      conversation: {
        question: "How do you render 3D scenes without polygons?",
        answer:
          "Ray marching steps along each ray using signed distance functions to find surfaces, enabling infinite detail from pure math",
        timestamp: "8:15",
      },
    },
    {
      videoId: "f5liqUk0ZTw",
      title: "What is a Tensor?",
      channelName: "Dan Fleisch",
      viewCount: 4500000,
      publishedText: "12 years ago",
      duration: "12:21",
      conversation: {
        question: "Why do physicists keep talking about tensors?",
        answer:
          "Tensors are objects that stay consistent across different coordinate systems, they describe physics that doesn't depend on your viewpoint",
        timestamp: "6:30",
      },
    },
    {
      videoId: "p_o4aY7xkXg",
      title: "What is Gravity?",
      channelName: "MinutePhysics",
      viewCount: 5000000,
      publishedText: "13 years ago",
      duration: "2:08",
      conversation: {
        question: "What actually causes things to fall?",
        answer:
          "Mass curves spacetime, and objects follow the straightest possible path through that curved geometry",
        timestamp: "1:05",
      },
    },
    {
      videoId: "14zkfDTN_qo",
      title: "AI Learns Locomotion From Scratch",
      channelName: "Two Minute Papers",
      viewCount: 2000000,
      publishedText: "7 years ago",
      duration: "5:09",
      conversation: {
        question:
          "Can an AI figure out how to walk with no instructions?",
        answer:
          "Given only a reward for forward movement, the neural network discovers gaits through trial and error that look eerily biological",
        timestamp: "1:45",
      },
    },
    {
      videoId: "qhbuKbxJsk8",
      title: "Times Tables, Mandelbrot and the Heart of Mathematics",
      channelName: "Mathologer",
      viewCount: 15000000,
      publishedText: "7 years ago",
      duration: "11:05",
      conversation: {
        question: "Why do multiplication tables hide the Mandelbrot set?",
        answer:
          "Connect every number to its multiple on a circle, and the cardioid envelope that emerges is exactly the Mandelbrot boundary",
        timestamp: "5:30",
      },
    },
  ],
  // Column 3 (scrolls UP) — imaginary numbers, AI safety, vision, unsolved, immune, systems
  [
    {
      videoId: "T647CGsuOVU",
      title: "Imaginary Numbers Are Real",
      channelName: "Welch Labs",
      viewCount: 7700000,
      publishedText: "9 years ago",
      duration: "5:47",
      conversation: {
        question:
          "How can a number that doesn't exist on the number line be useful?",
        answer:
          "Imaginary numbers represent rotation in 2D, they're the missing dimension that makes otherwise impossible problems solvable",
        timestamp: "3:05",
      },
    },
    {
      videoId: "ugvHCXCOmm4",
      title: "Dario Amodei: CEO of Anthropic",
      channelName: "Lex Fridman",
      viewCount: 3200000,
      publishedText: "1 year ago",
      duration: "6:38:42",
      conversation: {
        question:
          "What does the CEO of Anthropic think is the biggest risk from AI?",
        answer:
          "The core danger is racing without adequate safety research — Anthropic exists to prove you can push capabilities and safety together",
        timestamp: "2:14:30",
      },
    },
    {
      videoId: "S9JGmA5_unY",
      title: "How Blurs & Filters Work",
      channelName: "Computerphile",
      viewCount: 1800000,
      publishedText: "6 years ago",
      duration: "9:40",
      conversation: {
        question: "What's happening pixel-by-pixel when you blur an image?",
        answer:
          "Each pixel becomes a weighted average of its neighbors, the kernel determines how much each one contributes",
        timestamp: "2:45",
      },
    },
    {
      videoId: "Kas0tIxDvrg",
      title: "The Longest-Standing Math Problem",
      channelName: "Veritasium",
      viewCount: 8000000,
      publishedText: "1 year ago",
      duration: "27:33",
      conversation: {
        question:
          "What makes the Collatz conjecture so deceptively simple yet unsolved?",
        answer:
          "The rule is trivial, halve if even, triple-plus-one if odd, but no one can prove it always reaches 1",
        timestamp: "12:40",
      },
    },
    {
      videoId: "7LKy3lrkTRA",
      title: "Why do calculators get this wrong?",
      channelName: "Stand-up Maths",
      viewCount: 3000000,
      publishedText: "4 years ago",
      duration: "14:49",
      conversation: {
        question: "Why does my calculator say 9.999... instead of 10?",
        answer:
          "Floating point can't represent all decimals exactly, so tiny rounding errors accumulate through each operation",
        timestamp: "7:20",
      },
    },
    {
      videoId: "lXfEK8G8CUI",
      title: "The Immune System Explained",
      channelName: "Kurzgesagt",
      viewCount: 24000000,
      publishedText: "9 years ago",
      duration: "6:47",
      conversation: {
        question:
          "How does your body fight off millions of different pathogens?",
        answer:
          "Your adaptive immune system generates random antibody shapes, then clones whichever one happens to match the invader",
        timestamp: "3:15",
      },
    },
    {
      videoId: "5C_HPTJg5ek",
      title: "Rust in 100 Seconds",
      channelName: "Fireship",
      viewCount: 5500000,
      publishedText: "3 years ago",
      duration: "2:30",
      conversation: {
        question: "What makes Rust different from every other language?",
        answer:
          "The borrow checker enforces memory safety at compile time — no garbage collector, no null pointers, no data races",
        timestamp: "1:10",
      },
    },
    {
      videoId: "R9OHn5ZF4Uo",
      title: "How Machines Learn",
      channelName: "CGP Grey",
      viewCount: 14000000,
      publishedText: "7 years ago",
      duration: "9:48",
      conversation: {
        question:
          "What's actually happening when a bot learns to play a game?",
        answer:
          "It explores random actions, keeps what earns rewards, discards what doesn't. No one programs the strategy, it emerges",
        timestamp: "5:10",
      },
    },
  ],
  // Column 4 (scrolls DOWN) — map of math, compression, lectures, AI, fluids, engineering
  [
    {
      videoId: "OmJ-4B-mS-Y",
      title: "The Map of Mathematics",
      channelName: "Domain of Science",
      viewCount: 18000000,
      publishedText: "8 years ago",
      duration: "11:06",
      conversation: {
        question:
          "How do all the branches of mathematics connect to each other?",
        answer:
          "Pure math builds the foundations, then applied math carries those tools into physics, engineering, and computer science",
        timestamp: "2:15",
      },
    },
    {
      videoId: "OkmNXy7er84",
      title: "The Unreasonable Efficiency of JPEG",
      channelName: "Reducible",
      viewCount: 3200000,
      publishedText: "2 years ago",
      duration: "19:53",
      conversation: {
        question: "How does JPEG compress photos to a tenth of the size?",
        answer:
          "It exploits human vision by discarding high-frequency details we barely notice, using the discrete cosine transform",
        timestamp: "9:30",
      },
    },
    {
      videoId: "ZK3O402wf1c",
      title: "MIT 18.06 Linear Algebra, Lecture 1",
      channelName: "MIT OpenCourseWare",
      viewCount: 8500000,
      publishedText: "15 years ago",
      duration: "50:54",
      conversation: {
        question:
          "What makes linear algebra the most important math course for CS?",
        answer:
          "It's the geometry of equations — every dataset, neural network, and physics simulation runs on matrix operations",
        timestamp: "15:20",
      },
    },
    {
      videoId: "zjkBMFhNj_g",
      title: "Intro to Large Language Models",
      channelName: "Andrej Karpathy",
      viewCount: 5800000,
      publishedText: "2 years ago",
      duration: "59:47",
      conversation: {
        question: "Why does Karpathy compare LLMs to operating systems?",
        answer:
          "LLMs are becoming the kernel of a new computing paradigm — they coordinate tools, browse the web, and write code, just like an OS manages hardware",
        timestamp: "24:15",
      },
    },
    {
      videoId: "Af0_vWDfJwQ",
      title: "What is Dark Matter?",
      channelName: "MinutePhysics",
      viewCount: 5000000,
      publishedText: "13 years ago",
      duration: "2:17",
      conversation: {
        question: "What is 85% of the universe actually made of?",
        answer:
          "Something that has gravity but doesn't emit light, we can map where it is by how it bends spacetime, but we don't know what it is",
        timestamp: "1:40",
      },
    },
    {
      videoId: "rSKMYc1CQHE",
      title: "Coding Adventure: Simulating Fluids",
      channelName: "Sebastian Lague",
      viewCount: 6800000,
      publishedText: "1 year ago",
      duration: "16:14",
      conversation: {
        question: "Can you simulate realistic water from just math?",
        answer:
          "Treat fluid as thousands of particles that push apart when compressed and pull together when sparse, and waves emerge naturally",
        timestamp: "7:30",
      },
    },
    {
      videoId: "AnaASTBn_K4",
      title: "How Does a Whip Break the Sound Barrier?",
      channelName: "SmarterEveryDay",
      viewCount: 10000000,
      publishedText: "6 years ago",
      duration: "8:54",
      conversation: {
        question: "How does a whip crack break the speed of sound?",
        answer:
          "Energy concentrates as the wave travels down the thinning rope, the tip accelerates past Mach 1 and creates a sonic boom",
        timestamp: "4:20",
      },
    },
    {
      videoId: "X3_LD3R_Ygs",
      title: "OpenAI DALL-E 2: Top 10 Insane Results",
      channelName: "Two Minute Papers",
      viewCount: 2000000,
      publishedText: "3 years ago",
      duration: "6:01",
      conversation: {
        question:
          "Can AI really create photorealistic images from just text?",
        answer:
          "DALL-E 2 learns the relationship between images and language, then generates new visuals by gradually denoising random patterns guided by text",
        timestamp: "2:05",
      },
    },
  ],
  // Column 5 (scrolls UP) — GPT, paradox, fractals, patterns, ML, meta, big numbers, floats
  [
    {
      videoId: "wjZofJX0v4M",
      title: "But what is a GPT? Visual intro to Transformers",
      channelName: "3Blue1Brown",
      viewCount: 11000000,
      publishedText: "1 year ago",
      duration: "27:14",
      conversation: {
        question: "How does GPT predict the next word with such accuracy?",
        answer:
          "Attention mechanisms let the model weigh which previous tokens matter most for predicting what comes next",
        timestamp: "14:20",
      },
    },
    {
      videoId: "s86-Z-CbaHA",
      title: "The Banach-Tarski Paradox",
      channelName: "Vsauce",
      viewCount: 40000000,
      publishedText: "9 years ago",
      duration: "24:14",
      conversation: {
        question:
          "Can you really split a sphere and reassemble it into two identical spheres?",
        answer:
          "Using the axiom of choice, you can partition a sphere into pieces that rearrange into two full copies — it's mathematically valid",
        timestamp: "12:30",
      },
    },
    {
      videoId: "E1B4UoSQMFw",
      title: "Fractal Trees — L-Systems",
      channelName: "The Coding Train",
      viewCount: 500000,
      publishedText: "8 years ago",
      duration: "15:37",
      conversation: {
        question: "How do you grow a realistic tree from a simple rule?",
        answer:
          "L-systems apply recursive rewriting rules — each branch spawns sub-branches, and a few iterations produce organic-looking fractal structures",
        timestamp: "6:45",
      },
    },
    {
      videoId: "iJ8pnCO0nTY",
      title: "The hardest satisfying math — Euler's pentagonal formula",
      channelName: "Mathologer",
      viewCount: 5000000,
      publishedText: "4 years ago",
      duration: "15:42",
      conversation: {
        question: "What's the most beautiful pattern hiding in simple math?",
        answer:
          "Visual proofs can make abstract theorems tangible — watching algebra become geometry is when math stops feeling arbitrary",
        timestamp: "8:15",
      },
    },
    {
      videoId: "jGwO_UgTS7I",
      title: "Stanford CS229: Machine Learning",
      channelName: "Stanford Online",
      viewCount: 9000000,
      publishedText: "6 years ago",
      duration: "1:13:07",
      conversation: {
        question:
          "What's the first thing Stanford teaches about machine learning?",
        answer:
          "Start with linear regression: find the line that minimizes squared error, then build every other algorithm as a generalization",
        timestamp: "22:30",
      },
    },
    {
      videoId: "BxV14h0kFs0",
      title: "This Video Has X Views",
      channelName: "Tom Scott",
      viewCount: 72000000,
      publishedText: "5 years ago",
      duration: "11:34",
      conversation: {
        question:
          "How does the title of this video update itself automatically?",
        answer:
          "A script checks the YouTube API for the current view count, re-renders the thumbnail and title, then uploads them back — a self-referential loop",
        timestamp: "4:30",
      },
    },
    {
      videoId: "XTeJ64KD5cg",
      title: "Graham's Number - Numberphile",
      channelName: "Numberphile",
      viewCount: 8000000,
      publishedText: "12 years ago",
      duration: "9:16",
      conversation: {
        question: "How big is Graham's number really?",
        answer:
          "So incomprehensibly large that even the number of digits in the number of digits has more digits than atoms in the observable universe",
        timestamp: "4:30",
      },
    },
    {
      videoId: "PZRI1IfStY0",
      title: "Floating Point Numbers - Computerphile",
      channelName: "Computerphile",
      viewCount: 2000000,
      publishedText: "10 years ago",
      duration: "9:48",
      conversation: {
        question: "Why does 0.1 + 0.2 not equal 0.3 in code?",
        answer:
          "Binary floating point can't exactly represent most decimal fractions, so tiny representation errors compound through arithmetic",
        timestamp: "4:55",
      },
    },
  ],
];

export function HeroBanner3D() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Single rAF to trigger the reveal — everything fades in together
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="overflow-hidden fixed inset-0 w-full h-full">
      {/* Black curtain — fades out to reveal all cards at once */}
      <div
        className="absolute inset-0 z-[5] bg-black"
        style={{
          opacity: revealed ? 0 : 1,
          pointerEvents: revealed ? "none" : "auto",
          transition: "opacity 1.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s",
        }}
      />

      {/* Overall dim layer — very subtle */}
      <div className="absolute inset-0 bg-black/15 z-[1] pointer-events-none" />

      {/* Grain filter removed — caused GPU compositing glitches during continuous animation */}

      {/* 3D Perspective Container */}
      <div
        className="flex absolute inset-0 justify-center items-center"
        style={{
          perspective: "1200px",
          perspectiveOrigin: "50% 20%",
        }}
      >
        {/* Card columns — NO stagger, all visible immediately */}
        <div
          className="flex relative gap-5 justify-center items-start md:gap-7"
          style={{
            transform: "rotateX(55deg) scale(1.5)",
            transformStyle: "preserve-3d",
            height: "1800px",
          }}
        >
          {/* Desktop: show all 5 columns, Mobile: show first 3 */}
          {/* Staggered speeds + delays per column for visual layering */}
          {CURATED_VIDEOS.map((columnCards, colIdx) => {
            const speeds = [40, 50, 44, 48, 36];
            const delays = [0, 0.4, 0.8, 1.2, 1.6];
            return (
              <div
                key={colIdx}
                className={colIdx >= 3 ? "hidden md:block" : ""}
              >
                <HeroColumn
                  cards={columnCards}
                  direction={colIdx % 2 === 0 ? "up" : "down"}
                  delay={delays[colIdx]}
                  speed={speeds[colIdx]}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Center vignette — subtle darkening behind search bar for readability */}
      <div
        className="absolute inset-0 z-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 500px 250px at 50% 40%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)",
        }}
      />

      {/* Top header vignette */}
      <div
        className="absolute inset-0 z-20 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 8%, transparent 18%)",
        }}
      />

      {/* Edge overlays — soft fade to background at edges */}
      <div className="absolute top-0 right-0 left-0 z-10 h-32 bg-gradient-to-b to-transparent pointer-events-none from-chalk-bg via-chalk-bg/50" />
      <div className="absolute right-0 bottom-0 left-0 z-10 h-56 bg-gradient-to-t to-transparent pointer-events-none from-chalk-bg via-chalk-bg/70" />
      <div className="absolute inset-y-0 left-0 z-10 w-40 bg-gradient-to-r to-transparent pointer-events-none from-chalk-bg via-chalk-bg/40" />
      <div className="absolute inset-y-0 right-0 z-10 w-40 bg-gradient-to-l to-transparent pointer-events-none from-chalk-bg via-chalk-bg/40" />
    </div>
  );
}
