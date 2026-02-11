# Chalk: Revised Hackathon Battle Plan

## The Pitch (One Sentence)

**Chalk is an AI math tutor powered by Opus 4.6 that teaches through Socratic questioning — generating adaptive, interactive visualizations in real-time based on what you understand and where you're confused.**

## Why This Wins

| Criteria | Weight | How Chalk Scores |
|----------|--------|-----------------|
| **Demo** | 30% | The demo IS the product. Watch someone learn derivatives in 3 minutes through conversation. The "aha moment" is visible. |
| **Impact** | 25% | Expert tutoring costs $50-200/hr. Khan Academy is passive video. Chalk gives every student Socratic tutoring for free. Problem Statement #2 (Break the Barriers) AND #3 (Amplify Human Judgment). |
| **Opus 4.6 Use** | 25% | Extended thinking maintains a *student model* — reasoning about what the student knows, what misconception they have, and what visualization will create the right insight. Visible in the reasoning panel. This is the thing only Opus 4.6 can do. |
| **Depth & Execution** | 20% | 3D surfaces, streaming, reasoning traces, model routing, share URLs, Socratic mode, adaptive difficulty. Clear iteration from "viz generator" to "AI tutor." |

## Core Concept: Two Modes

### Mode 1: Explore (what you have now)
- User asks anything → gets a visualization
- Quick, single-turn, works with any model
- This is your "utility" — keeps the product useful for power users

### Mode 2: Learn (the new thing — this is the demo)
- User picks a topic OR types something vague like "teach me calculus"
- Opus enters **Socratic mode**: it ASKS questions, doesn't just answer
- Each user response → Opus reasons (visible in thinking panel) about:
  - What the student understands
  - What misconception they might have
  - What visualization would create an "aha" moment
  - What question to ask next
- Generates adaptive visualizations that build on each other
- After 4-6 turns, shows a simple progress summary

### Why Socratic Mode is the Killer Feature
1. **It requires genuine reasoning** — planning a teaching sequence, assessing understanding from natural language, adapting on the fly. Haiku/Sonnet can't do this. GPT-4 loses the thread.
2. **Extended thinking IS the product** — the reasoning panel shows Opus thinking "The student said 'slope gets bigger' which means they intuit rate of change but haven't connected it to the limit definition. I'll show the secant line approaching the tangent."
3. **It demos in 3 minutes perfectly** — someone types "teach me derivatives" → 5 turns of Socratic dialogue with evolving visualizations → visible learning. Judges lean forward.

## Implementation Plan

### What to Build (Priority Order)

#### P0: Socratic System Prompt (Ani — 2-3 hours)
The most critical piece. A new system prompt for Learn mode that instructs Opus to:
- Ask ONE targeted question per turn (not lecture)
- Include a `<student_model>` section in its thinking that tracks understanding level
- Generate visualizations that respond to the student's answer
- Progress through 4-6 turns from concrete example → formal definition
- End with a synthesis visualization that ties everything together

Key prompt elements:
```
You are in LEARN mode. Your job is to teach through questions, not lectures.

EVERY response must:
1. Acknowledge what the student said (1 sentence)
2. Generate a visualization that builds on their answer
3. Ask ONE follow-up question that guides them toward the next insight

In your thinking, maintain a STUDENT MODEL:
- What concepts they've demonstrated understanding of
- What misconceptions you've detected
- What's the next concept they need to grasp
- What visualization will create the "aha moment"

NEVER give the answer directly. Guide them to discover it.
```

#### P1: Learn Mode Toggle UI (Neel — 2-3 hours)
- Add a mode toggle in the header or input area: "Explore | Learn"
- When Learn mode is active:
  - Show a subtle indicator ("Socratic Mode" badge)
  - Input placeholder changes to "Type your answer..." after first turn
  - Topic picker: show 6-8 topic cards (Derivatives, Integrals, Linear Algebra, etc.) OR let them type freely
- Visual indicator of conversation progress (turn counter or progress dots)

#### P2: Streaming + Reasoning Integration (Ani — 3-4 hours)
- In Learn mode, force Opus 4.6 (no model selector)
- Ensure extended thinking budget is higher (15-20k tokens) since Socratic reasoning is complex
- The reasoning panel should be open by default in Learn mode (this IS the demo)
- Make sure the `\x1E` separator protocol handles Socratic responses correctly

#### P3: Topic Onboarding Flow (Neel — 2-3 hours)
- When user selects Learn mode, show topic cards
- Each card has: emoji, title, subtitle, difficulty
- Example: 📐 Derivatives — "What does rate of change actually mean?" — Beginner
- Clicking a card auto-sends a prompt like "Teach me about derivatives starting from scratch"
- Also allow free text: "I'm confused about eigenvalues"

#### P4: Progress/Summary View (Neel — 2-3 hours)
- After 4-6 Socratic turns, show a summary card:
  - "You learned: [concept 1], [concept 2], [concept 3]"
  - Mini visual recap of the key visualizations from the conversation
  - "Continue learning" or "Try a practice problem" buttons
- This makes the demo feel COMPLETE — the judge sees a full learning arc

#### P5: Demo Polish + Golden Paths (Ani — 3-4 hours)
- Pre-cache 2-3 "golden" Socratic conversations for the demo video
  - Derivatives (the star demo)
  - 3D surfaces / gradient descent
  - One more (Fourier? Probability?)
- These should work flawlessly every single time
- Record the demo video with one of these paths

#### P6: Landing Page / Share Improvements (Neel — 2 hours)
- When sharing a Learn conversation, the share page shows the full Socratic dialogue
- Maybe a tagline on the landing: "The AI tutor that makes you think"

### Timeline (Tue evening → Mon 3PM)

| When | Ani | Neel |
|------|-----|------|
| **Tue night** | P0: Write Socratic system prompt, test with Opus | P1: Build Learn mode toggle + topic cards UI |
| **Wed** | P2: Wire up Learn mode to API, fix streaming for Socratic responses | P1 cont: Polish topic onboarding, mode switching |
| **Thu** | P5: Build golden Socratic demo paths, test end-to-end | P4: Progress/summary view |
| **Fri** | Integration testing, bug fixes, edge cases | P6: Share improvements, landing polish |
| **Sat** | Record demo video (multiple takes), write summary | Help with demo script, test on mobile |
| **Sun** | Polish demo video, write GitHub README, final testing | Final UI polish, README help |
| **Mon AM** | Submit by noon (3 hours before deadline buffer) | Final review |

### Demo Video Script (3 minutes)

**0:00-0:20 — Hook**
"What if the best math tutor in the world was free, available 24/7, and could draw anything? Meet Chalk."

**0:20-0:50 — Quick Explore Mode**
Show someone typing "plot sin(x) + cos(2x)" → instant beautiful visualization. "Chalk can answer any math question with an interactive visualization. But that's not why we built it."

**0:50-2:20 — The Main Event: Learn Mode**
"The real power is Learn mode — powered by Opus 4.6's extended thinking."
- User clicks Learn → selects "Derivatives"
- Chalk asks: "If you're driving and your speedometer reads 60mph, what does that number actually tell you?"
- User types an answer
- Chalk generates a distance-time plot, highlights slope
- Show the reasoning panel: Opus is thinking about what the student understands
- 2-3 more turns, visualizations evolving
- End with the summary card showing what was learned
- "In 90 seconds, you just learned derivatives through conversation."

**2:20-2:50 — Tech Deep Dive (fast)**
"Under the hood: Opus 4.6's extended thinking maintains a student model — reasoning about what you know, what you're confused about, and what visualization will create the aha moment. [Show reasoning panel close-up]. 3D surfaces with React Three Fiber, 2D plots with Mafs, LaTeX rendering, all streaming in real-time."

**2:50-3:00 — Close**
"Chalk. Expert tutoring, not expert prices. Built with Claude Opus 4.6."

### What NOT to Do
1. ❌ Don't add YouTube / video / Twelve Labs anything
2. ❌ Don't add image upload (cool but not worth the time vs Socratic)
3. ❌ Don't add user accounts / auth
4. ❌ Don't add more visualization types (what you have is enough)
5. ❌ Don't refactor or rewrite existing code that works
6. ❌ Don't spend more than 1 hour on the README

### Special Prize Targeting

**"Most Creative Opus 4.6 Exploration" ($5k)**
→ Using extended thinking as a *pedagogical reasoning engine* is creative and unexpected. Most teams will use Opus for code gen or chat. You're using it to model a student's mind.

**"The Keep Thinking Prize" ($5k)**
→ Document your iteration: started as a viz generator, realized it needed to be a tutor, pivoted to Socratic mode. That's the "pushed past the first idea" narrative.
