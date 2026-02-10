# Chalk -- Hackathon Battle Plan

**The Master Execution Document. No more research. Just build.**

---

## Executive Summary

**Chalk** is an AI math visualization tool: type any math concept, get an instant, interactive, beautiful visualization with step-by-step explanation, shareable via live URL.

**Pitch**: "3Blue1Brown quality, but instant, interactive, and from a text prompt."

**Submission portal**: https://cerebralvalley.ai/e/claude-code-hackathon/ (also listed at https://cv.inc/e/claude-code-hackathon/)

**Why Chalk wins:**

1. **Visual impact is unmatched** (Demo = 30%). In a sea of text-in/text-out AI demos, a 3D rotating surface generated from a text prompt stops judges in their tracks. 500 participants, ~250 teams. Most will be chatbots, RAG pipelines, and code generators. Chalk is the one they remember.

2. **Education = maximum Impact score** (Impact = 25%). Universally relatable, non-controversial, scales to every student on earth. Fits Problem Statement 2 ("Break the Barriers" -- math viz locked behind Manim/Python expertise) and Problem Statement 3 ("Amplify Human Judgment" -- sharpens mathematical intuition).

3. **Opus 4.6 IS the product** (Opus 4.6 Use = 25%). Adaptive thinking decomposes concepts into pedagogical steps. Structured Outputs guarantee valid JSON for complex 3D scenes. Extended thinking trace is visible to judges. Dual-model strategy (Opus for reasoning, Haiku for speed) shows sophistication.

4. **The fallback chain is the engineering story** (Depth & Execution = 20%). Interactive viz -> Static viz -> LaTeX -> Plain text. Something ALWAYS renders. Zod schemas, error boundaries, graceful degradation. Production thinking, not hackathon hacking.

5. **Solo builder narrative**. One person, one week, Claude Code. Ani IS the case study for what Claude Code enables.

---

## Prize Strategy

### Prize Breakdown (Confirmed)

| Prize | Amount | Chalk's Shot |
|-------|--------|-------------|
| 1st Place | $50,000 API credits | Primary target |
| 2nd Place | $30,000 API credits | Primary target |
| 3rd Place | $10,000 API credits | Floor target |
| "Most Creative Opus 4.6 Exploration" | $5,000 | Strong -- ReasoningPanel + dual-model + adaptive thinking |
| "The Keep Thinking Prize" | $5,000 | Strong -- directly about extended thinking. ReasoningPanel IS this. |

**"The Keep Thinking Prize"** is almost certainly about showcasing extended/adaptive thinking. The name is a direct reference. Chalk's ReasoningPanel that shows the model's pedagogical reasoning is the most literal possible interpretation. Target this explicitly.

---

## Judging Criteria Strategy

### Impact (25%) -- "This Could Change Education"

- Frame as education tool, not tech demo
- Reference 3B1B: $250M+ of educational impact, now accessible to anyone who can type
- Shareable URLs make Chalk a teaching tool, not a toy
- Target Problem Statements 2 and 3 explicitly in README and submission description
- Submission line: "Chalk makes math visualization accessible to anyone who can type"
- Accessibility angle: visual learners (the majority) are underserved by textbook-heavy curricula

### Opus 4.6 Use (25%) -- "This Couldn't Be Built With Any Other Model"

| Feature | Why It Matters |
|---------|---------------|
| Adaptive thinking (`thinking: { type: "adaptive" }`) | Opus 4.6-exclusive. Decomposes "Fourier transform" into component visualizations via multi-step reasoning |
| `output_config: { effort: "max" }` for complex queries | Opus 4.6-exclusive. Other models error on "max". |
| Structured Outputs (`output_config: { format: { type: "json_schema" } }`) | Constrained decoding guarantees valid JSON. First request 100-300ms overhead, cached 24h. GA, no beta header. |
| Extended thinking trace in ReasoningPanel | Judges SEE the model reasoning about pedagogy. Targets "The Keep Thinking Prize" directly. |
| Dual-model strategy | Opus 4.6 for concept decomposition, Haiku 4.5 for fast JSON generation. Shows model sophistication. |
| 200K context (1M beta) | Feed Mafs + mathjs docs alongside prompt for maximally informed generation. 200K default; 1M requires beta header `context-1m-2025-08-07` + usage tier 4. |
| 128K output tokens | Opus 4.6 exclusive (doubled from 64K). Enables rich, multi-step viz specs without truncation. |
| Compaction API awareness | Server-side context summarization for infinite conversations. Not used by Chalk directly but shows Opus 4.6 feature awareness in README. |
| CLAUDE.md + Git history | Meta-evidence: Claude Code built Chalk itself. The repo IS a Claude Code demo. |

### Depth & Execution (20%) -- "This Isn't a Weekend Hack"

- Fallback chain: Interactive -> Static -> LaTeX -> Text
- Triple-layered validation: Structured Outputs (inference) + Zod schemas (runtime) + Error Boundaries (render)
- Dual-model routing shows engineering tradeoff thinking
- Performance: dynamic imports, code splitting, <3s render target
- Git history shows iteration: scaffold -> core -> polish -> prep (not one-shot)
- Component catalog with 5 renderers shows engineering breadth

### Demo (30%) -- "I Can't Stop Watching This"

- Cold open with 3D gradient descent -- no preamble, no pitch
- 4 examples in escalating complexity: gradient descent -> Fourier -> sin/cos/tan -> Central Limit Theorem
- Share feature = the "real product" moment
- AI reasoning panel = the "Opus 4.6" moment
- Close: "One week, one person, Claude Code" -- the memorable line
- Record Saturday, not Sunday. Quality > last-minute features
- **Critical**: Judges screen ~250 submissions. First 30 seconds determine pass/fail in Round 1. The cold open must be jaw-dropping.

### The Meta-Strategy

**The judges**: Boris Cherny (Head of Claude Code), Cat Wu (Product Lead, ex-Cursor/Anysphere), Thariq Shihpar (MTS Claude Code, ex-YC founder), Lydia Hallie (Head of DX at Bun, visual education specialist), Ado Kukic (DevRel, ex-Auth0/MongoDB/DigitalOcean), Jason Bigman (Claude Code team).

**Boris Cherny intel** (Jan-Feb 2026): Announced 100% of his code is now AI-generated. Ships 22-27 PRs per day, all written by Claude Code. Runs 5 Claudes in terminal + 5-10 on claude.ai in parallel. Uses "teleport" command to hand off sessions. Key quote: *"I exclusively use Anthropic's heaviest, slowest model: Opus... since you have to steer it less and it's better at tool use, it is almost always faster than using a smaller model in the end."* Maintains shared CLAUDE.md as "living memory." Philosophy: "You don't trust; you instrument." **Implication**: (1) Chalk's triple-layer validation IS the "instrument, don't trust" philosophy. (2) Our Opus-first, Haiku-for-simple dual-model strategy mirrors his exact reasoning about model selection. Say this in the demo.

**Cat Wu intel** (ex-Anysphere/Cursor, VC investor): Deep understanding of AI developer tools from building Cursor. Champions "extensible, customizable, hackable" tools. Values "smallest building blocks that are useful, understandable, and extensible." Philosophy: "Do the simple thing first." She understands product decisions that enable real workflows and remove friction. **Implication**: Chalk's component catalog (7 small, composable Zod schemas) IS the extensible building-block approach she values. The shareable URLs and progressive rendering show product thinking, not just tech.

**Lydia Hallie intel** (Head of DX at Bun, Frontend Masters instructor): Creates visual educational content for developers. Known for visual explanations of complex technical concepts. Frontend specialist (JS/TS/React). **Implication**: Lydia is Chalk's PERFECT judge. She makes visual education content for a living. The progressive rendering, clean component design, and pedagogical structure will resonate directly with her background. She will appreciate the 3Blue1Brown framing instantly.

**Thariq Shihpar intel** (YC-backed gaming founder, sold SAAS startup, MIT Media Lab): Values technical stability, architecture decisions, and handling edge cases. Publicly defended Anthropic's technical decisions around stability. **Implication**: The fallback chain and error boundary strategy (something always renders) directly addresses his stability focus.

**Ado Kukic intel** (DevRel, ex-Auth0/MongoDB/DigitalOcean): Community management and developer advocacy. Creates content helping developers use Claude. **Implication**: Shareable URLs + educational mission = community impact. Emphasize democratization.

All six care deeply about Claude Code's success story.

Chalk as a tool that uses Claude Code to produce *visual* output (not code, not text) aligns with their stated interest in non-traditional use cases. The reasoning panel showing Opus 4.6's pedagogical thinking will resonate with all six judges.

**The Meta-Argument**: "Chalk doesn't just USE Opus 4.6 -- it SHOWCASES what Opus 4.6 can do. When you see a complex mathematical concept transformed into a beautiful, step-by-step visualization in seconds, you're witnessing Opus 4.6's mathematical reasoning, structured output, and adaptive thinking all working together. The product IS the capability demo."

**Meta-evidence strategy**: Keep CLAUDE.md updated throughout the week. Boris's team does this. Make the repo itself demonstrate Claude Code mastery -- multiple meaningful commits, CLAUDE.md evolution, subagent usage patterns visible in git history. Boris ships 22-27 PRs/day -- he'll notice commit quality.

Judges watch 250+ demos. They form opinions in 30 seconds. They compare projects to each other. They value taste -- polish with 3 features beats mess with 10.

**The "Show Your Friends" Test**: After 8 hours of judging, what does a judge describe at dinner? Not the RAG pipeline. The 3D surface rotating in real-time, generated from a text prompt. That's Chalk.

**The Clickable URL Test**: If judges can click the live URL and interact *themselves*, that's a massive advantage over video-only submissions. Make sure the deployed app works flawlessly.

---

## Competitive Landscape

### What 249 Other Teams Will Build

| Tier | Category | % of Submissions | Why They Lose |
|------|----------|-----------------|---------------|
| 1 | AI Chatbots / Assistants ("ChatGPT for X") | 30-40% | Zero visual impact. Judges have seen hundreds. Not everything needs a chatbot. |
| 1 | Code Generation / Dev Tools | 15-20% | High Opus 4.6 score, low Demo score. Watching code gen is boring. |
| 1 | Document / Data Analysis (RAG) | 10-15% | Context window is good for Opus score, but demo is just text. |
| 2 | Agent Orchestration (multi-agent) | 10-15% | Boris Cherny will appreciate this technically. Hard to demo visually -- terminal output. |
| 2 | Creative / Generative Tools | 5-10% | High visual impact but "creative AI" is overdone. Hard to differentiate. |
| 2 | Enterprise Workflow Automation | 5-10% | Boring to demo. Judges are engineers, not enterprise buyers. |
| 3 | Education / Learning Tools | 3-5% | OUR LANE. Few teams do math viz specifically. |
| 3 | Novel Opus 4.6 Explorations | 3-5% | The $5K special prize. Dangerous if creative. |

### What Won Previous Anthropic Hackathons

- **Anthropic x Forum Ventures (Sep 2025)**: Winner built zenith.chat entirely with Claude Code in 8 hours. Won $15K. Key: clean UX, functional prototype, demonstrated Claude Code mastery. The builder later published "everything-claude-code" repo showing configurations.
- **Campus hackathons (UT Austin, UMass)**: Winners were practical tools with clean UX. Chiwo (productivity), EduClaude (learning), MedClarify (medical jargon).
- **Anthropic London Hackathon (Nov 2023)**: 1st place went to a robotic arm + Claude computer-use project. 2nd place: anti-CAPTCHA detection. 3rd: multi-agent PRD improvement tool. Pattern: **practical real-world applications with clear use cases** beat clever tech demos.
- **Anthropic GT HackerHouse (2025)**: Keep Thinking. Keep Building. Judging criteria: social impact/future potential, technical implementation, creativity, pitching quality.
- **Pattern**: Functional prototypes beat documentation. Visual impact differentiates. Scope discipline wins. Judges favor projects that "solve your own problem" and have clear purpose.

### 2025-2026 AI Hackathon Winner Patterns (Cross-Industry Research)

From analysis of 25+ recent AI hackathon winners:

1. **Solve real problems, not cool demos.** "Choose problems because they address genuine human need — the motivation and the story writes itself." Chalk's story: math education accessibility.
2. **Show trustworthiness in AI systems.** "Engineers need to see the decision trail." Chalk's ReasoningPanel shows Opus 4.6's pedagogical reasoning — this IS the trust signal.
3. **Validate quickly.** "Before building elaborate architecture, run a simple call on a single frame. That 10-minute experiment validated our entire direction." Day 0 ends with sin(x) rendering — the validation.
4. **Plan your presentation from Day One.** "Pitching readiness should start from the very beginning and run as a parallel thread." Demo script is in this document from Day 0.
5. **Narrow, focused solutions win.** "You can't solve world hunger in 48 hours, but you can nail one specific aspect of it." Chalk does ONE thing insanely well: NL → interactive math viz.
6. **Judges compare back-to-back.** "Start your video with a quick overview" (Devpost). Hence: 2-second title card before cold open.

### Why Chalk Differentiates

1. **Visual impact**: In a sea of text-based demos, a 3D interactive visualization stops judges cold
2. **"3Blue1Brown" anchor**: Immediately creates a vivid mental model and aspirational association
3. **Education = universally relatable**: Every judge struggled with math. Every student is a potential user. K-12 STEM market is $60.14B, growing 13.7% annually.
4. **Shareable URL moat**: Judges share it with each other -> viral within the judging panel. Research shows "shareable results" is a top factor in math tool virality.
5. **Solo builder narrative**: One person + Claude Code shipping this level of polish validates Anthropic's thesis. Boris ships 22-27 PRs/day with AI — Chalk is proof this works for complex projects.
6. **No competition in this exact niche**: Desmos has no NL input, no AI. GeoGebra has steep learning curve. Manim requires Python. Mathos AI has no interactive output. Chalk is the only NL -> interactive math viz tool.
7. **Free and instant**: Research shows "free/accessible" and "immediate visual feedback" are the top two factors in math tool adoption. Chalk has both.
8. **Lydia Hallie factor**: She creates visual educational content for a living. Chalk IS her domain. This is a judge-product fit advantage no competitor can have.

### Threat Analysis

| Threat | Risk | Counter-Move |
|--------|------|-------------|
| Someone builds a better viz tool | Medium | Chalk is opinionated ("type math, get beauty"), not generic. Specificity is the moat. |
| Agent orchestration scores higher on Opus 4.6 Use | High | Chalk also uses adaptive thinking, structured outputs, dual-model, effort:"max". Show reasoning trace in demo. Target "Keep Thinking Prize". |
| A team of 2 ships more features | High | Narrow scope + deep polish beats wide scope + shallow execution. One thing done insanely well. |
| Demo fails during recording | Medium | Pre-cache 4 golden-path examples. Fallback chain means something ALWAYS renders. Record segments separately. |
| Judges don't understand the math | Low | Choose universally understood examples: sin(x), Fourier, gradient descent. Avoid topology / number theory. |
| Judges only spend 3 min on submission | High | First 30s of video must hook. Deployed URL must work immediately. Submission description front-loads impact. |

---

## Architecture Overview

Full technical details in TECH_SPEC.md. High-level pipeline:

```
User types prompt
       |
       v
  Query Router  -----> classify("fast" | "deep" | "creative")
       |
       v
  POST /api/generate (Next.js Route Handler)
    - catalog.prompt() auto-generates component docs from Zod schemas
    - CHALK_SYSTEM_PROMPT adds pedagogical instructions
    - streamText() via Vercel AI SDK v6
       |
       v
  JSONL Streaming (RFC 6902 patches)
       |
       v
  useUIStream() parses patches -> Spec object
       |
       v
  <Renderer spec={spec} registry={registry} />
       |
       +-- plot2d       -> Mafs (2D interactive plots)
       +-- plot3d       -> React Three Fiber (3D surfaces)
       +-- matrix       -> SVG + Motion (transformations)
       +-- probability  -> D3 computation + React SVG
       +-- latex        -> KaTeX (always present as fallback)
       |
       v
  Supabase (save spec for shareable URLs)
```

### Critical: json-render's Flat Element Map

The AI must generate a **flat** `elements: Record<string, UIElement>` with string key references for children -- NOT nested component trees. This is the #1 source of bugs. json-render v0.5.2 fixes hallucination issues by dynamically generating prompt examples from YOUR catalog.

```typescript
// CORRECT (flat map with key references):
{
  root: "container_1",
  elements: {
    "container_1": { type: "vizContainer", props: {...}, children: ["plot_1", "eq_1"] },
    "plot_1": { type: "plot2d", props: {...} },
    "eq_1": { type: "latex", props: {...} }
  }
}

// WRONG (nested -- Claude will try this if not told otherwise):
{
  type: "vizContainer",
  children: [{ type: "plot2d", props: {...} }]
}
```

### Fallback Chain

Every viz component wrapped in React Error Boundary. AI always generates a `latex` component alongside every viz.

```
[1] Interactive visualization (Mafs / R3F / D3)
     |-- Error Boundary catches failure
     v
[2] Static visualization (SVG snapshot)
     |-- Error Boundary catches failure
     v
[3] LaTeX equation display (KaTeX)
     |-- KaTeX parse error
     v
[4] Plain text explanation
```

---

## Day-by-Day Schedule

### Day 0: Monday, Feb 10 -- FOUNDATION DAY

**Goal**: Hackathon starts 12PM EST. Skeleton deployed by midnight.
**Deliverable**: A deployed website where "plot sin(x)" produces an interactive 2D plot.
**REALITY CHECK**: It's now late evening Day 0. Planning consumed the day (but planning IS building — the plan pays for itself 10x). Compress remaining Day 0 tasks into tonight + early Day 1. The goal is still achievable.

| Time (EST) | Task | File / Command |
|------------|------|----------------|
| ASAP | Scaffold project | `npx create-next-app@latest chalk --ts --tailwind --app --src-dir=false --import-alias="@/*"` |
| +15 min | Install all dependencies (use TECH_SPEC.md install command -- it has correct versions) | Single `npm i` command |
| +15 min | **TEST json-render useUIStream IMMEDIATELY** — try a minimal `useUIStream` + `Renderer` with a hardcoded API endpoint. If Issue #53 (infinite re-renders) reproduces, switch to `createSpecStreamCompiler` fallback plan within 1 hour. This is the #1 risk. | `components/ChalkCanvas.tsx` |
| +30 min | Create initial file structure. Stub every file. | See File Structure below |
| +15 min | Set up Supabase: `visualizations` table with JSONB spec column | See Supabase Schema below |
| +30 min | Build `InputBar.tsx` -- single text input + submit button | `components/InputBar.tsx` |
| +60 min | Build `MafsPlot2D.tsx` -- hardcode sin(x), verify Mafs renders | `components/MafsPlot2D.tsx` |
| +60 min | Wire `app/api/generate/route.ts` -- Claude API -> JSONL | `streamText` from Vercel AI SDK v6. Response: `toTextStreamResponse()` (NOT SSE). |
| +60 min | Build `ChalkCanvas.tsx` with `useUIStream` + `Renderer` (or fallback) | First end-to-end: "plot sin(x)" -> real plot |
| +30 min | Set up `lib/catalog.ts` and `lib/registry.ts` with `plot2d` + `latex` | Use `defineCatalog` from `@json-render/core`, `defineRegistry` from `@json-render/react` |
| +30 min | Deploy to Vercel. Set env vars. Test deployed version. | Deploy early. Catch issues now. `maxDuration: 300` in vercel.json. |
| +60 min | Write system prompt v1 (`lib/prompts.ts`). Test with 5 concepts. | Be explicit about flat element map. Test: "plot sin(x)", "explain derivative", "show unit circle". |
| Done | Git commit with descriptive messages. Push. Update CLAUDE.md. | Start the narrative. |
| 10:00 PM | **STOP.** Sleep. Tomorrow is Core Features Day. | |

### Day 1: Tuesday, Feb 11 -- CORE FEATURES DAY

**Goal**: All 5 component types rendering. Fallback chain operational.
**Deliverable**: All 5 component types working. 20+ concepts tested.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Build `ThreeDSurface.tsx` (R3F) -- z = sin(x)*cos(y) | `dynamic import`, `ssr: false`, `OrbitControls` from Drei. Resolution 64. **Use `ParametricGeometry` from `three/addons/geometries/ParametricGeometry.js`** — maps (u,v)∈[0,1] to Vector3. Remap to xDomain/yDomain, compute z=f(x,y). See TECH_SPEC.md Section 3.5 for code. |
| 12:00 PM | Build `MatrixViz.tsx` (SVG + motion) -- 2D grid transform | `motion.g` for animated SVG transforms. Spring physics. |
| 2:00 PM | Build `ProbabilityViz.tsx` (D3 + React SVG) -- normal distribution | D3 for computation. React for rendering. Must have `"use client"` directive. Use `dynamic(() => import('./ProbabilityViz'), { ssr: false })` if D3 touches DOM. |
| 3:30 PM | Build `LatexDisplay.tsx` (KaTeX) -- universal fallback | Import `katex/dist/katex.min.css` in layout.tsx. Use `katex.renderToString()` with thin `"use client"` wrapper (NOT `@matejmazur/react-katex` — unmaintained, 5 years old). |
| 4:00 PM | Wire all 5 into catalog + registry. Update system prompt. | Schemas from TECH_SPEC.md Section 3. Test each type. |
| 5:00 PM | Implement `SafeVizWrapper.tsx` -- fallback chain (ErrorBoundary + Suspense) | Each viz wrapped. Falls back to next level. |
| 6:00 PM | Zod validation between Claude output and renderer | Structured Outputs (inference) + Zod v4 (runtime). |
| 7:00 PM | Test with 20 diverse math concepts. Fix worst failures. | Most failures will be system prompt issues. |
| 9:00 PM | UI: loading states, error states, basic transitions | `React.Suspense` + `AnimatePresence` from motion. |
| 10:00 PM | Deploy. Commit. **STOP.** | |

### Day 2: Wednesday, Feb 12 -- POLISH & INTERACTIVITY DAY

**Goal**: Visualizations go from "working" to "beautiful." Interactivity is the star.
**Deliverable**: Beautiful interactive visualizations. Fourier demo smooth. Design system applied.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Plot2D interactivity: `useMovablePoint`, zoom, pan | Built into Mafs. `<Mafs pan={true} zoom={true}>`. Note: `useMovablePoint` uses `"horizontal"`/`"vertical"` constraints, not `"x-axis"`/`"y-axis"`. |
| 12:00 PM | Plot3D interactivity: OrbitControls, parameter sliders | HTML overlays via Drei `<Html>`. |
| 1:30 PM | Build `StepSequence.tsx` -- step-through animation | For Fourier demo. Steps appear one at a time. Slider controls count. |
| 3:00 PM | Design system pass: chalk-dark theme | slate-900 bg, blue-500 accent. Inter + JetBrains Mono. See tailwind config in TECH_SPEC.md. |
| 4:30 PM | Explanation panel: KaTeX equations alongside viz + plain-text | Every visualization has an equation and one-sentence explanation. |
| 6:00 PM | System prompt v2: fix Day 1 failures. Add few-shot examples. | The prompt IS the product. Iterate hard. |
| 7:30 PM | Performance: dynamic imports, code splitting | `next/dynamic` with `ssr: false` for WebGL. Target <3s render. |
| 9:00 PM | Deploy. Commit. **STOP.** | |

### Day 3: Thursday, Feb 13 -- SHARING & OPUS 4.6 SHOWCASE DAY

**Goal**: Shareable URLs. AI reasoning panel. Opus 4.6 Use criteria explicitly addressed.
**Deliverable**: Share URLs. Reasoning visible. Concept library. Edge cases handled.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Shareable URLs: save spec to Supabase, nanoid, load from `/v/[id]` | See Supabase integration in TECH_SPEC.md Section 7. |
| 12:00 PM | Build `ShareButton.tsx`: copy-to-clipboard | Simple but essential. Verify deployed share URLs work. |
| 1:00 PM | Build `ReasoningPanel.tsx`: show Opus 4.6 extended thinking | THE feature for Opus 4.6 scoring AND "Keep Thinking Prize". `thinking: { type: "adaptive" }`. Collapsible panel. |
| 3:00 PM | Dual-model routing: Opus for complex, Haiku for simple | `classifyQuery()` in `lib/router.ts`. Haiku model ID: `claude-haiku-4-5` (hyphens, not dots). |
| 4:30 PM | Concept library: 10-15 pre-built examples | Pre-generate and cache specs. sin(x), Fourier, gradient descent, eigenvalues, normal distribution, CLT, etc. |
| 6:00 PM | Edge case hardening: gibberish, non-math, extremely complex | Graceful error messages. Fallback chain is the safety net. |
| 8:00 PM | Full integration test: 30 concepts end-to-end on production | Find bugs on production, not during demo recording. |
| 9:00 PM | Deploy. Commit. **STOP.** | |

### Day 4: Friday, Feb 14 -- DEMO PREP DAY

**Goal**: Demo script rehearsed. Golden-path examples flawless.
**Deliverable**: Demo examples locked and pre-cached. Recording environment ready. Practice run done.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Lock 4 demo examples. Run each 10 times. Fix flakiness. | Gradient descent 3D, Fourier, sin/cos/tan, Central Limit Theorem. |
| 12:00 PM | Pre-cache demo examples: store AI responses for instant load | Store in Supabase. Demo must feel instant. |
| 1:00 PM | Final UI polish: animations, transitions, loading states | Every pixel matters in a 3-minute video. |
| 2:30 PM | Finalize voiceover script. Practice reading aloud 5 times. | See Demo Script section below. Time yourself. |
| 3:30 PM | Set up recording: OBS/ScreenFlow, external mic, 1920x1080, 60fps | Chrome fullscreen. No bookmarks bar. No distracting tabs. |
| 4:30 PM | Full practice recording. Watch it back. Fix timing issues. | First take is never good. |
| 6:00 PM | Fix issues. Adjust timing. Select background music. | Tycho/Bonobo-style ambient. Low volume. |
| 7:00 PM | Final deploy. Test all demo examples on production. | |
| 8:00 PM | **STOP CODING.** Switch to demo mindset. | Feature creep on Day 4 is how hackathons are lost. |

### Day 5: Saturday, Feb 15 -- RECORDING DAY

**Goal**: Demo video recorded, edited, uploaded.
**Deliverable**: Final demo video uploaded. Submission materials ready.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Watch practice recording. Note final adjustments. | Fresh eyes. |
| 11:00 AM | Record each of 8 segments separately (including 2s title card). 2-3 takes each. | See Demo Script for segments and timing. |
| 1:00 PM | Record voiceover separately. Clean, quiet room. | Separate audio = better quality. NOT AirPods. |
| 2:00 PM | Edit: assemble segments, sync voiceover, add music, trim dead time. | Cut generation wait to 2s. Speed up typing slightly. |
| 4:00 PM | First cut review. Watch on phone (judges might). | Check audio levels. Is voiceover clear? |
| 5:00 PM | Incorporate feedback. Re-edit. Export final. | |
| 6:00 PM | Upload to YouTube (unlisted). Verify playback. | Do NOT wait until Sunday. Processing takes time. |
| 7:00 PM | Prep submission: README updates, repo cleanup, final deploy. | Repo is part of submission. |
| 8:00 PM | **DONE.** Rest. Do not make changes. | |

### Day 6: Sunday, Feb 16 -- SUBMISSION DAY

**Goal**: Submit before 12PM EST. Three hours of safety margin.
**CRITICAL**: "Judges first check basic requirements. Surprising how many submissions don't fulfill basic requirements." (Devpost judge advice). Verify EVERY requirement.

| Time | Task | Details |
|------|------|---------|
| 10:00 AM | Final check: video plays, Vercel works, share URLs work | Murphy's Law. |
| 10:30 AM | Write submission description. Link video, app, repo. Front-load impact in first 2 paragraphs. | This is the first thing judges read. Hook immediately. First sentence should say what Chalk DOES, not what it IS. |
| 11:00 AM | Clean GitHub repo: remove TODOs, add README with screenshots, ensure CLAUDE.md comprehensive | README needs: (1) What it does, (2) Screenshot/GIF, (3) How to run, (4) Tech stack, (5) How Opus 4.6 is used |
| 11:30 AM | **Submission checklist** — verify ALL requirements from https://cerebralvalley.ai/e/claude-code-hackathon/: video under 3 min, demo link works, repo link works, team size ≤ 2, built during hackathon dates, uses Opus 4.6 | Missing ANY of these = disqualification |
| 12:00 PM | **SUBMIT** at https://cerebralvalley.ai/e/claude-code-hackathon/ (3 hours before deadline) | NEVER submit at deadline. Servers crash. |
| 12:30 PM | Verify submission received. Screenshot as proof. | |
| 1:00 PM | Tweet: tag @AnthropicAI, @claudeai, include 15-sec clip | Social proof. Judges see buzz. |
| 2:00 PM | Buffer for emergency fixes. | |
| 3:00 PM | **DEADLINE.** Done. | |

---

## Demo Script (3:00 Exact)

### Pre-Production

- **Resolution**: 1920x1080, 60fps
- **Theme**: Dark background (slate-900), chalk-white UI, colorful visualizations
- **Browser**: Chrome, fullscreen, no bookmarks bar, no distracting tabs
- **Music**: Soft ambient electronic (Tycho/Bonobo) -- low volume, starts at 0:00
- **Voiceover**: Minimal, confident, unhurried. Pre-record and edit. No filler words.
- **Editing**: Cut generation wait to 2s. Show typing in real-time (slightly sped up). No slide decks. No pitch cards.
- **Critical rule**: The first 30 seconds determine if judges watch the rest. The cold open MUST be stunning.
- **Devpost tip (from hackathon judges)**: "Judges will likely review multiple projects back to back." Start with a 2-second title card showing "Chalk" and the one-line pitch BEFORE the cold open. This gives context immediately.
- **Trust signal**: Show the AI reasoning trail. "Engineers need to see the decision trail" (from 2025 hackathon winner insights). ReasoningPanel is this.
- **Focus on "why"**: Demo the workflow and the "why," not just the UI. The story is "I typed a concept, AI reasoned about pedagogy, and a beautiful viz appeared."
- **Judge targeting**: Lydia Hallie (Head of DX at Bun) makes visual educational content for a living — she IS Chalk's ideal judge. Boris Cherny uses the heaviest model because "you steer it less" — our Opus-first strategy mirrors this. Thariq Shihpar values stability — our fallback chain addresses this.
- **Hackathon judge advice** (Devpost 2025): "Judges first check basic requirements. Surprising how many submissions don't fulfill basic requirements." → Double-check all submission requirements before uploading.
- **Creativity signals investment**: "Creativity or enthusiasm signals somebody has put a lot of time, thoughtfulness, and energy into their submission." → The visual quality and polish of Chalk communicates this instantly.

### Segment 0: Title Card [0:00 - 0:02]

**[Dark screen. "Chalk" in clean white type. Subtitle: "Type any math concept. Get instant understanding." Fades in 0.5s, holds 1.5s, fades to app.]**

### Segment 1: Cold Open [0:02 - 0:27]

**[Screen: Chalk open. Clean dark interface. Empty input bar with gentle pulse.]**

Type: "Visualize gradient descent finding the minimum of a 3D loss surface"

**[2s loading -> Stunning 3D surface appears. Multimodal loss landscape. Glowing point descends following gradient. Surface colored by height (blue valleys, red peaks). Camera slowly orbits.]**

**[User grabs scene, rotates, zooms. Ball keeps descending. Interactive controls: learning rate slider, starting position.]**

*Voiceover (at 0:08):*
> "This is Chalk. Type any math concept. Get an instant, interactive visualization."

**[Drag learning rate high -> ball oscillates wildly. Pull back -> smooth convergence.]**

*Voiceover:*
> "Not a static image. Not a video. A live, explorable mathematical world."

### Segment 2: Fourier Elegance [0:25 - 0:55]

Type: "Show me how a Fourier transform decomposes a square wave"

**[Left: square wave in chalk-white. Right: sine waves appear one by one (1st, 3rd, 5th harmonic), each different color. Left side updates showing sum converging. KaTeX equation appears below.]**

**[Slider: "Number of terms." Drag to 1 -> single sine. Drag to 50 -> near-perfect square wave. Gibbs phenomenon visible at corners.]**

*Voiceover:*
> "Chalk understands the concept, not just the formula. It builds the explanation step by step -- like the best math teacher you've ever had."

### Segment 3: Simplicity [0:55 - 1:15]

Type: "Plot sin(x), cos(x), and tan(x)"

**[Near-instant (Haiku 4.5 -- show speed): Beautiful 2D Mafs plot. Three functions, distinct colors. Draggable point on sin(x) showing coordinates. Smooth pan and zoom.]**

*Voiceover:*
> "Simple queries work too. Chalk meets you where you are."

### Segment 4: Viral Moment [1:15 - 1:50]

Type: "Show the Central Limit Theorem with dice rolls"

**[Monte Carlo simulation: dice roll one at a time. Histogram builds. 10 rolls: jagged. 100 rolls: rough bell. 1000 rolls: smooth normal curve emerges from chaos. Running mean/std dev displayed. D3 animated drops.]**

*Voiceover:*
> "Chalk handles concepts across all of mathematics. From calculus to statistics to linear algebra."

**[Quick montage: 3-4 fast cuts of other visualizations]**
- Vector field flowing around obstacles
- Normal distribution with shaded 68% region
- Matrix transformation warping a grid

### Segment 5: Share Moment [1:50 - 2:15]

**[Back on gradient descent. Click "Share" button. URL appears: chalk.vercel.app/v/abc123]**

**[New browser tab. Paste URL. Same 3D visualization loads -- fully interactive, no login.]**

*Voiceover:*
> "Every visualization gets a shareable URL. Send it to a student, embed it in a blog post. The visualization is live -- not a screenshot."

**[Rotate 3D scene on shared page. Adjust sliders. Fully interactive.]**

### Segment 6: AI Reveal [2:15 - 2:40]

**[Split view. Left: Chalk. Right: reasoning panel showing Opus 4.6's thinking.]**

*Voiceover:*
> "Under the hood, Opus 4.6's adaptive thinking decomposes each concept into a visualization plan."

**[Reasoning panel shows:]**
```
The user wants to understand Fourier transform decomposition.
Pedagogical approach: Build up from components.
Step 1: Show the target signal (square wave)
Step 2: Introduce individual harmonics (1st, 3rd, 5th...)
Step 3: Show superposition -- the sum converging
Step 4: Interactive element -- let user control number of terms
Step 5: The Gibbs phenomenon is a natural teaching moment
```

*Voiceover:*
> "It doesn't just plot equations. It reasons about how to teach the concept. That's what makes Opus 4.6 different."

### Segment 7: Close [2:40 - 3:00]

**[Fade to dark background. Chalk logo -- clean, minimal, chalk-white.]**

> "Type any math concept. Get instant understanding."

*Voiceover (slow, clear):*
> "This is Chalk. Built in one week, by one person, with Claude Code."

> chalk.vercel.app | Built with Opus 4.6

**[Music fades. 2 seconds silence with logo.]**

### Timing Summary

| Segment | Duration | Cumulative | Purpose |
|---------|----------|------------|---------|
| Title Card | 2s | 0:02 | **Context** -- judges know what they're watching |
| Cold Open (3D Gradient Descent) | 25s | 0:27 | **Hook** -- stop judges from skipping |
| Fourier Decomposition | 28s | 0:55 | **Depth** -- shows pedagogical AI |
| Simple Plot (sin/cos/tan) | 20s | 1:15 | **Breadth** -- shows dual-model speed |
| CLT + Montage | 35s | 1:50 | **Wow** -- chaos becomes order, range |
| Shareable URL | 25s | 2:15 | **Product** -- this is real, not a toy |
| AI Reasoning Reveal | 25s | 2:40 | **Opus 4.6** -- extended thinking visible |
| Close / Brand | 20s | 3:00 | **Memorable** -- the line they repeat |

### Recording Checklist

- [ ] All 4 main examples tested and working on production
- [ ] Examples pre-cached for instant generation (< 2s perceived)
- [ ] Screen recorder configured (OBS or ScreenFlow)
- [ ] External mic for voiceover (NOT AirPods, NOT laptop mic)
- [ ] Background music selected and leveled (-20dB under voiceover)
- [ ] Practice typing/interaction flow 3 times
- [ ] Record each segment separately (7 segments, 2-3 takes each)
- [ ] Export MP4, 1080p, < 100MB
- [ ] Upload to YouTube (unlisted), verify playback at 1080p
- [ ] Watch on phone (judges might review on mobile)
- [ ] Backup on local drive + Google Drive

### What NOT To Do

- Do NOT start with "Hi I'm Ani and I built..."
- Do NOT explain the tech stack verbally (judges read the repo)
- Do NOT show terminal or command line
- Do NOT use filler words in voiceover
- Do NOT show login/signup flow
- Do NOT spend more than 5 seconds on any transition
- Do NOT apologize ("it's just a hackathon project...")
- Do NOT rush -- if you need to cut, cut a segment, don't speed up

### Fallback If Visualization Fails During Recording

1. Skip it, use a working alternative
2. Pre-record backup of each segment
3. LaTeX fallback chain means even a "failure" produces a clean equation -- show it as a feature

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Claude API rate limits or downtime | Medium | Pre-cache 4 demo examples in Supabase. Demo video uses cached responses. $500 API credits provided -- won't hit billing limits. |
| 3D rendering perf issues | Medium | Test on low-spec laptop. Use Drei `AdaptiveDpr`. Resolution=64 default, 96 max (research shows lag above 96 on mobile). Fallback to 2D. |
| Demo video upload/processing fails | Low | Upload to YouTube by Saturday evening. Local copy. Google Drive backup. Raw footage for quick re-export. |
| Vercel deployment breaks Sunday | Low | Deploy Friday. Do not push code Sunday unless critical. Saturday deploy = golden version. |
| Scope creep | High | Follow triage plan below. When in doubt, cut scope and polish. 3 beautiful features > 7 broken. |
| Burnout (solo, 7 days) | High | Stop at 10PM every night. Sleep 7+ hours. Demo recorded rested Saturday > demo recorded exhausted 3AM Sunday. |
| Judges only spend 3 min reviewing | High | First 30s of video hook. Live URL works. Submission description hooks in first paragraph. |
| json-render v0.5.2 has bugs | **High** | **Known bugs**: Issue #53 (infinite re-renders from Renderer — could lock UI), #54 (multiple renderings on single input), #55 (docs mismatch: `spec` not `tree`, `isStreaming` not `isLoading`, `api` not `endpoint`), #42 (JSONL patch format confusion). **GOOD NEWS**: v0.5.1 added built-in error boundaries — a single bad component silently disappears instead of white-screen-of-death. **FALLBACK**: Skip `useUIStream`, use `createSpecStreamCompiler()` from `@json-render/core` to manually parse JSONL patches. Read response via `response.body.getReader()`, split on newlines, feed to `compiler.push(line)`. Returns `{ result, newPatches }`. Keeps progressive rendering. See TECH_SPEC.md "json-render Fallback Plan" for code. Takes ~1h to implement. **Test useUIStream first thing Day 0 — if #53 reproduces, switch to fallback immediately.** |

---

## Triage Plan

### If Behind -- Cut in This Order (least important first)

1. **OG image generation for share links** -- share URLs still work without previews
2. **Probability/D3 renderer** -- drop to 4 component types. Demo only needs 3 polished ones.
3. **Matrix transformation renderer** -- focus depth over breadth
4. **Concept library** -- simulate by pre-caching demo examples only
5. **Step-by-step animation** -- show Fourier as static viz with slider instead

### NEVER Cut These

- **Plot3D** -- this IS the demo cold open
- **Shareable URLs** -- this IS the product differentiation
- **AI reasoning panel** -- this IS the Opus 4.6 showcase AND "Keep Thinking Prize" play
- **Fallback chain** -- this IS the engineering depth story
- **Demo video quality** -- this IS 30% of the score

### If Ahead -- Add in This Order (highest impact first)

1. **Animated transitions between viz steps** -- Fourier "build-up" animation. Demo highlight.
2. **Voice input** -- "Hey Chalk, show me..." via Web Speech API. Tiny implementation, huge demo wow.
3. **Visualization history** -- sidebar of past prompts/visualizations. App feels complete.
4. **Export as PNG/SVG** -- `modern-screenshot` (NOT `html2canvas` -- unmaintained, poor SVG support). Dynamic import: `const { domToPng } = await import('modern-screenshot')`. For R3F: `gl.domElement.toDataURL('image/png')` with `preserveDrawingBuffer: true`.
5. **Embeddable widget** -- iframe embed code for teachers
6. **Dark/light mode toggle** -- easy polish
7. **Math input autocomplete** -- suggest concepts as user types

---

## Git Strategy

The Git history is part of the submission. Make it tell a story.

### Commit Message Pattern

```
Day 0:
  "feat: project scaffold with Next.js 15 + TypeScript + Tailwind"
  "feat: add Mafs 2D plot renderer with sin(x) example"
  "feat: connect Claude API -- first end-to-end text -> visualization"
  "deploy: initial Vercel deployment with live URL"

Day 1:
  "feat: add React Three Fiber 3D surface renderer"
  "feat: add D3 probability distribution renderer"
  "feat: implement visualization fallback chain (interactive -> static -> LaTeX -> text)"
  "feat: add Zod v4 schema validation for AI output"

Day 2:
  "enhance: add interactive controls -- draggable points, parameter sliders"
  "enhance: Fourier transform step-by-step animation"
  "design: implement chalk-dark theme with consistent design system"
  "perf: lazy loading and code splitting for renderers"

Day 3:
  "feat: shareable URLs with Supabase persistence"
  "feat: AI reasoning panel showing Opus 4.6 adaptive thinking"
  "feat: dual-model strategy -- Opus for reasoning, Haiku for generation"
  "feat: pre-built concept library (15 examples)"

Day 4:
  "polish: final UI animations and transitions"
  "test: lock demo examples, pre-cache responses"
  "docs: comprehensive README with screenshots"

Day 5-6:
  "chore: repo cleanup for submission"
  "docs: update CLAUDE.md with project learnings"
```

### Principles

- Conventional prefixes: `feat`, `enhance`, `fix`, `perf`, `docs`, `deploy`, `test`, `chore`
- Each commit = meaningful unit of work. Never "WIP" or "fix stuff".
- History shows progression: scaffold -> core -> polish -> prep
- CLAUDE.md updates sprinkled throughout show Claude Code mastery
- The repo itself is meta-evidence of Opus 4.6 use

---

## Reference: Setup Commands & Config

### The npm Install Command (Day 0)

**USE THE TECH_SPEC.md INSTALL COMMAND.** It has verified, current versions. Copy from TECH_SPEC.md Section 1.

Quick reference (synced with TECH_SPEC.md):

```bash
npx create-next-app@latest chalk --ts --tailwind --app --src-dir=false --import-alias="@/*"
cd chalk
npm i @json-render/core@^0.5.2 @json-render/react@^0.5.2 \
  ai@^6.0.78 @ai-sdk/anthropic@^3.0.40 @anthropic-ai/sdk@^0.74.0 \
  mafs@^0.21.0 \
  @react-three/fiber@^9.5.0 @react-three/drei@^10.7.7 three@^0.182.0 \
  d3@^7.9.0 \
  katex@^0.16.28 \
  mathjs@^15.1.0 \
  @supabase/supabase-js@^2.49.1 \
  motion@^12.34.0 \
  modern-screenshot@^4.6.8 \
  nanoid@^5.0.9 \
  zod@^4.0.0 \
  react-error-boundary@^5.0.0

npm i -D @types/three@^0.182.0 @types/d3@^7.4.3
```

**Notes**:
- json-render requires Zod ^4.0.0 (Zod 4 is stable at 4.3.6, same API surface as v3 for our patterns).
- json-render peer dep for react is `^19.2.3` (stricter than docs say `^19.0.0`). Ensure package.json has `react@^19.2.3`.
- `@matejmazur/react-katex` REMOVED — unmaintained (5 years, no React 19 work). Use `katex.renderToString()` + thin wrapper instead.
- Tailwind v3 (3.4.17), NOT v4, for stability.
- `motion` is the new package name for Framer Motion (v12+). Import from `"motion/react"` (needs `"use client"`). No breaking React API changes.
- D3 v7 is ESM-only. Works with Next.js App Router. Components using D3 MUST have `"use client"` directive.
- AI SDK v6 is current. `@ai-sdk/anthropic@3.x` corresponds to AI SDK v6.
- json-render exports `defineRegistry` (NOT `defineComponents` — Issue #63 confirms this). Use `defineRegistry(catalog, { components: {...} })`.

### Initial File Structure

```
chalk/
  app/
    layout.tsx              # Root layout, dark theme, fonts, KaTeX CSS
    page.tsx                # Landing page with input bar
    globals.css             # Tailwind + chalk theme
    api/
      generate/
        route.ts            # POST: prompt -> AI -> JSONL stream
      share/
        route.ts            # POST: save spec to Supabase, return short ID
    v/
      [id]/
        page.tsx            # Shared visualization page (SSR from Supabase)
  components/
    ChalkCanvas.tsx         # Main renderer (useUIStream + Renderer)
    InputBar.tsx            # Text input with submit
    MafsPlot2D.tsx          # 2D plot (Mafs)
    ThreeDSurface.tsx       # 3D surface (R3F) -- dynamic import, ssr: false
    MatrixViz.tsx           # Matrix transformation (SVG + motion)
    ProbabilityViz.tsx      # Probability distribution (D3 + SVG)
    LatexDisplay.tsx        # KaTeX renderer (universal fallback)
    VizContainer.tsx        # Layout wrapper with title, description, controls
    StepSequence.tsx        # Step-through animation controller
    ShareButton.tsx         # Copy shareable URL
    ReasoningPanel.tsx      # Show Opus 4.6 extended thinking trace
    SafeVizWrapper.tsx      # ErrorBoundary + Suspense fallback chain
    ExportButton.tsx        # modern-screenshot export to PNG/SVG (dynamic import)
  lib/
    catalog.ts              # json-render catalog definition (defineCatalog)
    registry.ts             # json-render registry (defineRegistry -> React components)
    router.ts               # classifyQuery() model selection logic
    schemas/
      spec.ts               # Top-level ChalkSpec schema
      plot2d.ts             # Plot2D Zod schema
      plot3d.ts             # Plot3D Zod schema
      matrix.ts             # Matrix Zod schema
      probability.ts        # Probability Zod schema
      latex.ts              # LaTeX Zod schema
      vizContainer.ts       # VizContainer Zod schema
      stepSequence.ts       # StepSequence Zod schema
      index.ts              # Re-exports all schemas
    math.ts                 # mathjs expression compiler (sandboxed)
    supabase.ts             # Supabase client + save/load
    prompts.ts              # System prompt constants
  public/
    fonts/                  # Inter, JetBrains Mono
  tailwind.config.js        # Chalk dark theme colors
  vercel.json               # Deployment config (maxDuration: 300 for AI route -- Fluid Compute Hobby max)
  .env.local                # ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
```

### Key Code Patterns

**Model routing** (`lib/router.ts`):
```typescript
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

  return 'deep'; // Default to deep -- better to over-reason than under-deliver
}
// NOTE: 'creative' prepends CREATIVE_SYSTEM_PROMPT to the deep prompt.
// See TECH_SPEC.md Section 4 (Creative Mode). Used for showcase/viral-worthy queries.
```

**Opus 4.6 API settings** (correct parameter paths):
```typescript
// Via Vercel AI SDK:
const result = streamText({
  model: anthropic('claude-opus-4-6'),
  system: systemPrompt,
  prompt: buildUserPrompt({ prompt, state: context?.data ?? {} }),  // context comes from useUIStream.send(prompt, context?)
  maxTokens: 32000, // CRITICAL: thinking tokens are a SUBSET of maxTokens. Opus may use 10-15K for thinking. 32K ensures headroom.
  providerOptions: {
    anthropic: {
      thinking: { type: 'adaptive' },  // Opus 4.6 exclusive
    },
  },
});

// Via direct Anthropic API (for Structured Outputs -- supports effort: 'max'):
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// Option A: messages.create() -- manual response handling
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },           // Opus 4.6 exclusive
  output_config: {
    effort: 'max',                            // Opus 4.6 exclusive (inside output_config, NOT top-level)
    format: zodOutputFormat(ChalkSpecSchema), // zodOutputFormat takes ONE arg (schema). NO name param.
    // Alternative: { type: 'json_schema', schema: z.toJSONSchema(ChalkSpecSchema) } for manual conversion
  },
  system: systemPrompt,
  messages: [{ role: 'user', content: query }],
});

// Option B: messages.parse() -- auto-validates with Zod (RECOMMENDED)
// CONFIRMED: works with thinking + zodOutputFormat. Parser skips thinking blocks.
const parsed = await client.messages.parse({
  model: 'claude-opus-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },
  output_config: {
    effort: 'max',
    format: zodOutputFormat(ChalkSpecSchema),
  },
  system: systemPrompt,
  messages: [{ role: 'user', content: query }],
});
// parsed.parsed_output is typed and validated (NOT parsed.output)
```

**Haiku model ID**: `claude-haiku-4-5` (hyphens, not dots)

### Technical Gotchas

| Area | Gotcha | Fix |
|------|--------|-----|
| mathjs | `log()` is natural log (not `ln()`) | System prompt must be explicit |
| mathjs | Multiplication must be explicit: `2*x` not `2x` | System prompt must be explicit |
| mathjs | Exponents: `x^2` not `x**2` | System prompt must be explicit |
| mathjs | Do NOT disable `parse()` in sandbox -- `compile()` depends on it | Only disable `evaluate()`, `import()`, `createUnit()`. See TECH_SPEC.md math.ts. |
| Structured Outputs | No recursive schemas, no min/max, no minLength/maxLength, `additionalProperties` must be `false` | Zod `.min()/.max()` still enforced at runtime (Layer 3). Use Zod v4 native `z.toJSONSchema()` or `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`. See TECH_SPEC.md Section 9. |
| Anthropic SDK | `zodOutputFormat(schema)` takes ONE arg -- NO name parameter. `messages.parse()` returns `parsed.parsed_output` (NOT `parsed.output`). `messages.parse()` WORKS with `thinking: { type: 'adaptive' }` -- parser skips thinking blocks and only processes text blocks. | Use `messages.parse()` with thinking for best-of-both-worlds: adaptive reasoning + auto-validated structured output. |
| R3F | Always `dynamic(() => import('./ThreeDSurface'), { ssr: false })` | No WebGL on server |
| R3F | `<Canvas>` creates own React root -- context doesn't pass through | Pass data via props, not context |
| R3F | Set `<Canvas gl={{ preserveDrawingBuffer: true }}>` for export | Goes in `gl` prop object, not top-level |
| R3F | Resolution 64 default, 96 max (not 128 -- lags on mobile) | Cap in schema and component |
| Mafs | `useMovablePoint` constraint: `"horizontal"`/`"vertical"` not `"x-axis"`/`"y-axis"` | Map in MafsPlot2D.tsx |
| Mafs | `viewBox` is `{ x: [min,max], y: [min,max] }` object | Map from schema's xDomain/yDomain |
| Mafs | `zoom` is opt-in (default false) | Enable explicitly when schema requests it |
| json-render | v0.5.2 released Feb 9 -- literally yesterday. May have fresh bugs. **Known issues**: #53 (infinite re-renders from Renderer — can freeze UI), #54 (multiple renderings on single input), #55 (docs mismatch for useUIStream — `spec` not `tree`, `isStreaming` not `isLoading`, `api` not `endpoint`), #42 (JSONL patch format confusion), #49 (bundle size scaling). v0.5.1 added built-in error boundaries — bad components silently disappear instead of white-screen. | Pin exact version. Test thoroughly. If #53 hits, use fallback ChalkCanvas (createSpecStreamCompiler). |
| json-render | **BOTH `DataProvider` AND `StateProvider` exist** in v0.5.2. `DataProvider` manages app data with JSON Pointer paths (`useData()` → `getData(path)`, `setData(path, value)`). `StateProvider` manages UI state separately. Also: `ActionProvider`, `VisibilityProvider`, `ValidationProvider`. `JSONUIProvider` exists as convenience wrapper. **For Chalk**: Use `StateProvider` + `ActionProvider` (no app data model needed). `useUIStream` returns `{ spec, isStreaming, error, usage, send, clear }` -- note `usage: TokenUsage \| null` (undocumented). | Use `StateProvider` + `ActionProvider`. Track `usage` for cost display in dev mode. |
| json-render | Peer dep for react is `^19.2.3` (stricter than docs claim `^19.0.0`). | Ensure `react@^19.2.3` in package.json. |
| Zod | v4 is stable (4.3.6). Same API as v3 for our patterns. json-render requires it. Native `z.toJSONSchema()` -- no need for `zod-to-json-schema` (end-of-life). Anthropic SDK supports Zod `^3.25.0 \|\| ^4.0.0`. | No Zod conflict -- resolved. |
| effort param | Lives inside `output_config`, NOT top-level | `output_config: { effort: "max" }` |
| 1M context | Beta only. Requires `context-1m-2025-08-07` header + tier 4 | Default 200K is enough. Don't rely on 1M. |
| AI SDK v6 | `generateObject`/`streamObject` are DEPRECATED. Use `streamText` with `output: Output.object({ schema })`. `providerOptions.anthropic.effort` only supports `'low'\|'medium'\|'high'` (NOT `'max'`). For `'max'`, use direct Anthropic SDK. | New unified API. See TECH_SPEC.md Sections 5 & 9. |
| AI SDK v6 | `structuredOutputMode: "outputFormat"` uses native grammar-constrained decoding (avoids tool_choice conflict with thinking). `"jsonTool"` forces `toolChoice: required` which BREAKS thinking. `"auto"` resolves to `"outputFormat"` on opus-4-6/sonnet-4-5/haiku-4-5. | Use `structuredOutputMode: "outputFormat"` when combining `Output.object` + `thinking: { type: 'adaptive' }`. Import `Output` from `'ai'`. |
| Supabase | `nanoid()` is NOT a built-in Postgres function | Generate ID server-side: `import { nanoid } from 'nanoid'` then pass on insert |
| Supabase | `@supabase/ssr` is NOT needed (Chalk has no auth) | Use `createClient` from `@supabase/supabase-js` directly. No cookie handling needed. |
| Supabase | Free tier projects pause after 7 days inactivity | Add optional keepalive cron route. During hackathon week + judging this is not a concern. |
| Supabase | Free tier: 500MB DB, 1GB storage, 2GB bandwidth, unlimited API, 2 projects max | Chalk will use <1% of all limits. |
| Export | `html2canvas` is unmaintained (v1.4.1, 4+ years old, 922 open issues). Poor SVG support. Cannot capture WebGL. | Use `modern-screenshot` (v4.6.8, Jan 2026) via dynamic import. For R3F: `gl.domElement.toDataURL()`. |
| Vercel | Fluid Compute (enabled by default since Apr 2025) gives Hobby plan 300s max. Legacy mode caps at 60s. Duration = wall-clock time from start to last byte. AI streaming is I/O-bound so active CPU billing is minimal. | Set `maxDuration: 300` for AI routes. New projects have Fluid Compute by default. |
| Thinking tokens | `max_tokens` includes BOTH thinking and response tokens. At high/max effort, Opus may use 10-15K+ for thinking. If `stop_reason: "max_tokens"`, increase `max_tokens` or lower effort. | Set `max_tokens: 32000` (not 16K). Haiku max output is 64K (not 32K). |
| catalog.prompt() | Generates 7+ section system prompt: JSONL format, component props, actions, state, visibility, events, rules. Already includes flat element map + RFC 6902 instructions. | CHALK_DEEP_SYSTEM_PROMPT supplements (not replaces) catalog.prompt(). Concatenation order: `catalog.prompt() + CREATIVE + CHALK_DEEP`. Our prompt adds pedagogical guidance, expression syntax, color palette. |
| json-render | **CORRECTED (Iteration 8)**: Providers: `StateProvider` (NOT `DataProvider`), `ActionProvider`, `VisibilityProvider`. `DataProvider` does NOT exist — use `StateProvider`. `JSONUIProvider` exists as convenience wrapper but Chalk uses separate providers. `useUIStream({ api, onComplete?, onError? })` requires calling `send(prompt, context?)` -- does NOT auto-send. `send()` POSTs `{ prompt, context, currentSpec }`. Returns `Promise<void>`. Response must be plain text stream (NOT SSE) via `toTextStreamResponse()`. `useUIStream` returns `{ spec, isStreaming, error, usage, send, clear }` — note `usage: TokenUsage | null` field. | Verify import paths from `@json-render/react`. `schema` is a named export from `@json-render/react` (not `/schema` subpath). API route destructure: `const { prompt, context } = await req.json()`. |
| **Opus 4.6 BREAKING** | **Prefill is NOT supported on Opus 4.6.** Requests with prefilled assistant messages return a **400 error**. This is a BREAKING CHANGE from Opus 4.1. | Use system prompt instructions, structured outputs (`output_config.format`), or `output_config.format` for JSON. Never prepend assistant turns. |
| Opus 4.6 new | Fast mode: `speed: "fast"` gives 2.5x faster output at premium pricing ($30/$150 per MTok). Requires beta header `fast-mode-2026-02-01`. | Could use for Haiku-like speed on Opus quality queries. NOT for hackathon (premium pricing eats $500 credits). |
| Opus 4.6 new | Compaction API: automatic server-side context summarization for infinite conversations. | Not needed for Chalk (single-turn). But mention in README as Opus 4.6 feature awareness. |
| Opus 4.6 new | Fine-grained tool streaming is now GA (no beta header). | Not directly used by Chalk, but shows awareness. |
| Opus 4.6 new | `output_format` param is officially deprecated → `output_config.format`. Old param still works but flagged. | Already using `output_config.format`. Correct. |
| Opus 4.6 new | Tool parameter quoting: slightly different JSON string escaping in tool use parameters compared to previous models. May cause issues with mathjs expressions containing backslashes. | Test tool use with math expressions early. If issues, escape backslashes in system prompt examples. |
| react-katex | `@matejmazur/react-katex` is **effectively unmaintained** (5 years old, last publish 2021, 9 open issues, no React 19 work). May silently break. | **Recommended alternative**: Use `katex.renderToString()` directly with a thin `"use client"` wrapper: `<div dangerouslySetInnerHTML={{ __html: katex.renderToString(expr, { throwOnError: false }) }} />`. Avoids unmaintained dependency. Keep react-katex in deps as backup. |
| D3 v7 | ESM-only. Works with App Router BUT components using D3 must have `"use client"` directive AND be dynamically imported with `ssr: false` if they access browser APIs (e.g., `document`, `window`). | Wrap ProbabilityViz.tsx with `"use client"`. Use `dynamic(() => import('./ProbabilityViz'), { ssr: false })` if D3 touches DOM directly. |
| Mafs | Default `viewBox` is `{ x: [-3, 3], y: [-3, 3] }` with padding 0.5 -- NOT `[-10, 10]`. | Schema defaults say `[-10, 10]` -- this will override Mafs defaults. Correct behavior but be aware. |
| Mafs | `Coordinates.Cartesian` supports per-axis config: `xAxis={{ lines: 1, subdivisions: 4 }}`, `yAxis={{ lines: 1, subdivisions: 4 }}`. Can also set `xAxis={false}` to disable entirely. | More granular than just global `subdivisions`. Use for cleaner visualizations. |
| R3F 3D Surface | Use `ParametricGeometry` from `three/addons/geometries/ParametricGeometry.js` for math surfaces. Constructor: `new ParametricGeometry(func, slices, stacks)` where `func(u, v, target)` maps [0,1]×[0,1] to Vector3. | CRITICAL for ThreeDSurface.tsx. Map `u,v ∈ [0,1]` to `x ∈ xDomain`, `y ∈ yDomain`, compute `z = f(x,y)`. Resolution param maps to slices/stacks. |

### Supabase Schema

```sql
-- NOTE: nanoid() is NOT a built-in Supabase/Postgres function.
-- Generate the ID server-side using the nanoid npm package and pass it on insert.
CREATE TABLE visualizations (
  id TEXT PRIMARY KEY,
  spec JSONB NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  view_count INTEGER DEFAULT 0
);

ALTER TABLE visualizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON visualizations FOR SELECT USING (true);
CREATE POLICY "Insert via API" ON visualizations FOR INSERT WITH CHECK (true);

CREATE INDEX idx_viz_created ON visualizations(created_at DESC);
```

### Vercel Config

```json
{
  "framework": "nextjs",
  "regions": ["sfo1"],
  "functions": {
    "app/api/generate/route.ts": {
      "maxDuration": 300
    }
  }
}
```

### Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_BASE_URL=https://chalk.vercel.app
```

---

## Cross-Reference Guide

| Document | What It Contains | When To Use |
|----------|-----------------|-------------|
| **BATTLE_PLAN.md** (this) | Master execution plan | Wake up -> open this -> build |
| **TECH_SPEC.md** | Architecture, schemas, system prompt, API design, all code snippets | When implementing any component |
| **CHALK_SPEC.md** (.internal) | Original research spec | Reference only. All questions answered in other docs. |
| **CLAUDE.md** | Project instructions for Claude Code | Keep updated throughout. Part of submission. |

---

## Daily Checklist

1. Open this document.
2. Find today's section.
3. Execute tasks in order.
4. Commit with descriptive messages.
5. Deploy to Vercel.
6. Test deployed version.
7. Stop at 10PM.

---

## The One Thing That Matters

Make the demo video so good that a judge wants to watch it twice.

Everything else -- architecture, code quality, tech decisions -- serves that goal. If a feature doesn't make the demo better, it doesn't matter this week.

Type any math concept. Get instant understanding. That's Chalk.

Now build it.
