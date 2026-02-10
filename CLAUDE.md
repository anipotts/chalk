# Chalk — AI Math Visualization Tool

## Project Overview

Interactive math visualizations powered by Claude. Like texting a mathematician — ask a question, get a beautiful interactive explanation.

## Tech Stack

Next.js 16, TypeScript, Tailwind CSS, Mafs (2D plots), KaTeX (LaTeX), mathjs (expression engine), Vercel AI SDK, Claude API

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — run linter

## Architecture

```
app/
  layout.tsx            — Root layout, KaTeX CSS, Inter font, dark theme
  page.tsx              — Renders <ChatInterface />
  api/generate/route.ts — POST: prompt → Claude streamText → JSON viz spec

components/
  ChatInterface.tsx     — iMessage-style chat with streaming
  ChatMessage.tsx       — Renders user/assistant bubbles, parses specs into viz
  MafsPlot2D.tsx        — 2D math plots via Mafs library
  LatexDisplay.tsx      — KaTeX rendering (katex.renderToString)
  VizContainer.tsx      — Layout wrapper with title/description
  SafeVizWrapper.tsx    — ErrorBoundary + Suspense fallback

lib/
  schemas/              — Zod schemas for visualization spec format
  math.ts               — Sandboxed mathjs expression compiler
  prompts.ts            — System prompts (deep/fast/creative modes)
  router.ts             — Query classification for model routing
```

## Key Patterns

- Claude returns a flat JSON spec (`{ root, elements }`) — NOT nested components
- `element.props` uses mathjs syntax for expressions (e.g., `"sin(x)"`, `"x^2"`)
- LaTeX uses standard LaTeX syntax (e.g., `"\\frac{d}{dx}"`)
- Model routing: simple queries → Haiku (fast), complex → Opus (deep)
- All viz components are wrapped in SafeVizWrapper (ErrorBoundary + Suspense)

## Local Planning Docs

Development planning artifacts are in `.planning/` (gitignored). Contains TECH_SPEC.md, BATTLE_PLAN.md, and research notes.
