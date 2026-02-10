# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (includes TypeScript checking; no separate lint config at root)

## Architecture

Chalk is a single-page Next.js 16 app. User types a math question → API streams back explanation text + a JSON visualization spec → client renders interactive 2D/3D plots, LaTeX, and text.

### Data Flow

1. **User input** → `ChatInterface.tsx` sends prompt + model choice + history to `/api/generate`
2. **API route** (`app/api/generate/route.ts`) selects model (Opus/Sonnet/Haiku), streams response. For Opus: reasoning tokens stream first, then `\x1E` separator, then text+JSON. For others: plain text stream.
3. **Client parsing** → `parseStreamContent()` in ChatInterface splits reasoning from text, then splits text from JSON. JSON is detected by `{"root"` marker.
4. **Rendering** → `ChatMessage.tsx` calls `renderElement()` which recursively walks the flat `ChalkSpec` element map and renders each element type.

### Visualization Spec Format (ChalkSpec)

Claude returns a flat JSON structure — NOT nested React components:
```
{ "root": "container_1", "elements": { "container_1": { "type": "vizContainer", ... "children": ["plot_1"] }, "plot_1": { "type": "plot2d", "props": { "functions": [...] } } } }
```

Element types: `vizContainer`, `plot2d`, `plot3d`, `latex`, `textBlock`. Schemas in `lib/schemas/`.

### Model Selection

User can pick Auto/Opus/Sonnet/Haiku via `ModelSelector.tsx`. Auto uses `lib/router.ts` to classify queries as fast/deep/creative. The `model` param is sent to the API route which resolves it. Only Opus gets adaptive thinking (reasoning tokens + `\x1E` separator protocol).

### Expression Engine

`lib/math.ts` wraps mathjs with sandboxed compilation. `exprToPlotFn(expr)` for 2D (variable: x), `exprToSurfaceFn(expr)` for 3D (variables: x, y). The compiler normalizes common LLM mistakes (`**` → `^`, `\cdot` → `*`).

### 3D Rendering

`ThreeDSurface.tsx` uses React Three Fiber. It is dynamically imported with `ssr: false` in ChatMessage.tsx. The surface is built as a BufferGeometry with indexed triangles and vertex colors (height-mapped gradient).

### Persistence

- `lib/conversations.ts` — dual localStorage (instant) + Supabase (durable) persistence
- `lib/supabase.ts` — share URLs via `visualizations` table, conversations via `conversations` table
- `lib/demo-cache.ts` — pre-cached golden specs for 4 demo prompts, matched by fuzzy keyword

### System Prompts

`lib/prompts.ts` has three prompts: `CHALK_DEEP_SYSTEM_PROMPT` (Opus), `FAST_SYSTEM_PROMPT` (Haiku/Sonnet), `CREATIVE_SYSTEM_PROMPT` (prefix for creative queries). The prompts instruct Claude to output explanation text first, then a raw JSON spec starting with `{"root"` on its own line.

## Key Conventions

- All viz components must be wrapped in `SafeVizWrapper` (ErrorBoundary + Suspense)
- plot2d expressions use mathjs syntax with variable `x` (e.g., `"sin(x)"`, `"x^2"`)
- plot3d expressions use mathjs syntax with variables `x` and `y` (e.g., `"sin(sqrt(x^2 + y^2))"`)
- latex expressions use standard LaTeX (double-escaped in JSON: `"\\\\frac{}{}"`)
- Tailwind theme colors: `chalk-bg`, `chalk-surface`, `chalk-border`, `chalk-text`, `chalk-accent`
- Dark theme only (class `dark` on html element)

## Environment Variables

Required in `.env.local`:
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BASE_URL` (for share URLs; defaults to localhost:3000)
