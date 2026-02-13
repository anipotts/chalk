# Chalk Prompt Map

Every system prompt used in the product, where it lives, and what it does.

---

## 1. Video Chat (Normal Mode)

**File:** `lib/prompts/video-assistant.ts` -> `VIDEO_ASSISTANT_SYSTEM_PROMPT`
**API Route:** `app/api/video-chat/route.ts` (non-explore path)
**Model:** Sonnet 4.5 (default), Opus 4.6, or Haiku 4.5 via `modelChoice`
**Builder:** `buildVideoSystemPromptParts()` (3-part cached system prompt)

**What it does:** Core video Q&A. User pauses video, asks a question. AI answers using the transcript, citing [M:SS] timestamps.

**Current behavior:**
- Splits transcript into `<watched_content>` (high priority) and `<upcoming_content>` (low priority)
- 13 rules covering: timestamp citations, conciseness (2-4 sentences), no emojis, no em/en dashes
- Supports curriculum context (cross-video playlist references)
- Voice mode suffix shortens responses to 1-3 sentences, drops markdown

**Personality modifiers** (injected at route level):
- `encouraging` - warm, supportive
- `strict` - direct, no-nonsense
- `socratic` - guides with questions

**What to optimize:**
- Tone is still generic. Make it deadpan, direct, capitalized but no emojis ever.
- Rules section is verbose. Compress.
- "Like texting a mathematician" vibe needs to carry through here.
- Consider: should normal chat use the same terse explore-mode style?

---

## 2. Explore Mode (Deep Dive)

**File:** `lib/prompts/video-assistant.ts` -> `EXPLORE_MODE_SYSTEM_PROMPT`
**API Route:** `app/api/video-chat/route.ts` (exploreMode=true path)
**Model:** Opus 4.6 with adaptive thinking budget (1024-16000 tokens)
**Builder:** `buildExploreSystemPrompt()`

**What it does:** AI-guided learning. The AI leads with questions and pill options. User follows threads of inquiry.

**Current behavior:**
- "Ultra-compact" responses: 1-2 sentences max
- Every response ends with `<options>opt1|opt2|opt3|opt4</options>` pill choices
- Options are 2-6 words, contextual to video content
- First interaction: acknowledge goal, ask focusing question, provide contextual pills
- No emojis, no em/en dashes

**What to optimize:**
- This is the strongest prompt. Main issue: options sometimes feel generic.
- Could inject more personality. Current tone is clinical.
- Consider merging normal + explore into one prompt with mode flags.

---

## 3. Voice Mode Suffix

**File:** `lib/prompts/video-assistant.ts` -> `VOICE_MODE_SUFFIX`
**Used by:** Video chat route when `voiceMode=true`

**What it does:** Appended to normal video chat prompt for voice interactions. Response gets TTS'd.

**Current behavior:**
- 1-3 sentences max
- No markdown, no special characters
- Natural timestamps: "around the two minute mark" instead of [2:00]
- Warm and conversational

**What to optimize:**
- "Warm and engaging" conflicts with deadpan brand voice. Align.
- "Sound warm" instruction should be "Sound natural and direct".

---

## 4. Learn Mode

**File:** `lib/prompts/learn-mode.ts`
**API Route:** `app/api/learn-mode/route.ts`
**Model:** Opus 4.6 with thinking (1024-16000 budget)
**Builder:** `getLearnModeSystemPrompt()` + `buildTranscriptContext()`

**What it does:** Adaptive learning tutor. Generates quizzes, summaries, takeaways, or custom responses based on video content.

**Current behavior:**
- Base prompt + action-specific format (quiz JSON, markdown, or custom)
- Intent modifiers: "patient" (thorough, Socratic) or "impatient" (bullet points, timestamp-heavy)
- Quiz format: structured JSON with questions, options, correctId, explanation, relatedTimestamp
- Always references [M:SS] timestamps
- No emojis, no em/en dashes

**What to optimize:**
- Quiz explanations are often too long. Tighten.
- "Patient" modifier is wordy. Compress.
- Quiz difficulty adaptation could be more aggressive.

---

## 5. Learn Options Generator

**File:** Inline in `app/api/learn-options/route.ts`
**Model:** Haiku 4.5
**Purpose:** Generates 3-4 context-aware action options for learn mode UI.

**Current behavior:**
- Takes video title, channel, transcript start/end, duration
- Returns JSON array of {id, label, description, intent} objects
- Always includes one quiz option
- Labels are action-oriented: "Quiz me on...", "Summarize the..."

**What to optimize:**
- Inline prompt. Should probably move to `lib/prompts/learn-mode.ts`.
- Description cap of 60 chars is good but labels could be shorter (3-4 words).

---

## 6. Math Visualizer (Deep)

**File:** `lib/prompts.ts` -> `CHALK_DEEP_SYSTEM_PROMPT`
**API Route:** `app/api/generate/route.ts` (Opus path)
**Model:** Opus 4.6 with reasoning

**What it does:** Generates math explanations + ChalkSpec JSON visualizations.

**Current behavior:**
- Two-part response: explanation text (2-5 sentences) then JSON spec
- Pedagogical principles: example first, build intuition, visual anchors, progressive complexity
- Detailed ChalkSpec format documentation embedded in prompt
- Color palette defined

**What to optimize:**
- Explanation text instruction "texting a brilliant friend" is the right vibe. Keep.
- The ChalkSpec format docs are 50+ lines. Consider: can we trim without losing accuracy?
- Could the expression rules be a separate cached block?

---

## 7. Math Visualizer (Fast)

**File:** `lib/prompts.ts` -> `FAST_SYSTEM_PROMPT`
**API Route:** `app/api/generate/route.ts` (Sonnet/Haiku path)
**Model:** Sonnet 4.5 or Haiku 4.5

**What it does:** Quick math visualizations with minimal explanation.

**Current behavior:**
- One sentence of context + JSON spec
- 1-2 visualization elements max
- Compact version of deep prompt

**What to optimize:**
- Good as-is. Already minimal.

---

## 8. Creative Mode Prefix

**File:** `lib/prompts.ts` -> `CREATIVE_SYSTEM_PROMPT`
**Used by:** `app/api/generate/route.ts` when query is classified as "creative"

**What it does:** Enhances deep prompt with dramatic visual principles.

**Current behavior:**
- Visual drama, color storytelling, cinematic pacing
- Rich narrative with textBlock variants

**What to optimize:**
- Consider removing or folding into deep prompt. Separate "creative" mode adds complexity.

---

## Cross-Cutting Issues

### Tone consistency
Every prompt should share the same voice:
- Capitalized sentences, no emojis ever, no em/en dashes
- Direct, deadpan, clear. Not corny, not corporate.
- Minimal words. Every word earns its place.
- Like texting someone smart who respects your time.

### Prompt caching
Video chat and learn mode use Anthropic prompt caching (3-part system messages).
Math prompts do not. Could save cost by splitting math prompts similarly.

### Shared rules block
The "no emojis, no em dashes, cite timestamps" rules are duplicated across 4+ prompts.
Could extract a shared rules constant and compose prompts from it.

---

## Research: Best System Prompts for Reference

Analyzed 30+ production prompts from `github.com/x1xhlol/system-prompts-and-models-of-ai-tools`.

### Top 3 References for Chalk

**1. Claude Code 2.0** (`Anthropic/Claude Code 2.0.txt`)
Best reference for deadpan professional tone. Core principle: "Do what has been asked; nothing more, nothing less." Responses default to under 4 lines. Asking "2 + 2" gets "4" with no filler. Enforces professional objectivity over user validation. Uses markdown only when it helps clarity. No preamble.

**2. Perplexity** (`Perplexity/Prompt.txt`)
Closest analog to Chalk's citation-driven answering. Inline citations immediately after relevant claims using bracketed indices. Up to three sources per sentence. Forbids separate reference sections. Mandates "journalistic tone" (unbiased, factual, no moralizing). Emojis explicitly forbidden. Responses begin with summary sentences rather than headers. Maps directly onto Chalk's `[M:SS]` timestamp citation pattern.

**3. Poke by Interaction** (`Poke/Poke_p1.txt` through `Poke_p6.txt`)
Best source for anti-sycophancy rules and conversational naturalness. Bans "How can I help you," formal apologies, corporate pleasantries, and robotic phrases. Prohibits all-caps, bold, italic for emphasis. Requires matching user's message length and energy. Original wit only; overused jokes banned. Multi-agent architecture where user-facing layer never reveals internal tool names.

### Specific Rules to Add to Chalk Prompts

**A. Anti-Sycophancy (High Impact)**
```
- Never start with praise ("Great question", "Good point", "That's interesting").
- Never end with an offer ("Let me know if you have questions", "Happy to help").
- Never use "certainly", "absolutely", "of course", "indeed" as filler.
```

**B. Verbosity Calibration (High Impact)**
```
- Factual lookup ("What did they say about X?"): 1-2 sentences with timestamp.
- Concept explanation ("Explain the thing at [3:45]"): 2-4 sentences.
- Summary or study notes: structured bullet points, as long as needed.
- Match the user's effort. A three-word question gets a short answer.
```

**C. Tighter Citation Placement (Medium Impact)**
```
- Place citations immediately after the specific claim, not at sentence end.
- Multiple timestamps per sentence when warranted:
  "The speaker introduces X at [2:14] and revisits it at [8:30]."
```

**D. Invisible Machinery (Medium Impact)**
```
- Never mention internal processes. Do not say "Let me check the transcript",
  "Based on the transcript", or reference the AI model. Answer as if you
  simply know the video.
```

**E. Progressive Disclosure (Medium Impact)**
```
- Default to the shortest useful answer. If the user wants more depth,
  they will ask. Do not front-load depth that was not requested.
```

### Tool Call Patterns Worth Building

| Tool | Description | Inspiration |
|------|-------------|-------------|
| `search_transcript` | Semantic search within transcript. "Where do they talk about X?" returns segments with timestamps. | Cursor `codebase_search` |
| `seek_video` | Navigate player to timestamp. Replaces `[M:SS]` link parsing with structured tool call. | Manus browser actions |
| `create_bookmark` | Save timestamped note. Params: timestamp, label, note. Persists to localStorage/Supabase. | Windsurf `create_memory` |
| `study_plan` | Generate structured learning plan with milestones. | v0 `TodoManager` |

### Ideal Chalk Voice (Synthesized)

- Answer first, context second. Lead with the answer. Timestamp and explanation follow.
- Match the user's energy. Short question, short answer. Detailed question, detailed answer.
- Cite inline. Timestamps appear immediately after the claim they support.
- No filler words, no filler sentences. No greetings, no sign-offs, no praise, no offers.
- Know the video cold. Never reference "the transcript" or internal processes.
- Deadpan clarity over warmth. Correct when wrong. Direct when ambiguous. Concise always.

---

## Tomorrow's Plan

### Phase 1: Define Chalk Voice (20 min)
Write `lib/prompts/shared.ts` with:
- 5-line brand voice spec that all prompts inherit
- Anti-sycophancy rules (from Poke research)
- Verbosity calibration rules (from Claude Code research)
- Invisible machinery rules
- No emojis, no dashes, cite timestamps (shared constant)

### Phase 2: Rewrite Core Prompts (2 hours)
Priority order:
1. `VIDEO_ASSISTANT_SYSTEM_PROMPT` - add anti-sycophancy, verbosity calibration, tighter citations, invisible machinery, progressive disclosure. Compress from 13 rules to ~8.
2. `EXPLORE_MODE_SYSTEM_PROMPT` - already strong. Add invisible machinery rule. Tighten option quality instructions.
3. `VOICE_MODE_SUFFIX` - replace "warm and engaging" with "natural and direct". Align with new voice.
4. `LEARN_MODE_BASE_PROMPT` - compress teaching rules. Add anti-sycophancy.
5. `CHALK_DEEP_SYSTEM_PROMPT` - trim ChalkSpec docs (expression rules can be a cached block). Keep "texting a friend" vibe.
6. `FAST_SYSTEM_PROMPT` - already minimal. Minor tweaks.
7. Learn options inline prompt - move to `lib/prompts/learn-mode.ts`, compress.

### Phase 3: Compose from Shared (30 min)
- All prompts import from `lib/prompts/shared.ts`
- Eliminate rule duplication across 4+ files
- Each prompt file is: shared voice + specific behavior

### Phase 4: Evaluate Tool Calls (30 min, optional)
- Prototype `search_transcript` tool definition
- Evaluate: would structured tool calls for `seek_video` + `create_bookmark` improve UX vs. current [M:SS] parsing?
- Estimate effort. If low, implement. If high, defer.

### Phase 5: Test & Iterate (1 hour)
- Test each rewritten prompt against 3 real videos (short, medium, long)
- Compare: is the tone right? Too terse? Too corporate?
- A/B the old vs new on the same question
- Iterate on any that feel off

### Key Files to Reference During Rewrites
| File | What to steal |
|------|---------------|
| `Anthropic/Claude Code 2.0.txt` | Tone, verbosity calibration, no-preamble |
| `Perplexity/Prompt.txt` | Inline citation placement, journalistic tone |
| `Poke/Poke_p1.txt` | Anti-sycophancy banned phrases, energy matching |
| `Cursor Prompts/Agent Prompt 2025-09-03.txt` | Progressive disclosure, parallel tool calls |
| All at: `github.com/x1xhlol/system-prompts-and-models-of-ai-tools` |
