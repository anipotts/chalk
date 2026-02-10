# Chalk -- Technical Specification

> Single source of truth for building Chalk. Every snippet is copy-pasteable. Every version is pinned. Zero ambiguity.

---

## 1. Stack & Dependencies

### Install

```bash
npx create-next-app@latest chalk --ts --tailwind --app --src-dir=false --import-alias="@/*"
cd chalk
npm i @json-render/core@^0.5.2 @json-render/react@^0.5.2 \
  ai@^6.0.78 @ai-sdk/anthropic@^3.0.40 \
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
  @anthropic-ai/sdk@^0.74.0 \
  react-error-boundary@^5.0.0

npm i -D typescript@^5.7.0 tailwindcss@^3.4.17 \
  @types/three@^0.182.0 @types/d3@^7.4.3 \
  @types/react@^19.0.0 @types/react-dom@^19.0.0 \
  eslint@^9.0.0 eslint-config-next@^15.1.0
```

### Full `package.json` dependencies

```json
{
  "dependencies": {
    "next": "^15.1.0",
    "@json-render/core": "^0.5.2",
    "@json-render/react": "^0.5.2",
    "ai": "^6.0.78",
    "@ai-sdk/anthropic": "^3.0.40",
    "mafs": "^0.21.0",
    "@react-three/fiber": "^9.5.0",
    "@react-three/drei": "^10.7.7",
    "three": "^0.182.0",
    "d3": "^7.9.0",
    "katex": "^0.16.28",
    "mathjs": "^15.1.0",
    "@supabase/supabase-js": "^2.49.1",
    "motion": "^12.34.0",
    "modern-screenshot": "^4.6.8",
    "nanoid": "^5.0.9",
    "zod": "^4.0.0",
    "@anthropic-ai/sdk": "^0.74.0",
    "react-error-boundary": "^5.0.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tailwindcss": "^3.4.17",
    "@types/three": "^0.182.0",
    "@types/d3": "^7.4.3",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.1.0"
  }
}
```

### Version Rationale

| Package | Why this version |
|---|---|
| `next@15.1` | App Router streaming, Server Actions, zero-config Vercel deploy |
| `@json-render/*@0.5.2` | Vercel Labs generative UI framework (10.1k GitHub stars); `defineCatalog` + `useUIStream` + JSONL streaming. v0.5.2 released Feb 9 2026 -- fixes hallucination by dynamically generating prompt examples from YOUR catalog |
| `ai@6.0.78` | Vercel AI SDK v6; `streamText` is the unified API (`streamObject` deprecated) |
| `@ai-sdk/anthropic@3.0.40` | AI SDK provider for `anthropic('claude-opus-4-6')` |
| `@anthropic-ai/sdk@0.74.0` | Direct Anthropic SDK for Structured Outputs via `zodOutputFormat` + `client.messages.parse()`. Zod peer dep: `^3.25.0 \|\| ^4.0.0` |
| `mafs@0.21.0` | Declarative 2D math plots; SVG-based, ~30KB gzipped |
| `three@0.182.0` + R3F `9.5.0` + Drei `10.7.7` | 3D surfaces; ~150KB gzipped total; always `{ ssr: false }`. R3F v9 breaking changes: `Canvas Props` → `CanvasProps`, hardcoded exports like `MeshProps` removed (use `ThreeElements['mesh']` instead). React 19 compatible. |
| `d3@7.9.0` | Computation only (no DOM); ESM-only; sub-modules: `d3-scale`, `d3-shape`, `d3-random`, `d3-array`. **Next.js 15 note**: Components using D3 MUST have `"use client"` directive. If D3 code touches browser APIs (DOM, window), use `dynamic(() => import('./Component'), { ssr: false })`. For computation-only usage (scales, arrays), `"use client"` alone suffices. |
| `katex@0.16.28` | 10x faster than MathJax; universal fallback renderer. **Do NOT use `@matejmazur/react-katex`** — unmaintained (5 years old, last published 2021, 9 open issues, no React 19 work). Instead, use `katex.renderToString(expr, { throwOnError: false })` + `dangerouslySetInnerHTML` in a thin `"use client"` wrapper. This is simpler, safer, and avoids an unmaintained dependency. Works in both client and server components. Import CSS globally: `import 'katex/dist/katex.min.css'` in layout.tsx. |
| `mathjs@15.1.0` | Sandboxed expression eval; `compile()` + `parse()` + `derivative()` |
| `zod@4.0.0` | Peer dep of `@json-render/core`; stable at 4.3.6; same API surface as v3 for our patterns (z.object, z.enum, z.discriminatedUnion, .refine all work identically). Zod v4 has NATIVE JSON Schema generation: `z.toJSONSchema(schema)` -- no need for `zod-to-json-schema` (which is end-of-life at v3.25.1). Anthropic SDK v0.74.0 supports Zod `^3.25.0 || ^4.0.0` as optional peer dep. |
| `motion@12.34.0` | Formerly `framer-motion`; SVG animation for matrix transforms. Import from `"motion/react"` (needs `"use client"`). `motion.g`, `motion.line`, `motion.path` all work. v12 auto-applies `transform-box: fill-box` for SVGs. No breaking React API changes from framer-motion. |
| `modern-screenshot@4.6.8` | DOM-to-image export. Replaces unmaintained `html2canvas` (v1.4.1, 4+ years old, 922 open issues, poor SVG, no WebGL). Uses SVG foreignObject approach (3x faster, better fidelity). **Must use `await import('modern-screenshot')` for SSR safety.** For R3F WebGL: use `gl.domElement.toDataURL()` directly. |
| `tailwindcss@3.4.17` | v3 not v4 -- stability for hackathon |

---

## 2. Architecture

### Data Flow

```
User Input ("Show me Fourier transform")
       |
       v
  Model Router  -----> classify("fast" | "deep" | "creative")
       |
       v
  POST /api/generate
       |  catalog.prompt() + CHALK_SYSTEM_PROMPT
       |  streamText({ model: anthropic('claude-opus-4-6'), ... })
       |
       v
  JSONL Stream (RFC 6902 patches)
       |
       v
  useUIStream()  -----> parse JSONL -> apply patches -> Spec
       |
       v
  <Renderer spec={spec} registry={registry} />
       |
       +----> Mafs (2D)   | R3F (3D)   | D3 (Prob)   | Motion (Matrix) | KaTeX (LaTeX)
       |
       v
  [Share] -> POST /api/share -> Supabase JSONB -> /v/[id]
```

### File Structure

```
app/
  layout.tsx              -- Root layout, global providers, KaTeX CSS, fonts
  page.tsx                -- Landing page with input bar
  api/
    generate/
      route.ts            -- POST: prompt -> streamText -> JSONL
    share/
      route.ts            -- POST: save spec to Supabase, return short ID
  v/
    [id]/
      page.tsx            -- SSR shared visualization from Supabase

lib/
  catalog.ts              -- defineCatalog() with all component schemas
  registry.ts             -- defineRegistry() mapping catalog -> React components
  supabase.ts             -- Supabase client, saveVisualization, loadVisualization
  math.ts                 -- compileMathExpr, exprToPlotFn, exprToSurfaceFn
  router.ts               -- classifyQuery() model selection logic
  prompts.ts              -- CHALK_DEEP_SYSTEM_PROMPT, FAST_SYSTEM_PROMPT, CREATIVE_SYSTEM_PROMPT
  schemas/
    spec.ts               -- ChalkSpecSchema, ElementSchema, ChalkMetadataSchema
    vizContainer.ts       -- VizContainerSchema
    stepSequence.ts       -- StepSequenceSchema
    plot2d.ts             -- Plot2DSchema + sub-schemas
    plot3d.ts             -- Plot3DSchema + sub-schemas
    matrix.ts             -- MatrixSchema + sub-schemas
    probability.ts        -- ProbabilitySchema + sub-schemas
    latex.ts              -- LatexSchema
    index.ts              -- Re-exports all schemas

components/
  ChalkCanvas.tsx         -- useUIStream + Renderer wrapper ('use client')
  MafsPlot2D.tsx          -- plot2d -> Mafs composition
  ThreeDSurface.tsx       -- plot3d -> R3F Canvas (dynamic import, ssr: false)
  MatrixViz.tsx           -- matrix -> SVG + motion (v12+, formerly framer-motion)
  ProbabilityViz.tsx      -- probability -> D3 computation + React SVG
  LatexDisplay.tsx        -- latex -> katex.renderToString() thin wrapper (NOT react-katex)
  VizContainer.tsx        -- vizContainer layout wrapper
  StepSequence.tsx        -- stepSequence auto-play controller
  SafeVizWrapper.tsx      -- ErrorBoundary + Suspense fallback chain
  ExportButton.tsx        -- modern-screenshot export (dynamic import to avoid SSR issues)
```

### Fallback Chain

Every component is wrapped in `SafeVizWrapper`. Something always renders.

```
[1] Interactive viz (Mafs / R3F / D3 / Motion)
 |  fail ->
[2] Static SVG snapshot (disable interactivity)
 |  fail ->
[3] KaTeX equation (always generated alongside every viz)
 |  fail ->
[4] Plain text description
```

Implementation:

```typescript
// components/SafeVizWrapper.tsx
'use client';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

function SafeVizWrapper({
  component,
  props,
  fallbackLatex,
  fallbackText,
}: {
  component: React.ComponentType<any>;
  props: any;
  fallbackLatex?: string;
  fallbackText?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        fallbackLatex ? (
          <LatexDisplay expression={fallbackLatex} displayMode="block" fontSize="lg" />
        ) : (
          <div className="text-chalk-text p-4">{fallbackText ?? 'Visualization unavailable'}</div>
        )
      }
    >
      <Suspense fallback={<VizSkeleton />}>
        {React.createElement(component, props)}
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## 3. Component Catalog

All schemas use Zod v4 (`zod@^4.0.0`). Import as `import { z } from 'zod'`.

### 3.1 Top-Level Spec

```typescript
// lib/schemas/spec.ts
import { z } from 'zod';

export const ElementSchema = z.object({
  type: z.enum([
    'vizContainer', 'stepSequence', 'plot2d', 'plot3d', 'matrix', 'probability', 'latex',
  ]),
  props: z.record(z.any()),
  children: z.array(z.string()).optional(),
});

export const ChalkSpecSchema = z.object({
  root: z.string().describe('Key of the root element'),
  elements: z.record(z.string(), ElementSchema),
});

export const ChalkMetadataSchema = z.object({
  prompt: z.string().min(1).max(1000),
  title: z.string().max(200),
  description: z.string().max(500).optional(),
  modelUsed: z.enum(['claude-opus-4-6', 'claude-haiku-4-5']),
  thinkingTrace: z.string().optional(),
  generatedAt: z.string().datetime(),
  version: z.literal('1.0.0'),
});
```

### 3.2 vizContainer

```typescript
// lib/schemas/vizContainer.ts
import { z } from 'zod';

export const VizContainerSchema = z.object({
  title: z.string().max(200),
  description: z.string().max(500).optional(),
  theme: z.enum(['dark', 'light']).default('dark'),
  layout: z.enum(['single', 'split', 'grid']).default('single'),
  showEquation: z.boolean().default(true),
  showControls: z.boolean().default(true),
});
```

Example JSON:

```json
{
  "type": "vizContainer",
  "props": {
    "title": "Fourier Transform Decomposition",
    "description": "A square wave decomposed into its harmonic sine components",
    "layout": "split",
    "showEquation": true,
    "showControls": true
  },
  "children": ["plot_harmonics", "plot_sum", "equation_1"]
}
```

### 3.3 stepSequence

```typescript
// lib/schemas/stepSequence.ts
import { z } from 'zod';

export const StepSequenceSchema = z.object({
  autoPlay: z.boolean().default(true),
  stepDuration: z.number().min(500).max(10000).default(2000),
  showStepIndicator: z.boolean().default(true),
  loop: z.boolean().default(false),
  labels: z.array(z.string()).optional(),
});
```

Example JSON:

```json
{
  "type": "stepSequence",
  "props": {
    "autoPlay": true,
    "stepDuration": 2500,
    "showStepIndicator": true,
    "labels": ["Base signal", "Add 1st harmonic", "Add 3rd harmonic", "Full approximation"]
  },
  "children": ["step_1", "step_2", "step_3", "step_4"]
}
```

### 3.4 plot2d

Rendered by Mafs. Supports functions, parametric curves, vector fields, inequalities, annotations, movable points.

```typescript
// lib/schemas/plot2d.ts
import { z } from 'zod';

const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6');
const DomainSchema = z.tuple([z.number(), z.number()]);
const LineStyleSchema = z.enum(['solid', 'dashed']).default('solid');

const FunctionDefSchema = z.object({
  expr: z.string().min(1),
  color: ColorSchema,
  label: z.string().max(50).optional(),
  style: LineStyleSchema,
  weight: z.number().min(0.5).max(8).default(2),
});

const ParametricDefSchema = z.object({
  xExpr: z.string(),
  yExpr: z.string(),
  tDomain: DomainSchema,
  color: ColorSchema,
  label: z.string().max(50).optional(),
  style: LineStyleSchema,
  weight: z.number().min(0.5).max(8).default(2),
});

const VectorFieldDefSchema = z.object({
  dxExpr: z.string(),
  dyExpr: z.string(),
  step: z.number().min(0.5).max(3).default(1),
  color: ColorSchema,
});

const InequalityDefSchema = z.object({
  upperExpr: z.string(),
  lowerExpr: z.string(),
  color: ColorSchema.default('#3b82f680'),
  fillOpacity: z.number().min(0).max(1).default(0.15),
});

const AnnotationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), x: z.number(), y: z.number(), label: z.string().optional(), color: ColorSchema }),
  z.object({ type: z.literal('vector'), tail: z.tuple([z.number(), z.number()]).default([0, 0]), tip: z.tuple([z.number(), z.number()]), color: ColorSchema, label: z.string().optional() }),
  z.object({ type: z.literal('circle'), center: z.tuple([z.number(), z.number()]), radius: z.number().positive(), color: ColorSchema, fillOpacity: z.number().min(0).max(1).default(0) }),
  z.object({ type: z.literal('text'), x: z.number(), y: z.number(), content: z.string(), color: ColorSchema, size: z.number().min(8).max(32).default(14) }),
  z.object({ type: z.literal('line'), from: z.tuple([z.number(), z.number()]), to: z.tuple([z.number(), z.number()]), color: ColorSchema, style: LineStyleSchema }),
]);

export const Plot2DSchema = z.object({
  functions: z.array(FunctionDefSchema).default([]),
  parametric: z.array(ParametricDefSchema).default([]),
  vectorField: VectorFieldDefSchema.optional(),
  inequalities: z.array(InequalityDefSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
  xDomain: DomainSchema.default([-10, 10]),
  yDomain: DomainSchema.default([-10, 10]),
  padding: z.number().min(0).max(5).default(0.5),
  showGrid: z.boolean().default(true),
  showAxes: z.boolean().default(true),
  gridSubdivisions: z.number().min(1).max(10).default(4),
  aspectRatio: z.enum(['contain', 'stretch']).default('contain'),
  height: z.number().min(200).max(800).default(400),
  interactive: z.boolean().default(true),
  zoom: z.boolean().default(false),
  movablePoints: z.array(z.object({
    id: z.string(),
    initial: z.tuple([z.number(), z.number()]),
    color: ColorSchema,
    label: z.string().optional(),
    constrainTo: z.enum(['x-axis', 'y-axis', 'function', 'none']).default('none'),
    // NOTE: Mafs useMovablePoint uses "horizontal"/"vertical" not "x-axis"/"y-axis".
    // MafsPlot2D.tsx must map: "x-axis" -> "horizontal", "y-axis" -> "vertical"
    constrainFunctionIndex: z.number().optional(),
  })).default([]),
  minSamplingDepth: z.number().min(4).max(16).default(8),
  maxSamplingDepth: z.number().min(8).max(16).default(12),
}).refine(
  (data) => data.functions.length > 0 || data.parametric.length > 0 ||
            data.vectorField !== undefined || data.inequalities.length > 0 ||
            data.annotations.length > 0,
  { message: 'plot2d must have at least one content element' }
);

export type Plot2DProps = z.infer<typeof Plot2DSchema>;
```

Schema-to-Mafs mapping:

| Schema field | Mafs component | Mafs prop |
|---|---|---|
| `functions[i].expr` | `<Plot.OfX>` | `y={(x) => compileMathExpr(expr)({x})}` |
| `parametric[i]` | `<Plot.Parametric>` | `xy={(t) => [compile(xExpr)({t}), compile(yExpr)({t})]}` `domain={tDomain}` |
| `vectorField` | `<Plot.VectorField>` | `xy={([x,y]) => [compile(dxExpr)({x,y}), compile(dyExpr)({x,y})]}` `step={step}` |
| `inequalities[i]` | `<Plot.Inequality>` | `y={{ ">": compile(lower), "<=": compile(upper) }}` (supports `>`, `<`, `>=`, `<=`) |
| `xDomain` / `yDomain` | `<Mafs>` | `viewBox={{ x: xDomain, y: yDomain }}` |
| `interactive` | `<Mafs>` | `pan={interactive}` |
| `zoom` | `<Mafs>` | `zoom={zoom}` |
| `showGrid` | `<Coordinates.Cartesian>` | render if true |
| `annotations[type=point]` | `<Point>` | `x={x} y={y}` |
| `annotations[type=vector]` | `<Vector>` | `tail={tail} tip={tip}` |
| `annotations[type=circle]` | `<Circle>` | `center={center} radius={radius}` |
| `movablePoints[i]` | `useMovablePoint()` | `useMovablePoint(initial, { constrain })` |
| `gridSubdivisions` | `<Coordinates.Cartesian>` | `subdivisions={gridSubdivisions}` |

**Mafs API mapping notes**:
- `viewBox` format: `{ x: [min, max], y: [min, max], padding?: number }` (object, NOT array). **Default is `{ x: [-3, 3], y: [-3, 3], padding: 0.5 }`** -- NOT `[-10, 10]`. Our schema defaults override this.
- `zoom` is opt-in: `<Mafs zoom={true}>` or `<Mafs zoom={{ min: 0.2, max: 10 }}>`
- `pan` is enabled by default: `<Mafs pan={true}>`
- `height` default is 500px. Can be set as `<Mafs height={400}>`.
- `useMovablePoint` constraint: `"horizontal"` / `"vertical"` (NOT `"x-axis"` / `"y-axis"`)
- `useMovablePoint` returns `{ point: [x, y], x: number, element: JSX, setPoint: (pt) => void }`. **NOTE: `.y` is NOT a direct property** — access y-coordinate via `.point[1]`. `.x` is a convenience accessor for `.point[0]`.
- For dynamic number of movable points, use `<MovablePoint>` component (hooks can't be conditional)
- `Coordinates.Cartesian` supports per-axis config: `<Coordinates.Cartesian xAxis={{ lines: 1, subdivisions: 4 }} yAxis={{ lines: 1, subdivisions: 4 }} />`. Set `xAxis={false}` to disable an axis entirely. Global `subdivisions` prop also works.
- `Coordinates.Polar` is available: `<Coordinates.Polar lines={2} subdivisions={5} />` for radial grids.
- `Plot.Inequality` uses operator keys: `y={{ ">": fn, "<": fn, ">=": fn, "<=": fn }}`. All four operators are valid. Use `">"` / `"<="` for open/closed bounds.
- `labelPi` helper exported from `mafs` for π-labeled axes: `<Coordinates.Cartesian xAxis={{ labels: labelPi }} />`

Example JSON (simple):

```json
{
  "type": "plot2d",
  "props": {
    "functions": [
      { "expr": "sin(x)", "color": "#3b82f6", "label": "sin(x)" },
      { "expr": "cos(x)", "color": "#ef4444", "label": "cos(x)" }
    ],
    "xDomain": [-6.28, 6.28],
    "yDomain": [-1.5, 1.5],
    "interactive": true,
    "showGrid": true
  }
}
```

Example JSON (parametric + vector field):

```json
{
  "type": "plot2d",
  "props": {
    "parametric": [
      {
        "xExpr": "3 * cos(t)", "yExpr": "2 * sin(t)",
        "tDomain": [0, 6.283], "color": "#8b5cf6", "label": "Ellipse"
      }
    ],
    "vectorField": { "dxExpr": "-y", "dyExpr": "x", "step": 0.8, "color": "#6366f1" },
    "annotations": [
      { "type": "point", "x": 0, "y": 0, "label": "Origin", "color": "#f59e0b" },
      { "type": "vector", "tail": [0, 0], "tip": [3, 0], "color": "#10b981", "label": "a" }
    ],
    "xDomain": [-5, 5], "yDomain": [-5, 5], "interactive": true, "zoom": true
  }
}
```

### 3.5 plot3d

Rendered by React Three Fiber + Drei. Always `dynamic(() => import('./Plot3D'), { ssr: false })`.

**CRITICAL IMPLEMENTATION NOTE**: Use `ParametricGeometry` from `three/addons/geometries/ParametricGeometry.js` for surface rendering. It maps `(u, v) ∈ [0,1]×[0,1]` to a Vector3. In ThreeDSurface.tsx, remap u/v to the xDomain/yDomain and compute z = f(x,y):

```typescript
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import * as THREE from 'three';

function createSurfaceGeometry(expr: string, xDomain: [number, number], yDomain: [number, number], resolution: number) {
  const fn = exprToSurfaceFn(expr);
  const geom = new ParametricGeometry(
    (u: number, v: number, target: THREE.Vector3) => {
      const x = xDomain[0] + u * (xDomain[1] - xDomain[0]);
      const y = yDomain[0] + v * (yDomain[1] - yDomain[0]);
      const z = fn(x, y);
      target.set(x, y, isFinite(z) ? z : 0);
    },
    resolution, // slices
    resolution  // stacks
  );
  return geom;
}
```

```typescript
// lib/schemas/plot3d.ts
import { z } from 'zod';

const ColorMapSchema = z.enum(['viridis', 'plasma', 'coolwarm', 'rainbow', 'grayscale']).default('viridis');

const SurfaceDefSchema = z.object({
  expression: z.string(),
  opacity: z.number().min(0.1).max(1).default(0.85),
  wireframe: z.boolean().default(false),
  colorMap: ColorMapSchema,
});

const SpaceCurveDefSchema = z.object({
  xExpr: z.string(), yExpr: z.string(), zExpr: z.string(),
  tDomain: z.tuple([z.number(), z.number()]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f59e0b'),
  weight: z.number().min(1).max(10).default(3),
  label: z.string().max(50).optional(),
});

const AnimatedPointSchema = z.object({
  pathExpression: z.object({ xExpr: z.string(), yExpr: z.string(), zExpr: z.string() }),
  tDomain: z.tuple([z.number(), z.number()]),
  speed: z.number().min(0.1).max(5).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ef4444'),
  radius: z.number().min(0.02).max(0.5).default(0.1),
  showTrail: z.boolean().default(true),
  trailLength: z.number().min(10).max(200).default(50),
});

const Annotation3DSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), position: z.tuple([z.number(), z.number(), z.number()]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f59e0b'), radius: z.number().min(0.02).max(0.5).default(0.08), label: z.string().optional() }),
  z.object({ type: z.literal('vector'), origin: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]), direction: z.tuple([z.number(), z.number(), z.number()]), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'), label: z.string().optional() }),
  z.object({ type: z.literal('label'), position: z.tuple([z.number(), z.number(), z.number()]), text: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f1f5f9') }),
]);

export const Plot3DSchema = z.object({
  surfaces: z.array(SurfaceDefSchema).default([]),
  spaceCurves: z.array(SpaceCurveDefSchema).default([]),
  animatedPoints: z.array(AnimatedPointSchema).default([]),
  annotations: z.array(Annotation3DSchema).default([]),
  xDomain: z.tuple([z.number(), z.number()]).default([-5, 5]),
  yDomain: z.tuple([z.number(), z.number()]).default([-5, 5]),
  zDomain: z.tuple([z.number(), z.number()]).optional(),
  resolution: z.number().min(16).max(96).default(64), // Cap at 96 -- research shows lag above 96 on mobile
  showAxes: z.boolean().default(true),
  showGrid: z.boolean().default(true),
  axisLabels: z.object({ x: z.string().default('x'), y: z.string().default('y'), z: z.string().default('z') }).default({}),
  cameraPosition: z.tuple([z.number(), z.number(), z.number()]).default([5, 5, 5]),
  cameraTarget: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  enableRotate: z.boolean().default(true),
  enableZoom: z.boolean().default(true),
  enablePan: z.boolean().default(true),
  autoRotate: z.boolean().default(false),
  autoRotateSpeed: z.number().min(0.1).max(10).default(1),
  ambientIntensity: z.number().min(0).max(1).default(0.4),
  directionalIntensity: z.number().min(0).max(2).default(0.8),
  height: z.number().min(300).max(800).default(500),
}).refine(
  (data) => data.surfaces.length > 0 || data.spaceCurves.length > 0 ||
            data.animatedPoints.length > 0 || data.annotations.length > 0,
  { message: 'plot3d must have at least one content element' }
);

export type Plot3DProps = z.infer<typeof Plot3DSchema>;
```

Example JSON (gradient descent):

```json
{
  "type": "plot3d",
  "props": {
    "surfaces": [{
      "expression": "sin(sqrt(x^2 + y^2)) + 0.1 * (x^2 + y^2)",
      "colorMap": "coolwarm", "opacity": 0.8
    }],
    "animatedPoints": [{
      "pathExpression": {
        "xExpr": "3 * cos(t) * exp(-0.15 * t)",
        "yExpr": "3 * sin(t) * exp(-0.15 * t)",
        "zExpr": "sin(sqrt((3*cos(t)*exp(-0.15*t))^2 + (3*sin(t)*exp(-0.15*t))^2)) + 0.1*((3*cos(t)*exp(-0.15*t))^2 + (3*sin(t)*exp(-0.15*t))^2)"
      },
      "tDomain": [0, 20], "speed": 0.5, "color": "#ef4444",
      "radius": 0.12, "showTrail": true, "trailLength": 100
    }],
    "xDomain": [-5, 5], "yDomain": [-5, 5], "resolution": 80,
    "autoRotate": true, "autoRotateSpeed": 0.5,
    "cameraPosition": [7, 5, 7], "showAxes": true, "height": 500
  }
}
```

### 3.6 matrix

Rendered as animated SVG with motion (v12+). 2x2 only (2D). 3x3/3D is a stretch goal.

```typescript
// lib/schemas/matrix.ts
import { z } from 'zod';

const Matrix2x2Schema = z.tuple([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number()]),
]);

const VectorDef2DSchema = z.object({
  components: z.tuple([z.number(), z.number()]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  label: z.string().max(20).optional(),
  showComponents: z.boolean().default(false),
});

const TransformStepSchema = z.object({
  matrix: Matrix2x2Schema,
  label: z.string().max(100).optional(),
  duration: z.number().min(300).max(5000).default(1500),
});

export const MatrixSchema = z.object({
  mode: z.enum(['single', 'sequence', 'composition']).default('single'),
  matrix: Matrix2x2Schema.optional(),
  transforms: z.array(TransformStepSchema).optional(),
  vectors: z.array(VectorDef2DSchema).default([
    { components: [1, 0], color: '#3b82f6', label: 'e\u2081' },
    { components: [0, 1], color: '#ef4444', label: 'e\u2082' },
  ]),
  showGrid: z.boolean().default(true),
  gridDensity: z.number().min(3).max(15).default(7),
  showOriginalGrid: z.boolean().default(true),
  showDeterminant: z.boolean().default(true),
  showEigenvalues: z.boolean().default(false),
  showMatrixNotation: z.boolean().default(true),
  domain: z.tuple([z.number(), z.number()]).default([-5, 5]),
  animate: z.boolean().default(true),
  animationDuration: z.number().min(300).max(5000).default(1500),
  animationEasing: z.enum(['spring', 'ease', 'linear']).default('spring'),
  loop: z.boolean().default(false),
  height: z.number().min(300).max(600).default(400),
}).refine(
  (data) => {
    if (data.mode === 'single' && !data.matrix) return false;
    if ((data.mode === 'sequence' || data.mode === 'composition') &&
        (!data.transforms || data.transforms.length === 0)) return false;
    return true;
  },
  { message: 'Must provide matrix (single mode) or transforms (sequence/composition mode)' }
);

export type MatrixProps = z.infer<typeof MatrixSchema>;
```

Example JSON (rotation):

```json
{
  "type": "matrix",
  "props": {
    "mode": "single",
    "matrix": [[0.707, -0.707], [0.707, 0.707]],
    "vectors": [
      { "components": [1, 0], "color": "#3b82f6", "label": "e\u2081" },
      { "components": [0, 1], "color": "#ef4444", "label": "e\u2082" },
      { "components": [2, 1], "color": "#10b981", "label": "v" }
    ],
    "showGrid": true, "showOriginalGrid": true, "showDeterminant": true,
    "animate": true, "animationEasing": "spring"
  }
}
```

Example JSON (transform sequence):

```json
{
  "type": "matrix",
  "props": {
    "mode": "sequence",
    "transforms": [
      { "matrix": [[2, 0], [0, 1]], "label": "Scale x by 2", "duration": 1500 },
      { "matrix": [[1, 0.5], [0, 1]], "label": "Shear", "duration": 1500 },
      { "matrix": [[0, -1], [1, 0]], "label": "Rotate 90 degrees", "duration": 1500 }
    ],
    "showGrid": true, "showDeterminant": true, "showMatrixNotation": true,
    "animate": true, "loop": true
  }
}
```

### 3.7 probability

Rendered with D3 (computation) + React SVG (rendering). Offload >50K samples to Web Worker.

**Implementation pattern**: Use D3 for data computation, React for rendering. Key D3 modules:
- `d3-random` for sampling (d3.randomNormal, d3.randomUniform, d3.randomExponential, etc.)
- `d3-scale` for axis scaling (d3.scaleLinear)
- `d3-shape` for density curves: `d3.line().curve(d3.curveBasis)` for smooth kernel density estimation
- `d3-array` for bin/histogram computation: `d3.bin().domain([min, max]).thresholds(bins)`
- For KDE: Use Epanechnikov kernel with adjustable bandwidth. Map data to `[x, density]` coordinate pairs.
- For Monte Carlo: Use `requestAnimationFrame` loop with `d3.randomNormal` to animate drops one-at-a-time.

```typescript
// lib/schemas/probability.ts
import { z } from 'zod';

const DistributionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('normal'), mean: z.number().default(0), stddev: z.number().positive().default(1) }),
  z.object({ type: z.literal('uniform'), min: z.number().default(0), max: z.number().default(1) })
    .refine(d => d.max > d.min, { message: 'max must be greater than min' }),
  z.object({ type: z.literal('exponential'), lambda: z.number().positive().default(1) }),
  z.object({ type: z.literal('poisson'), lambda: z.number().positive().default(5) }),
  z.object({ type: z.literal('binomial'), n: z.number().int().positive().default(10), p: z.number().min(0).max(1).default(0.5) }),
  z.object({ type: z.literal('beta'), alpha: z.number().positive().default(2), beta: z.number().positive().default(5) }),
  z.object({ type: z.literal('chi-squared'), degreesOfFreedom: z.number().int().positive().default(3) }),
  z.object({ type: z.literal('custom'), pdfExpr: z.string(), domain: z.tuple([z.number(), z.number()]) }),
]);

const AreaHighlightSchema = z.object({
  from: z.number(), to: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f680'),
  label: z.string().optional(),
});

const ComparisonSchema = z.object({
  distributions: z.array(z.object({
    distribution: DistributionSchema,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    label: z.string(),
  })).min(2).max(5),
});

export const ProbabilitySchema = z.object({
  mode: z.enum(['pdf', 'histogram', 'both', 'cdf', 'comparison', 'monte-carlo']).default('both'),
  distribution: DistributionSchema.optional(),
  comparison: ComparisonSchema.optional(),
  sampleSize: z.number().min(100).max(100000).default(10000),
  bins: z.number().min(10).max(200).default(50),
  areaHighlights: z.array(AreaHighlightSchema).default([]),
  showMean: z.boolean().default(true),
  showStdDev: z.boolean().default(true),
  showMedian: z.boolean().default(false),
  showPercentiles: z.array(z.number().min(0).max(100)).default([]),
  monteCarloConfig: z.object({
    animateDrops: z.boolean().default(true),
    dropRate: z.number().min(1).max(100).default(20),
    showRunningStats: z.boolean().default(true),
  }).optional(),
  showAxes: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  xLabel: z.string().max(50).default('x'),
  yLabel: z.string().max(50).default('Density'),
  curveColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  histogramColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f680'),
  height: z.number().min(200).max(600).default(400),
  xDomain: z.tuple([z.number(), z.number()]).optional(),
}).refine(
  (data) => {
    if (data.mode === 'comparison' && !data.comparison) return false;
    if (data.mode !== 'comparison' && !data.distribution) return false;
    return true;
  },
  { message: 'Must provide distribution or comparison' }
);

export type ProbabilityProps = z.infer<typeof ProbabilitySchema>;
```

Example JSON (normal with area highlight):

```json
{
  "type": "probability",
  "props": {
    "mode": "both",
    "distribution": { "type": "normal", "mean": 0, "stddev": 1 },
    "sampleSize": 10000, "bins": 60,
    "areaHighlights": [{ "from": -1, "to": 1, "color": "#3b82f680", "label": "P(-1 < X < 1) = 68.3%" }],
    "showMean": true, "showStdDev": true, "curveColor": "#3b82f6", "height": 400
  }
}
```

Example JSON (Monte Carlo):

```json
{
  "type": "probability",
  "props": {
    "mode": "monte-carlo",
    "distribution": { "type": "normal", "mean": 0, "stddev": 1 },
    "sampleSize": 5000, "bins": 40,
    "monteCarloConfig": { "animateDrops": true, "dropRate": 10, "showRunningStats": true },
    "showMean": true, "showStdDev": true, "height": 400
  }
}
```

### 3.8 latex

Universal fallback. Always generated alongside every visualization component.

```typescript
// lib/schemas/latex.ts
import { z } from 'zod';

export const LatexSchema = z.object({
  expression: z.string().min(1),
  displayMode: z.enum(['block', 'inline']).default('block'),
  fontSize: z.enum(['sm', 'base', 'lg', 'xl', '2xl']).default('lg'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f1f5f9'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  label: z.string().max(100).optional(),
  numbered: z.boolean().default(false),
});

export type LatexProps = z.infer<typeof LatexSchema>;
```

Example JSON:

```json
{
  "type": "latex",
  "props": {
    "expression": "f(x) = \\sum_{n=1}^{\\infty} \\frac{4}{n\\pi} \\sin(n\\pi x), \\quad n \\text{ odd}",
    "displayMode": "block", "fontSize": "lg", "align": "center",
    "label": "Fourier series of a square wave"
  }
}
```

### 3.9 Complete Catalog Definition

```typescript
// lib/catalog.ts
import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react'; // Named export from @json-render/react (NOT /schema subpath)
import { z } from 'zod';
import {
  VizContainerSchema, StepSequenceSchema, Plot2DSchema,
  Plot3DSchema, MatrixSchema, ProbabilitySchema, LatexSchema,
} from './schemas';

export const catalog = defineCatalog(schema, {
  components: {
    vizContainer: { props: VizContainerSchema, description: 'Root container for visualization layout with title, description, and theme',
      // v0.5.2: Optional `example` field helps LLM generate better output (dynamic prompt examples)
      example: { title: 'Fourier Transform', description: 'Decomposition of a square wave', layout: 'split', showEquation: true, showControls: true },
    },
    stepSequence: { props: StepSequenceSchema, description: 'Animated step-through sequence for pedagogical walkthroughs' },
    plot2d: { props: Plot2DSchema, description: '2D function plots, parametric curves, vector fields, and inequalities via Mafs',
      example: { functions: [{ expr: 'sin(x)', color: '#3b82f6', label: 'sin(x)' }], xDomain: [-6.28, 6.28], yDomain: [-1.5, 1.5], interactive: true },
    },
    plot3d: { props: Plot3DSchema, description: '3D surfaces, space curves, and animated points via React Three Fiber',
      example: { surfaces: [{ expression: 'sin(sqrt(x^2 + y^2))', colorMap: 'viridis', opacity: 0.85 }], xDomain: [-5, 5], yDomain: [-5, 5], resolution: 64 },
    },
    matrix: { props: MatrixSchema, description: 'Linear algebra transformation visualization with animated vectors and grids' },
    probability: { props: ProbabilitySchema, description: 'Probability distributions, histograms, density curves, and Monte Carlo simulations' },
    latex: { props: LatexSchema, description: 'KaTeX equation display, used as universal fallback for every visualization',
      example: { expression: 'f(x) = \\sin(x)', displayMode: 'block', fontSize: 'lg' },
    },
  },
  actions: {
    updateParam: { params: z.object({ elementId: z.string(), key: z.string(), value: z.union([z.number(), z.string(), z.boolean()]) }), description: 'Update a parameter on an element' },
    exportImage: { params: z.object({ format: z.enum(['png', 'svg']) }), description: 'Export the current visualization as an image' },
    share: { params: z.object({}), description: 'Generate a shareable link for the current visualization' },
    nextStep: { params: z.object({}), description: 'Advance to the next step in a stepSequence' },
    prevStep: { params: z.object({}), description: 'Go back to the previous step in a stepSequence' },
    resetAnimation: { params: z.object({}), description: 'Reset all animations to their initial state' },
  },
});
```

### 3.10 Registry

```typescript
// lib/registry.ts
import { defineRegistry } from '@json-render/react';
import { catalog } from './catalog';

export const { registry } = defineRegistry(catalog, {
  components: {
    plot2d: ({ props }) => <MafsPlot2D {...props} />,
    plot3d: ({ props }) => <ThreeDSurface {...props} />,
    matrix: ({ props }) => <MatrixViz {...props} />,
    probability: ({ props }) => <ProbabilityViz {...props} />,
    latex: ({ props }) => <LatexDisplay {...props} />,
    vizContainer: ({ props, children }) => <VizContainer {...props}>{children}</VizContainer>,
    stepSequence: ({ props, children }) => <StepSequence {...props}>{children}</StepSequence>,
  },
});
```

---

## 4. System Prompt

### Deep Mode (Opus 4.6) -- Primary

This is the full system prompt. Copy-paste directly into `CHALK_SYSTEM_PROMPT` constant.

```
You are Chalk, an expert mathematical visualization designer. You transform mathematical concepts into interactive, beautiful, step-by-step visual explanations -- like a 3Blue1Brown video, but instant and interactive.

<role>
You are a world-class mathematics educator who thinks visually. You have deep knowledge of:
- Pure mathematics (algebra, calculus, analysis, linear algebra, topology, number theory)
- Applied mathematics (statistics, probability, differential equations, optimization)
- Mathematical pedagogy (how humans learn math, common misconceptions, aha-moment design)
- Visualization design (what makes math visuals effective vs confusing)

Your goal is not to show off -- it is to create the single best visual explanation of the concept the user asked about. Every choice you make should serve understanding.
</role>

<pedagogical_principles>
Follow these principles from 3Blue1Brown's teaching methodology:

1. EXAMPLE FIRST: Never start with abstract definitions. Start with a concrete, visual example that makes the concept tangible. Show before you tell.

2. BUILD INTUITION: Each step should build on the previous one. The viewer should feel like they're discovering the concept, not being lectured at.

3. VISUAL ANCHORS: Every abstract idea needs a visual anchor. "What does this look like?" is the most important question.

4. PROGRESSIVE COMPLEXITY: Start simple, add complexity one layer at a time. Step 1 should be understandable by a high schooler. The final step can be college-level.

5. SURPRISE AND DELIGHT: Include at least one moment where the visualization reveals something unexpected -- a connection the user didn't see coming.

6. EXPLAIN THE WHY: Don't just show what happens. Show WHY it happens. Animate the cause, not just the effect.
</pedagogical_principles>

<component_catalog>
You have access to these visualization components. Choose the best one(s) for the concept:

## plot2d
2D function plots and parametric curves. Powered by Mafs.
USE WHEN: Plotting functions, showing function behavior, demonstrating limits, derivatives, integrals, trigonometric functions, parametric curves, vector fields in 2D.
CAPABILITIES:
- Plot one or more functions of x: y = f(x)
- Parametric curves: (x(t), y(t)) over a domain
- Points, vectors, line segments
- Movable points for interactivity (user can drag to explore)
- Shaded regions (for integrals, areas via inequalities)
- Vector fields
- Coordinate grid with customizable viewport (Cartesian default, Polar available)
- Pi-labeled axes via `labelPi` helper (for trig functions)
EXPRESSION FORMAT: Use mathjs syntax for expressions.
- Multiplication: use * explicitly (2*x, not 2x)
- Exponents: use ^ (x^2, not x**2)
- Functions: sin(x), cos(x), tan(x), sqrt(x), abs(x), log(x) (natural log), exp(x), pi, e
- Fractions: use / (1/3, not \frac{1}{3})

## plot3d
3D surfaces and space curves. Powered by React Three Fiber.
USE WHEN: 3D surfaces, functions of two variables z=f(x,y), gradient descent on loss surfaces, 3D parametric curves, visualizing topology, showing 3D transformations.
CAPABILITIES:
- Surface plots: z = f(x, y) over a rectangular domain
- Space curves: (x(t), y(t), z(t))
- Camera orbit controls (user can rotate, zoom, pan)
- Color mapping based on height (viridis, plasma, coolwarm, rainbow, grayscale)
- Animated points following parametric paths (e.g., gradient descent ball)
- Wireframe or solid rendering
EXPRESSION FORMAT: Same mathjs syntax. Use x,y as surface parameters, t for curves.

## matrix
Linear algebra and transformation visualizations. Powered by SVG + motion (v12+).
USE WHEN: Matrix transformations, eigenvectors/eigenvalues, basis changes, linear maps, systems of equations, vector spaces, determinants.
CAPABILITIES:
- Animated 2D grid transformations showing how matrices map space
- Before/after visualization with original grid ghost overlay
- Eigenvector/eigenvalue display
- Matrix multiplication as composition of transformations (sequence mode)
- Determinant as area scaling factor visualization
- Matrix notation display
EXPRESSION FORMAT: Matrices as 2D arrays: [[a, b], [c, d]]. Vectors as arrays: [x, y].

## probability
Probability distributions and statistical simulations. Powered by D3 + SVG.
USE WHEN: Probability distributions, sampling, Central Limit Theorem, Bayesian updating, Monte Carlo simulations, statistical tests, combinatorics visualization.
CAPABILITIES:
- Distribution curves (normal, binomial, Poisson, exponential, uniform, beta, chi-squared, custom)
- Interactive histograms with adjustable parameters
- Animated Monte Carlo simulation (drop balls, show running stats)
- Area under curve highlighting for probability regions
- Side-by-side distribution comparison
- Cumulative distribution functions
- Mean, std dev, median, percentile markers
EXPRESSION FORMAT: Distribution parameters as typed objects per distribution type.

## latex
Mathematical notation rendering. Powered by KaTeX.
ALWAYS PRESENT as part of explanations. Also serves as the ultimate fallback.
USE WHEN: Showing formulas, definitions, theorems, proofs, any symbolic mathematics.
CAPABILITIES:
- Full LaTeX math rendering
- Block and inline display modes
- Configurable font size, color, alignment
- Optional equation labels and numbering
EXPRESSION FORMAT: Standard LaTeX syntax: \frac{d}{dx} f(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}
</component_catalog>

<reasoning_process>
Before generating the visualization, think through these steps:

STEP 1 - UNDERSTAND THE CONCEPT
- What is the core mathematical idea?
- What prerequisite knowledge does the user need?
- What are common misconceptions about this concept?
- What is the most intuitive way to explain it visually?

STEP 2 - CHOOSE VISUALIZATION STRATEGY
- Which component(s) from the catalog best convey this concept?
- Should this be a single visualization or a multi-step sequence?
- What interactive elements would deepen understanding?
- What is the "aha moment" I'm building toward?

STEP 3 - DESIGN THE PEDAGOGICAL SEQUENCE
- Plan 2-5 steps that build from simple to complex
- Each step should have: a visual element, a LaTeX equation, and a connection to the next step
- The first step should be immediately graspable
- The last step should reveal the full concept with an element of surprise or elegance

STEP 4 - GENERATE THE VISUALIZATION SPEC
- Output a valid Spec for json-render
- Ensure all expressions are valid mathjs syntax (for plot2d/plot3d) or LaTeX (for latex component)
- Ensure interactive elements have sensible defaults and ranges
- Test mentally: would this render correctly? Are the domain/range sensible?

STEP 5 - QUALITY CHECK
- Does every step serve understanding?
- Is there unnecessary complexity that should be removed?
- Are the colors, labels, and annotations clear?
- Would a first-year college student understand step 1?
- Would a mathematician appreciate the final step?
</reasoning_process>

<output_format>
You MUST output a valid JSON object conforming to the Spec schema. The structure uses a flat element map with key references:

{
  "root": "container_1",
  "elements": {
    "container_1": {
      "type": "vizContainer",
      "props": {
        "title": "Human-readable title for this visualization",
        "description": "One-sentence description of what this teaches",
        "layout": "single",
        "showEquation": true,
        "showControls": true
      },
      "children": ["steps_1"]
    },
    "steps_1": {
      "type": "stepSequence",
      "props": {
        "labels": ["Step 1 title", "Step 2 title", "Step 3 title"],
        "autoPlay": true,
        "stepDuration": 2500,
        "showStepIndicator": true
      },
      "children": ["step1_viz", "step1_eq", "step2_viz", "step2_eq", "step3_viz", "step3_eq"]
    },
    "step1_viz": {
      "type": "plot2d",
      "props": { ... }
    },
    "step1_eq": {
      "type": "latex",
      "props": {
        "expression": "\\LaTeX expression here",
        "displayMode": "block"
      }
    }
  }
}

CRITICAL RULES:
- The root element MUST be a "vizContainer" component
- Use "stepSequence" to organize multi-step pedagogical sequences
- Each step SHOULD contain at least one visualization component AND one latex component
- All element keys must be unique strings (use descriptive kebab-case or snake_case)
- Children arrays contain key strings, NOT nested objects
- All props must match the component's Zod schema exactly
- FIELD NAME DIFFERENCES: plot2d uses "expr" (short) for function expressions. plot3d uses "expression" (full) for surface expressions. latex uses "expression" (full). Do NOT mix them up.
- Use "xDomain"/"yDomain" (not "viewport.x"/"viewport.y") for plot2d ranges
- Use "displayMode": "block" or "inline" (not "display": true) for latex
- Use "initial" (not "initialPosition") for movablePoints
- Use "constrainTo": "x-axis" | "y-axis" | "function" | "none" (the renderer maps these to Mafs's "horizontal"/"vertical" internally)
</output_format>

<expression_rules>
CRITICAL: Follow these rules for ALL mathematical expressions.

FOR plot2d AND plot3d (mathjs syntax):
- Use * for multiplication: "2*x" not "2x"
- Use ^ for exponents: "x^2" not "x**2"
- Use sqrt() not \sqrt: "sqrt(x^2 + y^2)"
- Use pi not \pi: "sin(2*pi*x)"
- Use e for Euler's number: "e^x" or "exp(x)"
- Natural log is log(): "log(x)" (NOT ln)
- Use abs() for absolute value: "abs(x)"
- Trig functions: sin, cos, tan, asin, acos, atan, sinh, cosh, tanh
- Use parentheses generously: "sin(x) * cos(x)" not "sinx*cosx"

FOR latex (LaTeX syntax):
- Standard LaTeX: \frac{}{}, \sqrt{}, \int_{a}^{b}, \sum_{i=0}^{n}
- Greek letters: \alpha, \beta, \gamma, \theta, \lambda, \mu, \sigma, \pi
- Use \cdot for multiplication in display: "2 \cdot x"
- Escaping: Backslash before special chars in LaTeX strings

FOR matrix component:
- Matrices as nested arrays: [[1, 0], [0, 1]]
- Vectors as arrays: [3, 4]
- All numbers, no expressions (pre-compute values)
</expression_rules>

<quality_criteria>
Before outputting, verify your visualization against these criteria:

1. CLARITY: Can someone understand step 1 without any prior context?
2. PROGRESSION: Does each step build naturally on the previous one?
3. ACCURACY: Are all mathematical expressions correct?
4. AESTHETICS: Are colors harmonious? Is the layout clean? No visual clutter.
5. INTERACTIVITY: Does at least one element invite user exploration?
6. COMPLETENESS: Does the final step deliver the full concept?
7. DELIGHT: Is there a moment of "oh, that's beautiful" or "oh, NOW I get it"?
8. BREVITY: 3-5 steps maximum. Each explanation 1-3 sentences. Don't over-explain.
</quality_criteria>

<fallback_chain>
If you cannot create a full interactive visualization for a concept:

1. TRY: Interactive visualization (plot2d, plot3d, matrix, probability)
2. FALLBACK: Static visualization with annotations
3. FALLBACK: LaTeX-heavy explanation with diagrams described in text
4. LAST RESORT: Pure LaTeX mathematical explanation

Always attempt the highest tier possible. Even partial interactivity (a single movable point) is better than a static image.

If the user's query is too vague (e.g., "math"), ask for clarification.
If the user's query is not about math at all, politely redirect.
</fallback_chain>

<color_palette>
Use this consistent color palette for visual harmony:

Primary functions/objects: #3B82F6 (blue)
Secondary functions/objects: #EF4444 (red)
Tertiary: #10B981 (green)
Quaternary: #F59E0B (amber)
Quinary: #8B5CF6 (purple)

Backgrounds/regions: Use the above colors at 0.15 opacity
Eigenvectors: #EF4444 (red) and #3B82F6 (blue)
Positive regions: #10B981 at 0.2 opacity
Negative regions: #EF4444 at 0.2 opacity
</color_palette>
```

### Fast Mode (Haiku 4.5)

For simple queries where speed matters. 1-3 second response.

```
You are Chalk, a math visualization tool. Generate a visualization spec for the user's math query.

<rules>
- Output a valid JSON Spec (flat element map with root + elements)
- Use 1-2 visualization elements maximum
- Prefer plot2d for most queries
- Use mathjs syntax for expressions (* for multiply, ^ for power, sqrt(), sin(), cos(), log())
- Use "expr" for plot2d function expressions (NOT "expression")
- Use "expression" for plot3d surface expressions (NOT "expr")
- Use "expression" for latex (NOT "expr")
- Use "xDomain"/"yDomain" for axis ranges (not viewport)
- Use "displayMode": "block" for latex (not "display": true)
- Always include at least one latex component showing the key formula
</rules>

<components>
Available: plot2d, plot3d, matrix, probability, latex
Container: vizContainer (root), stepSequence (for multi-step)
Use the simplest component that conveys the concept.
</components>

<output_format>
{
  "root": "container_1",
  "elements": {
    "container_1": {
      "type": "vizContainer",
      "props": { "title": "...", "description": "..." },
      "children": ["viz_1", "eq_1"]
    },
    "viz_1": { "type": "plot2d", "props": { "functions": [{ "expr": "...", "color": "#3B82F6" }], "xDomain": [-6.28, 6.28], "yDomain": [-1.5, 1.5] } },
    "eq_1": { "type": "latex", "props": { "expression": "...", "displayMode": "block" } }
  }
}
</output_format>

Generate the visualization now.
```

### Creative Mode (Viral-Worthy)

Prepend to the Deep Mode prompt for showcase/demo queries:

```
You are Chalk, a mathematical artist. Your visualizations are not just correct -- they are stunning.

<enhanced_principles>
1. VISUAL DRAMA: Use the full viewport. Let animations sweep across the screen.
2. COLOR STORYTELLING: Colors evolve across steps -- cool blues for setup, warm oranges for revelation.
3. CINEMATIC PACING: Step 1 is the establishing shot. Middle steps build tension. Final step is the payoff.
4. INTERACTIVE MAGIC: The interactive element should reveal something non-obvious when dragged.
5. MATHEMATICAL BEAUTY: Choose concepts that showcase inherent beauty -- spirals, symmetry, harmonics.
</enhanced_principles>

<showcase_concepts>
These produce especially beautiful visualizations:
- Fourier series building up a square wave
- Gradient descent on a multi-modal loss surface
- Eigenvalue decomposition as stretching/rotating space
- Central Limit Theorem (chaos becoming order)
- Euler's identity on the complex plane
- Lorenz attractor (chaos theory butterfly)
- Wave interference patterns
</showcase_concepts>
```

---

## 5. API Design

### `POST /api/generate`

```typescript
// app/api/generate/route.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildUserPrompt } from '@json-render/core';
import { catalog } from '@/lib/catalog';
import { classifyQuery } from '@/lib/router';
import { CHALK_DEEP_SYSTEM_PROMPT, FAST_SYSTEM_PROMPT, CREATIVE_SYSTEM_PROMPT } from '@/lib/prompts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // useUIStream.send(prompt, context?) POSTs { prompt, context, currentSpec } to this endpoint.
  // context is the optional 2nd arg from send(). currentSpec is auto-included by the hook.
  const { prompt, context } = await req.json();
  const mode = classifyQuery(prompt);

  const isDeep = mode !== 'fast';
  const isCreative = mode === 'creative';

  const model = isDeep
    ? anthropic('claude-opus-4-6')
    : anthropic('claude-haiku-4-5');

  // catalog.prompt() generates: JSONL format instructions, component catalog with Zod-derived props,
  // actions, state model, visibility rules, and base rules. It ALREADY includes flat element map
  // instructions and RFC 6902 patch format. Our CHALK_DEEP_SYSTEM_PROMPT adds: pedagogical principles,
  // expression syntax rules, color palette, quality criteria, and domain-specific guidance.
  // Order: catalog.prompt() first (framework instructions) -> our custom prompt (domain instructions).
  // CHALK_DEEP_SYSTEM_PROMPT's <output_format> section reinforces/overrides catalog.prompt()'s format.
  const systemPrompt = isDeep
    ? catalog.prompt() + (isCreative ? CREATIVE_SYSTEM_PROMPT : '') + CHALK_DEEP_SYSTEM_PROMPT
    : FAST_SYSTEM_PROMPT;

  // AI SDK v6: Use providerOptions for thinking/effort.
  // NOTE: generateObject/streamObject are DEPRECATED in v6.
  // For structured output, use streamText with output: Output.object({ schema }).
  // For Chalk, we stream raw text (JSONL patches) and parse client-side via useUIStream.
  // Response MUST be plain text stream (toTextStreamResponse), NOT SSE.
  // BREAKING CHANGE: Opus 4.6 does NOT support assistant message prefill.
  // Requests with prefilled assistant turns return 400. Use system prompt + structured outputs only.
  const result = streamText({
    model,
    system: systemPrompt,
    prompt: buildUserPrompt({ prompt, state: context?.data ?? {} }),
    maxTokens: isDeep ? 32000 : 8000, // AI SDK v6 uses maxTokens (maps to max_tokens). CRITICAL: thinking tokens are a SUBSET of maxTokens -- with adaptive thinking, Opus may use 10-15K tokens thinking, leaving only the remainder for the response. 32K ensures enough headroom for thinking + viz spec (typically 2-8K). Haiku max output is 64K.
    providerOptions: isDeep ? {
      anthropic: {
        thinking: { type: 'adaptive' },
        // NOTE: effort via AI SDK providerOptions supports 'low' | 'medium' | 'high'.
        // 'max' is only available via the direct Anthropic API (output_config.effort).
        // For Chalk, we rely on adaptive thinking instead of effort param via AI SDK.
      },
    } : undefined,
  });

  return result.toTextStreamResponse();
}
```

**Request**: `POST /api/generate`

```json
{ "prompt": "Explain eigenvalues visually", "context": null, "currentSpec": null }
```

Note: `useUIStream.send(prompt, context?)` constructs this body automatically. `context` comes from the optional 2nd arg to `send()`. `currentSpec` is the hook's current spec state (auto-included).

**Response**: Plain text stream via `toTextStreamResponse()` (NOT SSE) -- JSONL lines (RFC 6902 patches). `useUIStream` reads via `response.body.getReader()`, not EventSource:

```
{"op":"replace","path":"/root","value":"container_1"}
{"op":"add","path":"/elements/container_1","value":{"type":"vizContainer","props":{"title":"Eigenvalues & Eigenvectors"},"children":["steps_1"]}}
{"op":"add","path":"/elements/steps_1","value":{"type":"stepSequence","props":{"labels":["A Matrix Transforms Space","Special Vectors Only Stretch"]},"children":["step1_matrix","step1_eq"]}}
...
```

### `POST /api/share`

```typescript
// app/api/share/route.ts
import { saveVisualization } from '@/lib/supabase';

export async function POST(req: Request) {
  const { spec, prompt } = await req.json();
  const id = await saveVisualization(spec, prompt);
  return Response.json({ id, url: `${process.env.NEXT_PUBLIC_BASE_URL}/v/${id}` });
}
```

**Request**: `POST /api/share`

```json
{ "spec": { "root": "...", "elements": { ... } }, "prompt": "original user prompt" }
```

**Response**:

```json
{ "id": "a1b2c3d4", "url": "https://chalk.vercel.app/v/a1b2c3d4" }
```

### `GET /v/[id]` (SSR Page)

```typescript
// app/v/[id]/page.tsx
import { loadVisualization } from '@/lib/supabase';

// Next.js 15: params is a Promise (breaking change from 14)
export default async function SharedViz({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { spec, prompt } = await loadVisualization(id);
  return <ChalkCanvas initialSpec={spec} prompt={prompt} />;
}
```

### Streaming Protocol Detail

Each JSONL line is a JSON Patch operation (RFC 6902). Valid ops: `add`, `remove`, `replace`, `move`, `copy`, `test`.

```
Line 1: {"op":"replace","path":"/root","value":"container_1"}
Line 2: {"op":"add","path":"/elements/container_1","value":{...}}
Line 3: {"op":"add","path":"/elements/plot_1","value":{...}}
```

`useUIStream` applies each patch incrementally. React re-renders after each line. Components appear progressively.

### Client Integration

```typescript
// components/ChalkCanvas.tsx
'use client';
import { useUIStream, Renderer, StateProvider, ActionProvider } from '@json-render/react';
import { registry } from '@/lib/registry';

export function ChalkCanvas({ prompt }: { prompt?: string }) {
  // useUIStream returns { spec, isStreaming, error, usage, send, clear }
  // NOTE: `usage` is TokenUsage | null (contains prompt, completion, total token counts)
  const { spec, isStreaming, error, usage, send, clear } = useUIStream({
    api: '/api/generate',
    onComplete: (completedSpec) => {
      console.log('Generation complete', completedSpec);
    },
    onError: (err) => {
      console.error('Stream error:', err);
    },
  });

  // IMPORTANT: useUIStream does NOT auto-send. You must call send() to initiate streaming.
  // send(prompt, context?) -- POSTs { prompt, context, currentSpec } to the API endpoint.
  // context is the optional 2nd arg; currentSpec is auto-included by the hook.
  // Returns Promise<void> -- can be awaited or fire-and-forget.
  const handleSubmit = (userPrompt: string) => {
    clear(); // Reset previous spec
    send(userPrompt); // POSTs { prompt, context: undefined, currentSpec: null } to /api/generate
  };

  return (
    <StateProvider>
      <ActionProvider>
        <Renderer spec={spec} registry={registry} loading={isStreaming} />
      </ActionProvider>
    </StateProvider>
  );
}
```

---

## 6. Expression Engine

### mathjs Integration

```typescript
// lib/math.ts
import { create, all } from 'mathjs';

// Create sandboxed instance
const math = create(all);

// Disable dangerous functions
// NOTE: Do NOT disable parse() -- math.compile() uses it internally.
// evaluate() is the dangerous user-facing function (executes arbitrary strings).
math.import({
  import: function () { throw new Error('import disabled'); },
  createUnit: function () { throw new Error('createUnit disabled'); },
  evaluate: function () { throw new Error('evaluate disabled'); },
  // parse is intentionally NOT disabled -- compile() depends on it.
  // The security boundary is: only compile() is exposed, and it takes a scope object (no global access).
}, { override: true });

// Compile a math expression to a callable function
// NOTE: Use math.compile(), NOT top-level compile import (which is the unprotected version)
export function compileMathExpr(expr: string): (scope: Record<string, number>) => number {
  const compiled = math.compile(expr);
  return (scope) => compiled.evaluate(scope);
}

// For 2D plots: y = f(x)
export function exprToPlotFn(expr: string): (x: number) => number {
  const fn = compileMathExpr(expr);
  return (x: number) => fn({ x });
}

// For 3D surfaces: z = f(x, y)
export function exprToSurfaceFn(expr: string): (x: number, y: number) => number {
  const fn = compileMathExpr(expr);
  return (x: number, y: number) => fn({ x, y });
}
```

### Syntax Rules

| Operation | Correct (mathjs) | Wrong |
|---|---|---|
| Multiplication | `2*x` | `2x` |
| Exponent | `x^2` | `x**2` |
| Square root | `sqrt(x)` | `\sqrt{x}` |
| Natural log | `log(x)` | `ln(x)` |
| Euler's number | `e^x` or `exp(x)` | `Math.E` |
| Pi | `pi` | `\pi`, `Math.PI` |
| Absolute value | `abs(x)` | `|x|` |
| Trig | `sin(x)`, `cos(x)`, `tan(x)` | `sinx` |

### Security

- Never use `eval()` or `new Function()`.
- `compile()` only; explicit scope objects.
- `evaluate()` is disabled at the instance level.
- Timeout wrapper for deeply nested expressions.
- `math.derivative()` for simple symbolic derivatives; numerical fallback for complex ones.

---

## 7. Database Schema

### Supabase Table

```sql
-- NOTE: nanoid() is NOT a built-in Supabase/Postgres function.
-- Generate the ID server-side using the nanoid npm package.
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

### Client

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function saveVisualization(spec: any, prompt: string): Promise<string> {
  const id = nanoid(10); // Generate short URL-safe ID server-side
  const { error } = await supabase
    .from('visualizations')
    .insert({ id, spec, prompt });
  if (error) throw error;
  return id;
}

export async function loadVisualization(id: string): Promise<{ spec: any; prompt: string }> {
  const { data, error } = await supabase
    .from('visualizations')
    .select('spec, prompt')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
```

### Sharing Model

- `nanoid(10)` generates short URL-friendly IDs (e.g., `chalk.vercel.app/v/a1b2c3d4`). 64^10 = ~1.15 quintillion possible IDs. Collision probability at 1M entries: ~0.000043%.
- Public read, API insert. No auth required to view.
- Uses `createClient` from `@supabase/supabase-js` directly. **Do NOT install `@supabase/ssr`** -- Chalk has no auth, no session cookies needed.
- Anon key + RLS is the correct approach. Service role key is unnecessary (and dangerous -- bypasses RLS entirely).
- Free tier limits: 500MB database, 1GB file storage, 2GB bandwidth, unlimited API requests, 500K edge fn invocations, 50K MAU, 2 active projects max.
- **7-day inactivity pause risk**: Free tier projects pause after 7 days of inactivity. During hackathon week + judging, this is not a concern. Optional keepalive: `GET /api/keepalive` that does a simple DB query.
- JSONB column stores the entire json-render Spec as-is. No ORM.

---

## 8. Deployment

### Vercel Config

Vercel Fluid Compute (enabled by default for projects created after Apr 23, 2025) gives Hobby plan 300s max function duration. Legacy mode caps at 60s. New Chalk project will have Fluid Compute by default.

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
// NOTE: Vercel Fluid Compute (enabled by default since Apr 2025) gives Hobby plan up to 300s.
// Legacy mode (no Fluid Compute) caps Hobby at 60s. 300s is safe for new projects.
// AI streaming routes are I/O-bound (waiting on Claude API), so active CPU billing is minimal.
// Duration timer measures wall-clock time for the entire invocation (start to last byte).
```

### Environment Variables

Set in Vercel dashboard (not committed):

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_BASE_URL=https://chalk.vercel.app
```

### Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        chalk: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#f1f5f9',
          accent: '#3b82f6',
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

### Critical Build Notes

- `export const dynamic = 'force-dynamic'` on all AI API routes (disable aggressive caching).
- `dynamic(() => import('./Plot3D'), { ssr: false })` for all Three.js components.
- `<Canvas gl={{ preserveDrawingBuffer: true }}>` on R3F for export to PNG (goes in `gl` prop, not top-level). For R3F scenes, use `gl.domElement.toDataURL('image/png')` directly -- DOM-to-image libraries can't capture WebGL.
- KaTeX CSS imported globally in `layout.tsx`: `import 'katex/dist/katex.min.css'`.
- D3 v7 is ESM-only; works out of the box with App Router. **Components using D3 must have `"use client"` directive.** If D3 code touches browser APIs directly, wrap with `dynamic(() => import('./Component'), { ssr: false })`.
- Turbopack may have issues with some ESM packages; fall back to Webpack if needed (`next dev` without `--turbo`).
- json-render v0.5.2 was released Feb 9, 2026 (literally yesterday). Three releases in one day (0.5.0, 0.5.1, 0.5.2). Pin exact version and test thoroughly. If bugs found, check release notes or use patterns manually.
- `react-error-boundary@^5.0.0` is a dependency (used by SafeVizWrapper.tsx). Works with React 19.
- `modern-screenshot` replaces `html2canvas` (unmaintained, poor SVG, no WebGL). **Always use dynamic import**: `const { domToPng } = await import('modern-screenshot')`. Never top-level import (causes "window is not defined" in SSR). Uses SVG foreignObject approach for high-fidelity DOM capture.
- For ExportButton.tsx: SVG/DOM layers use `domToPng(element, { scale: 2 })`. R3F WebGL layers use `gl.domElement.toDataURL('image/png')`. Mixed scenes: capture layers separately, composite on a `<canvas>` via `drawImage()`.

---

## 9. AI Model Configuration

### Dual-Model Strategy

| | Opus 4.6 (Deep) | Haiku 4.5 (Fast) |
|---|---|---|
| Model ID | `claude-opus-4-6` | `claude-haiku-4-5` |
| AI SDK provider call | `anthropic('claude-opus-4-6')` | `anthropic('claude-haiku-4-5')` |
| Pricing | $5/$25 per MTok (standard) | ~10x cheaper |
| Latency | 5-10s | 1-3s |
| Thinking | `thinking: { type: "adaptive" }` | None (do NOT pass thinking param) |
| Effort (direct API) | `output_config: { effort: "max" }` | Not used (fast mode; effort adds latency) |
| Effort (AI SDK) | `providerOptions.anthropic.effort: "high"` (AI SDK only supports low/medium/high, NOT max) | Not used (fast mode prioritizes speed) |
| Max output | 128K tokens | 64K tokens |
| Use case | Multi-step pedagogy, 3D, complex | Single plot, simple queries |

### Query Router

```typescript
// lib/router.ts
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
```

### Anthropic API Config (Direct, for Structured Outputs)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { ChalkSpecSchema } from '@/lib/schemas';

const client = new Anthropic();

// Option A: Manual JSON Schema (more control)
const response = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },    // Opus 4.6 exclusive. Replaces deprecated budget_tokens.
  output_config: {
    effort: 'max',                     // Opus 4.6 exclusive. Other models only support up to 'high'.
    format: {                          // GA -- no beta header needed.
      type: 'json_schema',
      schema: z.toJSONSchema(ChalkSpecSchema), // Zod v4 native JSON Schema generation
    },
  },
  system: systemPrompt,
  messages: [{ role: 'user', content: query }],
});

// Option B: zodOutputFormat helper (auto-converts Zod -> JSON Schema)
const response2 = await client.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },
  output_config: {
    effort: 'max',
    format: zodOutputFormat(ChalkSpecSchema), // From @anthropic-ai/sdk/helpers/zod
  },
  system: systemPrompt,
  messages: [{ role: 'user', content: query }],
});

// Option C: client.messages.parse() -- auto-validates response with Zod
// CONFIRMED: messages.parse() supports thinking alongside zodOutputFormat.
// The parser skips thinking blocks and only processes text blocks for JSON extraction.
const parsed = await client.messages.parse({
  model: 'claude-opus-4-6',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },  // YES, works with parse() -- thinking blocks pass through unchanged
  output_config: {
    format: zodOutputFormat(ChalkSpecSchema),
    effort: 'max',  // effort can go alongside format inside output_config
  },
  system: systemPrompt,
  messages: [{ role: 'user', content: query }],
});
// parsed.parsed_output is already typed and validated (NOT parsed.output)
// Access thinking: parsed.content.filter(b => b.type === 'thinking')

// IMPORTANT: effort lives INSIDE output_config, NOT at the top level.
// IMPORTANT: format lives INSIDE output_config, NOT as the old output_format param.
// Both thinking and output_config are top-level. effort and format are nested under output_config.
// IMPORTANT: zodOutputFormat IS REAL -- from @anthropic-ai/sdk/helpers/zod. SDK v0.74.0+.
// IMPORTANT: zodOutputFormat takes ONE arg: zodOutputFormat(schema). NO name parameter.
// IMPORTANT: messages.parse() returns parsed.parsed_output (NOT parsed.output).
// IMPORTANT: messages.parse() WORKS with thinking: { type: 'adaptive' }. Parser skips thinking blocks.
// IMPORTANT: AI SDK structuredOutputMode: "outputFormat" uses native grammar-constrained decoding (compatible with thinking).
//   "jsonTool" forces toolChoice: required which BREAKS thinking. "auto" resolves to "outputFormat" on opus-4-6/sonnet-4-5/haiku-4-5.
//   For streaming structured output + thinking via AI SDK: use streamText + Output.object + structuredOutputMode: "outputFormat".
// Anthropic SDK peer dep for Zod: ^3.25.0 || ^4.0.0 (both supported).
```

### Three Layers of JSON Compliance

1. **Structured Outputs** (inference-time): Grammar-constrained decoding. Tokens cannot violate schema.
2. **System prompt** (reasoning-time): Detailed props, examples, expression rules.
3. **Zod validation** (runtime): `ChalkSpecSchema.safeParse(parsed)` before passing to `<Renderer>`.

### Structured Output Limitations

When using `output_config.format.type: "json_schema"`, be aware of these JSON Schema constraints:

| Constraint | Impact on Chalk |
|---|---|
| **No recursive schemas** | Cannot have infinitely-nested element trees. Chalk's flat element map with key references is the correct workaround. |
| **`additionalProperties` must be `false`** | Every object must explicitly list all possible properties. Use Zod v4 native `z.toJSONSchema(schema)` which handles this automatically. `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod` also auto-handles via `transformJSONSchema()`. |
| **No `minLength` / `maxLength` on strings** | Zod `.min()` / `.max()` on strings are stripped at schema level. Still enforced by runtime Zod validation (Layer 3). |
| **No `minimum` / `maximum` on numbers** | Zod `.min()` / `.max()` on numbers are stripped. Still enforced at runtime. |
| **No `patternProperties`** | `z.record()` with regex keys doesn't translate. Use explicit key schemas. |
| **Max nesting depth: 5 levels** | Chalk's flat map keeps nesting at 3 levels (root → elements → props). Well within limit. |
| **First grammar compile: 100-300ms** | One-time overhead, cached 24h. Not an issue after first request. |

**Practical implication**: Chalk's Zod schemas use `.min()`, `.max()`, `.regex()` etc. for runtime validation (Layer 3), but these constraints are silently dropped from the JSON Schema sent to the model (Layer 1). The model may occasionally output strings that are too long or numbers out of range — catch these with `safeParse()` and re-prompt or clamp values.

### AI SDK v6 Pattern Reference

```typescript
// Pattern 1: Streaming text (what Chalk uses -- json-render parses the stream)
import { streamText } from 'ai';
const result = streamText({ model, system, prompt });
return result.toTextStreamResponse();

// Pattern 2: Structured object output (alternative if json-render streaming breaks)
// Uses native grammar-constrained decoding via structuredOutputMode: 'outputFormat'
import { streamText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { ChalkSpecSchema } from '@/lib/schemas';
const result = streamText({
  model: anthropic('claude-opus-4-6'),
  system,
  prompt,
  output: Output.object({ schema: ChalkSpecSchema }),
  providerOptions: {
    anthropic: {
      structuredOutputMode: 'outputFormat', // Native constrained decoding (NOT jsonTool which breaks thinking)
      thinking: { type: 'adaptive' },       // Works with outputFormat mode
    },
  },
});
// result.partialOutputStream -- streaming partial typed objects (DeepPartial<ChalkSpec>)
// result.output -- Promise<ChalkSpec> (final validated output)
// result.reasoningText -- thinking output

// Pattern 3: Direct Anthropic SDK (for structured outputs with thinking + effort: 'max')
// See Section 9 "Anthropic API Config" above.

// structuredOutputMode options:
// - "outputFormat": Native grammar-constrained decoding via output_format. COMPATIBLE with thinking.
// - "jsonTool": Forces tool_choice: required → INCOMPATIBLE with thinking (API error).
// - "auto" (default): Resolves to "outputFormat" on opus-4-6/sonnet-4-5/haiku-4-5.

// DEPRECATED (do NOT use):
// - generateObject() -- removed in AI SDK v6
// - streamObject() -- removed in AI SDK v6
// - output_format -- replaced by output_config.format in Anthropic API (AI SDK still uses output_format internally but maps correctly)

// AI SDK providerOptions.anthropic.effort: 'low' | 'medium' | 'high' (NOT 'max')
// For 'max' effort, use direct Anthropic SDK (output_config.effort: 'max')
```

### json-render Fallback Plan

If `useUIStream` has bugs (v0.5.2 is 1 day old), bypass it and parse JSON manually:

```typescript
// components/ChalkCanvas.tsx -- FALLBACK VERSION
'use client';
import { useState, useCallback } from 'react';
import { Renderer, StateProvider, ActionProvider } from '@json-render/react';
import { registry } from '@/lib/registry';
import { ChalkSpecSchema } from '@/lib/schemas';

export function ChalkCanvas() {
  const [spec, setSpec] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generate = useCallback(async (prompt: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      // Response is JSONL patches (RFC 6902). Use createSpecStreamCompiler to reconstruct spec.
      // NOTE: The AI streams JSONL lines like {"op":"add","path":"/root","value":"container_1"}
      const { createSpecStreamCompiler } = await import('@json-render/core');
      const compiler = createSpecStreamCompiler();
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer
        for (const line of lines) {
          if (line.trim()) {
            const { result } = compiler.push(line);
            if (result) setSpec({ ...result }); // Trigger re-render on each patch
          }
        }
      }
      // Process remaining buffer
      if (buffer.trim()) {
        const { result } = compiler.push(buffer);
        if (result) setSpec({ ...result });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (!spec) return null;

  return (
    <StateProvider>
      <ActionProvider>
        <Renderer spec={spec} registry={registry} loading={isLoading} />
      </ActionProvider>
    </StateProvider>
  );
}
```

This uses the low-level `createSpecStreamCompiler()` from `@json-render/core` to manually parse JSONL patches, bypassing `useUIStream` while keeping progressive rendering. `compiler.push(line)` returns `{ result, newPatches }` — `result` is the updated spec, `newPatches` is the array of changes applied. Use as emergency fallback if `useUIStream` has bugs. Also available: `compiler.getResult()` for final spec.

---

## 10. Research Reference

### Opus 4.6 Key Facts

- Released February 5, 2026. Model ID: `claude-opus-4-6`.
- $5/$25 per MTok (standard <=200K context). Premium for >200K: $10/$37.50 per MTok.
- **200K context window standard. 1M context is BETA** -- requires header `context-1m-2025-08-07` + usage tier 4. Do NOT assume 1M is available by default.
- 128K max output (Opus 4.6 exclusive; Haiku 4.5 caps at 64K, Opus 4.1 at 32K).
- Adaptive Thinking: `thinking: { type: "adaptive" }` replaces deprecated `budget_tokens`. Opus 4.6 exclusive. **CRITICAL: thinking tokens are a SUBSET of `max_tokens`**. `max_tokens >= thinking_tokens + response_text_tokens`. At high/max effort, Opus may use 10-15K+ tokens for thinking. Set `max_tokens` generously (32K+) to avoid truncated responses.
- **BREAKING: Prefill NOT supported.** Prepending assistant message turns (last-assistant-turn prefills) returns a **400 error** on Opus 4.6. Use system prompts, structured outputs, or `output_config.format` instead. This is NOT the case on older models.
- New features: Compaction API (beta, infinite conversations), Fast mode (`speed: "fast"`, 2.5x faster, premium pricing, beta header `fast-mode-2026-02-01`), Fine-grained tool streaming (GA, no beta header), Data residency controls (`inference_geo: "us"` at 1.1x pricing).
- `output_format` param is officially **deprecated** in favor of `output_config.format`. Both still work during transition.
- **Tool parameter quoting**: Opus 4.6 has slightly different JSON string escaping in tool use parameters compared to previous models. May affect mathjs expressions containing backslashes. Test tool use with math expressions early.
- Effort: `output_config: { effort: "max" }` is Opus 4.6 exclusive. GA (no beta header needed). Effort levels: `max` (Opus 4.6 only, unconstrained), `high` (default, always thinks), `medium` (may skip thinking), `low` (minimizes thinking). NOTE: effort lives inside `output_config`, NOT top-level.
- Structured Outputs: `output_config: { format: { type: "json_schema" } }` -- GA, no beta header. NOTE: old `output_format` param is deprecated; use `output_config.format`.
- First grammar compile: 100-300ms overhead, cached 24h.
- Benchmarks: Terminal-Bench 65.4%, BrowseComp 84%, MRCR v2 76%, Humanity's Last Exam best-in-class.

### json-render Key Facts

- Packages: `@json-render/core`, `@json-render/react` (both v0.5.2, released Feb 9 2026).
- Peer deps: React `^19.2.3` (stricter than docs claim `^19.0.0` — verified from npm registry), Zod `^4.0.0`. ai `^6.0.33` (optional, for AI integration).
- **v0.5.1 added built-in error boundaries** to all renderers — "a single bad component silently disappears instead of causing a white-screen-of-death." Also fixed Select/Radio handling of non-string option values from AI outputs.
- **Known bugs in v0.5.2**: Issue #53 (infinite re-renders from `Renderer` — can freeze UI), #54 (multiple renderings triggered by single input), #55 (docs mismatch: old docs showed `{ tree, isLoading, generate }` with `endpoint` param — actual API is `{ spec, isStreaming, error, usage, send, clear }` with `api` param), #42 (JSONL patch format confusion — response MUST be JSONL patches, not plain JSON), #49 (bundle size scaling concerns). **If #53 reproduces, switch to fallback ChalkCanvas immediately.**
- `defineComponents` does NOT exist (Issue #63). The correct export is `defineRegistry`.
- 10.1k GitHub stars. Apache-2.0 license. Monorepo with 8 packages.
- UITree is a **flat element map** with key references. Not nested.
- `defineCatalog()` -- not `createCatalog`. Components need `description` field. v0.5.2 added optional `example` field to `ComponentDefinition` — providing example props improves LLM output quality (catalog.prompt() includes them in generated prompt examples).
- `catalog.prompt(options?)` auto-generates system prompt from schemas. Accepts optional `{ system?, customRules?, promptTemplate? }`. v0.5.2 dynamically generates examples from YOUR catalog (fixes hallucination of non-existent component types). Returns a string. **Generated prompt has 7+ sections**: (1) Output format (JSONL + RFC 6902), (2) Component definitions with formatted Zod props, (3) Action descriptions, (4) State management (`$path`, `$cond`), (5) Repeat/list iteration, (6) Visibility conditions, (7) Event bindings, (8) Rules. The prompt already instructs the AI about the flat element map and JSONL patch format. CHALK_DEEP_SYSTEM_PROMPT supplements (not replaces) this with pedagogical guidance, expression syntax, and domain-specific rules.
- `catalog.zodSchema()` returns the combined Zod schema. `catalog.jsonSchema()` returns JSON Schema. `catalog.validate(spec)` validates a spec against the catalog.
- `useUIStream()` applies RFC 6902 JSONL patches progressively. Also supports non-standard `set` op. **Note**: Issue #33 documents experimental TOON format as alternative to JSONL (89% cost reduction, 74% faster) but no native streaming support — use JSONL for Chalk.
- Additional APIs: `buildUserPrompt({ prompt, state })` (wraps user prompt + current UI state for context), `generateCatalogPrompt()` / `generateSystemPrompt()` (legacy prompt APIs -- prefer `catalog.prompt()`), `createCatalog()` (legacy -- prefer `defineCatalog()`). **Providers (ALL REAL EXPORTS)**: `StateProvider` (UI state management), `DataProvider` (app data with JSON Pointer paths — `useData()` → `getData(path)`, `setData(path, value)` for two-way data binding), `ActionProvider` (component action handlers), `VisibilityProvider` (conditional rendering), `ValidationProvider` (validation functions). Also: `JSONUIProvider` (convenience wrapper combining all providers). **For Chalk**: Use `StateProvider` + `ActionProvider` (no app data model needed, so skip `DataProvider`).
- `useUIStream({ api, onComplete?, onError? })` returns `{ spec, isStreaming, error, usage, send, clear }`. **Note**: `usage` is `TokenUsage | null` where `TokenUsage = { prompt: number, completion: number, total: number }`. This field was NOT in prior docs. IMPORTANT: You must call `send(prompt)` to initiate streaming -- it does NOT auto-send on mount. `send(prompt, context?)` POSTs `{ prompt, context, currentSpec }` to the API. Returns `Promise<void>`. The hook reads the response as a plain text stream via `response.body.getReader()` (NOT SSE/EventSource). Response format: `toTextStreamResponse()` from AI SDK.
- The React package includes 39 built-in components (Card, Stack, Grid, etc.) but Chalk uses ALL CUSTOM components via `defineRegistry()`.
- Also available: `@json-render/react-native`, `@json-render/remotion`, `@json-render/codegen` (export as standalone React code).

### Math Visualization Research

- Interactive simulations outperform static images for math learning.
- Progressive disclosure and immediate visual feedback are key.
- 3Blue1Brown pattern: Hook -> Ground -> Build -> Reveal -> Formalize.
- mathjs uses `log()` for natural log, not `ln()`.
- `vectorField.step` below 0.5 causes performance degradation in Mafs.
- Three.js `resolution` above 96 lags on mobile; cap at 96 (not 128). Schema capped accordingly.

### Competitive Differentiation

Chalk occupies a unique niche: math-specific natural language to interactive visualization.

| Competitor | What It Does | Gap Chalk Fills |
|---|---|---|
| **Desmos** | Graphing calculator + classroom tools. Dominant in K-12. Free. | No NL input, no 3D, no AI pedagogy. Success factors: free, interactive, teacher tools. |
| **GeoGebra** | Interactive geometry/algebra. Dynamic parameter manipulation. | Complex UI, no AI, steep learning curve. |
| **Manim** (3B1B) | Python animation for pre-rendered video | Not interactive, not web-native, requires Python expertise |
| **Mathos AI** | "Most advanced animation explainer in math education." 17% higher accuracy than Mathway. Creates quizzes, flashcards, video explainers. | No interactive visualization output. Animations are pre-rendered, not explorable. No shareable live URLs. |
| **MathGPT** | AI math solving with step-by-step | Text output only, no interactive viz |
| **Seeing Theory** (Brown) | Beautiful probability visualizations | Static pre-built set, no AI generation |

No existing tool combines: NL input + interactive output + instant generation + multi-domain + shareable URLs + AI-powered pedagogical sequencing.

**Market context**: K-12 STEM market is $60.14B (2025), growing 13.7% annually. Game-based learning market: $29.7B (21.9% CAGR). Research shows interactive simulations outperform static images, and "free/accessible" is the #1 factor in math tool adoption.

### Documentation Links

| Resource | URL | Notes |
|---|---|---|
| Opus 4.6 announcement | https://www.anthropic.com/news/claude-opus-4-6 | Release Feb 5, 2026 |
| Opus 4.6 what's new | https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-6 | ALL new features, deprecations, breaking changes |
| Migration guide | https://platform.claude.com/docs/en/about-claude/models/migration-guide | Step-by-step migration from 4.1 |
| Fast mode | https://platform.claude.com/docs/en/build-with-claude/fast-mode | 2.5x faster, beta header `fast-mode-2026-02-01` |
| Compaction API | https://platform.claude.com/docs/en/build-with-claude/compaction | Infinite conversations |
| Adaptive Thinking API | https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking | `thinking: { type: "adaptive" }` |
| Structured Outputs | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | `output_config.format` |
| Effort Parameter | https://platform.claude.com/docs/en/build-with-claude/effort | `output_config.effort` |
| json-render repo | https://github.com/vercel-labs/json-render | 10.1k stars, Apache-2.0 |
| json-render docs | https://json-render.dev/ | Installation, AI SDK integration |
| json-render DeepWiki | https://deepwiki.com/vercel-labs/json-render | Architecture deep-dive |
| Mafs | https://mafs.dev/ | Guides: display, interaction |
| Mafs GitHub | https://github.com/stevenpetryk/mafs | Source reference |
| React Three Fiber | https://docs.pmnd.rs/react-three-fiber | |
| D3.js | https://d3js.org/ | |
| KaTeX | https://katex.org/ | |
| mathjs | https://mathjs.org/ | |
| AI SDK | https://ai-sdk.dev/ | v6 docs |
| @ai-sdk/anthropic | https://ai-sdk.dev/providers/ai-sdk-providers/anthropic | Provider reference |
| Vercel AI SDK blog | https://vercel.com/blog/ai-sdk-6 | v6 announcement |
| 3Blue1Brown | https://www.3blue1brown.com/ | Pedagogical reference |
| Seeing Theory | https://seeing-theory.brown.edu/ | Inspiration |
| Hackathon submission | https://cerebralvalley.ai/e/claude-code-hackathon/ | Submit here (also cv.inc/e/claude-code-hackathon/) |

### Opus 4.6 Benchmarks

| Benchmark | Score |
|---|---|
| Terminal-Bench 2.0 | 65.4% |
| OSWorld | 72.7% |
| BrowseComp | 84.0% |
| GDPval-AA | 1606 Elo |
| BigLaw Bench | 90.2% |
| Finance Agent | 60.7% |
| MRCR v2 (long context) | 76% |
