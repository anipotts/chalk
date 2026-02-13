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

## Tomorrow's Plan

### Phase 1: Research & Reference (30 min)
- Review system prompts from https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
- Focus on: Anthropic Claude prompts, Poke by Interaction style, Cursor agent prompt
- Extract: conciseness patterns, tool call definitions, tone frameworks
- Note any tool call patterns worth adopting (timestamp navigation, video context tools)

### Phase 2: Define Chalk Voice (30 min)
- Write a 5-line brand voice spec that all prompts inherit
- Principles: direct, capitalized, no emojis, no dashes, minimal, clear
- Like Poke by Interaction but capitalized and never using emojis
- Test against examples: "too corporate?" "too casual?" "just right?"

### Phase 3: Rewrite Prompts (2-3 hours)
Priority order:
1. `VIDEO_ASSISTANT_SYSTEM_PROMPT` - most used, biggest impact
2. `EXPLORE_MODE_SYSTEM_PROMPT` - already close, tighten options quality
3. `VOICE_MODE_SUFFIX` - align with new brand voice
4. `LEARN_MODE_BASE_PROMPT` - compress teaching rules
5. `CHALK_DEEP_SYSTEM_PROMPT` - trim ChalkSpec docs, keep "texting a friend" vibe
6. `FAST_SYSTEM_PROMPT` - already good, minor tweaks
7. Learn options inline prompt - move to lib/prompts, compress

### Phase 4: Extract Shared Rules (30 min)
- Create `lib/prompts/shared.ts` with common rules block
- Compose all prompts from shared + specific
- Eliminate duplication

### Phase 5: Evaluate Tool Calls (optional, 30 min)
- Consider defining client-side "tools" the AI can call:
  - `seek(timestamp)` - jump to video position
  - `highlight(startTime, endTime)` - highlight transcript section
  - `quiz(questions)` - structured quiz generation
  - `summarize(startTime, endTime)` - summarize a section
- This would replace parsing [M:SS] from text with structured tool responses
- Evaluate effort vs. payoff

### Phase 6: Test & Iterate (1 hour)
- Test each rewritten prompt against real videos
- Compare output quality before/after
- Iterate on any that feel off
