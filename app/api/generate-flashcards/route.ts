import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const FLASHCARD_PROMPT = `You are a study assistant. Given a video chat conversation, extract the most important concepts and create study flashcards.

<rules>
- Create 3-8 flashcards depending on conversation length
- Each flashcard should test one specific concept
- Front: A clear, concise question
- Back: A brief but complete answer (1-3 sentences)
- If timestamps are mentioned, include them in the answer
- Output ONLY valid JSON array, nothing else
</rules>

<format>
[
  { "front": "What is X?", "back": "X is...", "timestamp": 123 },
  { "front": "How does Y work?", "back": "Y works by..." }
]
</format>

Notes:
- "timestamp" is optional (seconds), include if the concept was tied to a specific video moment
- Keep answers factual and based on the conversation content`;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { messages, videoTitle } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'Messages required' }, { status: 400 });
  }

  // Format conversation for the model
  const conversation = messages
    .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Student' : 'Chalk'}: ${m.content}`)
    .join('\n\n');

  let systemPrompt = FLASHCARD_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\nVideo title: "${videoTitle}"`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate flashcards from this study conversation:\n\n${conversation}` }],
      maxOutputTokens: 2000,
    });

    // Parse JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse flashcards' }, { status: 500 });
    }

    const cards = JSON.parse(jsonMatch[0]);
    return Response.json({ cards });
  } catch (e) {
    console.error('[generate-flashcards] Error:', e);
    return Response.json({ error: 'Failed to generate flashcards' }, { status: 500 });
  }
}
