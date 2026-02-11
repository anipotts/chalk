import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ANNOTATE_PROMPT = `You are a video timeline annotator. Given a video transcript, identify the most important moments for a viewer.

<rules>
- Identify 5-10 key moments across the video
- Types: "topic_change" (new subject), "key_point" (important statement), "example" (illustration/demo), "question" (rhetorical or discussion question)
- Each annotation should have a brief label (3-8 words)
- Spread annotations roughly evenly across the video duration
- Output ONLY valid JSON array, nothing else
</rules>

<format>
[
  { "timestamp": 30, "type": "topic_change", "label": "Introduction to neural networks" },
  { "timestamp": 120, "type": "key_point", "label": "Backpropagation explained" },
  { "timestamp": 200, "type": "example", "label": "MNIST digit recognition demo" }
]
</format>

Notes:
- "timestamp" is in seconds
- Types: "topic_change", "key_point", "example", "question"
- Keep labels informative but concise`;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { segments, videoTitle } = body;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return Response.json({ error: 'Transcript segments required' }, { status: 400 });
  }

  const transcript = segments
    .map((s: { offset: number; text: string }) => {
      const m = Math.floor(s.offset / 60);
      const sec = Math.floor(s.offset % 60);
      return `[${m}:${sec.toString().padStart(2, '0')}] ${s.text}`;
    })
    .join('\n');

  let systemPrompt = ANNOTATE_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\nVideo title: "${videoTitle}"`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages: [{ role: 'user', content: `Annotate this video timeline:\n\n${transcript}` }],
      maxOutputTokens: 2000,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse annotations' }, { status: 500 });
    }

    const annotations = JSON.parse(jsonMatch[0]);
    return Response.json({ annotations });
  } catch (e) {
    console.error('[annotate-timeline] Error:', e);
    return Response.json({ error: 'Failed to annotate timeline' }, { status: 500 });
  }
}
