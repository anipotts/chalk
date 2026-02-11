import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const QUIZ_PROMPT = `You are a study quiz generator. Given a video transcript (or conversation about a video), create a multiple-choice quiz to test understanding.

<rules>
- Create exactly 5 questions
- Each question should have 4 answer options (A, B, C, D)
- Exactly one answer should be correct
- Include a brief explanation for the correct answer
- Questions should range from recall to comprehension
- If you know the timestamp where the answer is discussed, include it
- Output ONLY valid JSON array, nothing else
</rules>

<format>
[
  {
    "question": "What is the main concept discussed in this section?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "The correct answer is A because...",
    "timestamp": 123
  }
]
</format>

Notes:
- "correctIndex" is 0-based (0=A, 1=B, 2=C, 3=D)
- "timestamp" is optional (seconds)
- Make distractors plausible but clearly wrong
- Base questions solely on the provided content`;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { segments, videoTitle, messages } = body;

  if ((!segments || segments.length === 0) && (!messages || messages.length === 0)) {
    return Response.json({ error: 'Transcript segments or messages required' }, { status: 400 });
  }

  // Build content from transcript or conversation
  let content: string;
  if (segments && segments.length > 0) {
    content = segments
      .map((s: { offset: number; text: string }) => {
        const m = Math.floor(s.offset / 60);
        const sec = Math.floor(s.offset % 60);
        return `[${m}:${sec.toString().padStart(2, '0')}] ${s.text}`;
      })
      .join('\n');
  } else {
    content = messages
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Student' : 'Chalk'}: ${m.content}`)
      .join('\n\n');
  }

  let systemPrompt = QUIZ_PROMPT;
  if (videoTitle) {
    systemPrompt += `\n\nVideo title: "${videoTitle}"`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5'),
      system: systemPrompt,
      messages: [{ role: 'user', content: `Generate a quiz from this content:\n\n${content}` }],
      maxOutputTokens: 3000,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: 'Failed to parse quiz' }, { status: 500 });
    }

    const questions = JSON.parse(jsonMatch[0]);
    return Response.json({ questions });
  } catch (e) {
    console.error('[generate-quiz] Error:', e);
    return Response.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
