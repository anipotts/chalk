import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const VOCAB_PROMPT = `You are a vocabulary extractor for educational videos. Given a transcript, identify the most important technical terms, concepts, and jargon.

<rules>
- Extract 5-15 key terms depending on content density
- Focus on domain-specific terminology, not common words
- Provide a clear, concise definition for each term (1-2 sentences)
- Include the approximate timestamp where the term is first introduced
- Sort alphabetically
- Output ONLY valid JSON array, nothing else
</rules>

<format>
[
  {
    "term": "Neural Network",
    "definition": "A computing system inspired by biological neural networks that can learn patterns from data.",
    "timestamp": 45,
    "category": "concept"
  }
]
</format>

Notes:
- "category" should be one of: "concept", "technique", "tool", "person", "acronym"
- "timestamp" is in seconds, approximate is fine
- Keep definitions accessible to someone new to the topic`;

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

  let systemPrompt = VOCAB_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\nVideo title: "${videoTitle}"`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages: [{ role: 'user', content: `Extract key vocabulary from this transcript:\n\n${transcript}` }],
      maxOutputTokens: 3000,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse vocabulary' }, { status: 500 });
    }

    const terms = JSON.parse(jsonMatch[0]);
    return Response.json({ terms });
  } catch (e) {
    console.error('[extract-vocabulary] Error:', e);
    return Response.json({ error: 'Failed to extract vocabulary' }, { status: 500 });
  }
}
