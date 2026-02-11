# Ralph Loop Mission: Chalk Autonomous Refinement

## Status: RUNNING
Start: 2026-02-10
Target: 10:00 AM EST

## Improvement Queue (Priority Order)

### Tier 1: High Impact, Low Risk
1. **Wire up `pickSuggestions()` from `lib/suggestions.ts`** — ChatOverlay has hardcoded suggestions instead of using the existing dynamic suggestion library
2. **Fetch and display video title** — `videoTitle` prop is plumbed through but never populated from YouTube
3. **Chat history persistence** — Messages vanish on navigation. Save to localStorage per videoId
4. **Multi-line chat input** — Replace `<input>` with `<textarea>` for longer questions
5. **Full transcript mode for short videos** — Send entire transcript instead of sliding window when video < 10 min

### Tier 2: UX Polish
6. **Keyboard shortcut overlay/help** — Show available shortcuts (Space, J, K, L, F, C, arrows)
7. **Copy response button** — Let users copy AI responses
8. **Clear chat button** — Reset conversation without refreshing
9. **Markdown rendering in AI responses** — Bold, italic, lists in responses
10. **Better reasoning panel placement** — Show thinking above content for Opus

### Tier 3: System Improvements
11. **Prompt engineering upgrades** — Add study notes, flashcard, and outline generation modes
12. **Smarter context windowing** — Include brief full-video summary alongside sliding window
13. **Retry on stream failure** — Auto-retry with exponential backoff on API errors
14. **Chat overlay height memory** — Remember user's preferred overlay size

### Tier 4: New Features
15. **Video chapters integration** — Parse YouTube chapters for better navigation
16. **Export chat as markdown** — Download conversation as .md file
17. **Share chat link** — Share a conversation about a video
18. **Playback speed in keyboard shortcuts** — < and > for speed control

## Architecture Constraints
- NEVER import `lib/transcript.ts` from client components
- All viz components wrapped in SafeVizWrapper
- `@vidstack/react@1.12.13` pinned for React 19 compat
- Streaming protocol: reasoning → `\x1E` → text for Opus
- Dark theme only with chalk-* Tailwind colors
