import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const COMPARE_PROMPT = `You are a video comparison assistant. Given two video transcripts, create a structured comparison.

<rules>
- Identify the main topics covered by each video
- Highlight similarities and differences
- Note which video covers a topic more thoroughly
- Keep the comparison balanced and fair
- Use clear section headers
- Be concise but thorough
</rules>

<format>
## Overview
Brief summary of what each video covers.

## Key Similarities
- Shared concepts and topics

## Key Differences
- Where the videos diverge

## Video 1 Unique Points
- Topics only covered in video 1

## Video 2 Unique Points
- Topics only covered in video 2

## Which to Watch?
Brief recommendation based on what each video offers.
</format>`;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { transcript1, transcript2, title1, title2 } = body;

  if (!transcript1 || !transcript2) {
    return Response.json({ error: 'Two transcripts required' }, { status: 400 });
  }

  const userContent = `Compare these two videos:

**Video 1: ${title1 || 'Untitled'}**
${transcript1}

---

**Video 2: ${title2 || 'Untitled'}**
${transcript2}`;

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: COMPARE_PROMPT,
    messages: [{ role: 'user', content: userContent }],
    maxOutputTokens: 3000,
  });

  return result.toTextStreamResponse();
}
