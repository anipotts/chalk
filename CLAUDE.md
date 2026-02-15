# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build (includes TypeScript checking; no separate lint config at root)

## Architecture

Chalk is a Next.js 16 app with two features: a **YouTube Video Learning Assistant** (primary, at `/watch?v={id}`) and a **Math Visualizer** (secondary, at `/math`). The landing page (`/`) is a YouTube URL input.

### Video Assistant Data Flow

1. **Landing page** (`app/page.tsx`) — user pastes YouTube URL → extracts video ID → navigates to `/watch?v={id}`
2. **Watch page** (`app/watch/page.tsx`) — loads react-player + fetches transcript via `/api/transcript`
3. **Pause → Chat** — `ChatOverlay` fades in (framer-motion). User types question → sends to `/api/video-chat` with message + transcript segments + current timestamp
4. **API route** (`app/api/video-chat/route.ts`) — builds sliding-window transcript context (2 min before, 1 min after current position) → streams response. Opus gets reasoning + `\x1E` separator protocol (same as math route).
5. **Timestamp citations** — AI responds with `[M:SS]` references. `parseTimestampLinks()` converts these to clickable `TimestampLink` pills that seek the video.
6. **Resume** — user presses play → chat overlay fades out

### Math Visualizer Data Flow

1. **User input** → `ChatInterface.tsx` sends prompt + model choice + history to `/api/generate`
2. **API route** (`app/api/generate/route.ts`) selects model (Opus/Sonnet/Haiku), streams response. For Opus: reasoning tokens stream first, then `\x1E` separator, then text+JSON. For others: plain text stream.
3. **Client parsing** → `splitReasoningFromText()` splits on `\x1E`, then `parseStreamContent()` detects JSON by `{"root"` marker.
4. **Rendering** → `ChatMessage.tsx` calls `renderElement()` which recursively walks the flat `ChalkSpec` element map and renders each element type.

### Client/Server Code Boundary

This is the most important architectural constraint:

- **`lib/video-utils.ts`** — client-safe utilities (extractVideoId, parseTimestampLinks, formatTimestamp, buildVideoContext). Safe to import from any component.
- **`lib/transcript.ts`** — server-only transcript fetching. Imports `youtube-transcript` and `youtube-dl-exec` (uses `child_process`). **NEVER import from client components** — will break the build.

The same pattern applies to all Node.js-dependent code: keep it in API routes or server-only lib files.

### Streaming Protocol

Both `/api/generate` and `/api/video-chat` use the same streaming protocol:
- **Opus mode**: reasoning tokens → `\x1E` (record separator) → text content. Client uses `splitReasoningFromText()` to separate.
- **Fast mode** (Sonnet/Haiku): plain text via `toTextStreamResponse()`. No reasoning, no separator.

### Visualization Spec Format (ChalkSpec)

Claude returns a flat JSON structure — NOT nested React components:
```
{ "root": "container_1", "elements": { "container_1": { "type": "vizContainer", ... "children": ["plot_1"] }, "plot_1": { "type": "plot2d", "props": { "functions": [...] } } } }
```

Element types: `vizContainer`, `plot2d`, `plot3d`, `latex`, `textBlock`. Schemas in `lib/schemas/`.

### Model Selection

User can pick Auto/Opus/Sonnet/Haiku via `ModelSelector.tsx`. Auto uses `lib/router.ts` to classify queries as fast/deep/creative. Only Opus gets adaptive thinking (reasoning tokens + `\x1E` separator). Video chat defaults to Sonnet.

### Expression Engine

`lib/math.ts` wraps mathjs with sandboxed compilation. `exprToPlotFn(expr)` for 2D (variable: x), `exprToSurfaceFn(expr)` for 3D (variables: x, y). The compiler normalizes common LLM mistakes (`**` → `^`, `\cdot` → `*`).

### 3D Rendering

`ThreeDSurface.tsx` uses React Three Fiber. It is dynamically imported with `ssr: false` in ChatMessage.tsx. The surface is built as a BufferGeometry with indexed triangles and vertex colors (height-mapped gradient).

### Video Player

`VideoPlayer.tsx` uses `react-player` v3 (maintained by Mux) with the YouTube auto-detection. The ref is a standard `HTMLVideoElement` — no custom proxy wrappers needed. Must be dynamically imported with `ssr: false`. Keyboard shortcuts: Space/K (play/pause), J/L (±10s), arrows (±5s), F (fullscreen), </> (speed ±0.25x).

### Persistence

- `lib/conversations.ts` — dual localStorage (instant) + Supabase (durable) persistence for math conversations
- `lib/supabase.ts` — share URLs via `visualizations` table, conversations via `conversations` table
- `lib/demo-cache.ts` — pre-cached golden specs for 4 demo prompts, matched by fuzzy keyword
- Recent videos stored in localStorage (`chalk-recent-videos`)

### System Prompts

- `lib/prompts.ts` — three math prompts: `CHALK_DEEP_SYSTEM_PROMPT` (Opus), `FAST_SYSTEM_PROMPT` (Haiku/Sonnet), `CREATIVE_SYSTEM_PROMPT` (prefix for creative queries). Instruct Claude to output text first, then JSON starting with `{"root"`.
- `lib/prompts/video-assistant.ts` — `VIDEO_ASSISTANT_SYSTEM_PROMPT` instructs Claude to cite timestamps as `[M:SS]`, keep answers concise (2-4 sentences), and reference specific video moments. `buildVideoSystemPrompt()` interpolates transcript context window + current position.

## Key Conventions

- `react-player` v3 exposes a standard `HTMLVideoElement` ref — use `.currentTime`, `.paused`, `.play()`, `.pause()`, `.playbackRate` directly
- React 19: `useRef` requires explicit initial value (`useRef<T>(null)` or `useRef<T>(undefined)`)
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
- `ELEVENLABS_API_KEY` (voice cloning + TTS via ElevenLabs)
