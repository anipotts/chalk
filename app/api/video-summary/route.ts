import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { formatTimestamp, type TranscriptSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SUMMARY_PROMPT = `You are Chalk, a study assistant. Generate a comprehensive study summary of this video based on its transcript.

<format>
Structure your response EXACTLY like this:

## Key Takeaways
- [Timestamp] Main point 1
- [Timestamp] Main point 2
(3-6 key takeaways, each with a timestamp reference)

## Outline
1. **[M:SS] Section title** — brief description
2. **[M:SS] Section title** — brief description
(chronological outline of the video's structure)

## Concepts & Definitions
- **Term**: definition or explanation [M:SS]
(key terms and concepts explained, with timestamps)

## Quick Quiz
1. Question about the content? (Answer: brief answer [M:SS])
2. Question about the content? (Answer: brief answer [M:SS])
(3-5 quiz questions to test understanding)
</format>

<rules>
- ALWAYS cite timestamps as [M:SS] format (e.g., [2:34], [15:07])
- Keep it concise but thorough — this is study material
- Focus on the most important and testable concepts
- Order everything chronologically when possible
- Use **bold** for key terms
</rules>`;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { segments, videoTitle } = body;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return Response.json({ error: 'Transcript required for summary' }, { status: 400 });
  }

  const typedSegments = segments as TranscriptSegment[];

  // Build full transcript text
  const transcriptText = typedSegments
    .map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`)
    .join('\n');

  // Truncate if very long (>50k chars)
  const truncated = transcriptText.length > 50000
    ? transcriptText.slice(0, 50000) + '\n\n[...transcript truncated]'
    : transcriptText;

  let systemPrompt = SUMMARY_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\n<video_title>${videoTitle}</video_title>`;
  }
  systemPrompt += `\n\n<full_transcript>\n${truncated}\n</full_transcript>`;

  const model = anthropic('claude-sonnet-4-5');

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Generate a comprehensive study summary of this video.' }],
    maxOutputTokens: 4000,
  });

  return result.toTextStreamResponse();
}
