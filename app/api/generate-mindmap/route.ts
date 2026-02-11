import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MINDMAP_PROMPT = `You are a mind map generator. Given a video transcript, extract the main concepts and their relationships to create a mind map.

<rules>
- Identify the central topic (1 node)
- Extract 4-8 major subtopics
- For each subtopic, identify 0-3 details or related concepts
- Include connections between related nodes
- Each node should have a brief label (2-5 words) and a timestamp
- Output ONLY valid JSON, nothing else
</rules>

<format>
{
  "central": { "label": "Main Topic", "timestamp": 0 },
  "nodes": [
    { "id": "n1", "label": "Subtopic 1", "timestamp": 30, "level": 1 },
    { "id": "n2", "label": "Subtopic 2", "timestamp": 120, "level": 1 },
    { "id": "n1a", "label": "Detail of S1", "timestamp": 45, "level": 2, "parent": "n1" },
    { "id": "n2a", "label": "Detail of S2", "timestamp": 180, "level": 2, "parent": "n2" }
  ],
  "connections": [
    { "from": "n1", "to": "n2", "label": "relates to" }
  ]
}
</format>

Notes:
- "level" 1 = major subtopic, 2 = detail/sub-subtopic
- "parent" links details to their parent subtopic
- "connections" are optional cross-links between related nodes
- Timestamps are in seconds
- Keep labels concise and meaningful`;

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

  let systemPrompt = MINDMAP_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\nVideo title: "${videoTitle}"`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate a mind map from this transcript:\n\n${transcript}` }],
      maxOutputTokens: 3000,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse mind map' }, { status: 500 });
    }

    const mindmap = JSON.parse(jsonMatch[0]);
    return Response.json({ mindmap });
  } catch (e) {
    console.error('[generate-mindmap] Error:', e);
    return Response.json({ error: 'Failed to generate mind map' }, { status: 500 });
  }
}
