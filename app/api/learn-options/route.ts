import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { videoTitle, channelName, transcriptStart, transcriptEnd, durationSeconds } = body;

  if (!videoTitle || typeof videoTitle !== 'string') {
    return Response.json({ error: 'Missing videoTitle' }, { status: 400 });
  }

  const durationMin = typeof durationSeconds === 'number' ? Math.round(durationSeconds / 60) : null;

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: `You generate context-aware learning action options for a YouTube video learning assistant called Chalk.

Return a JSON array of 3-4 action options. Each option has: id (unique slug), label (short action text, 3-6 words), description (1 sentence explaining what user gets), intent ("patient" or "impatient").

Rules:
- Make options specific to THIS video's content and topic
- Include a mix of patient (deep learning) and impatient (quick results) options
- Always include one quiz-type option with id "quiz"
- Labels should be action-oriented ("Quiz me on...", "Summarize the...", "Explain the...")
- Keep descriptions under 60 characters
- Return ONLY the JSON array, no other text`,
      prompt: `Video: "${videoTitle}"${channelName ? `\nChannel: ${channelName}` : ''}${durationMin ? `\nDuration: ~${durationMin} min` : ''}
\nTranscript start: "${typeof transcriptStart === 'string' ? transcriptStart.slice(0, 500) : ''}"
\nTranscript end: "${typeof transcriptEnd === 'string' ? transcriptEnd.slice(0, 500) : ''}"`,
      maxOutputTokens: 500,
    });

    const parsed = JSON.parse(text.trim());
    if (!Array.isArray(parsed)) throw new Error('Not an array');

    const options = parsed.slice(0, 4).map((opt: { id?: string; label?: string; description?: string; intent?: string }) => ({
      id: String(opt.id || 'unknown').slice(0, 50),
      label: String(opt.label || 'Learn').slice(0, 60),
      description: String(opt.description || '').slice(0, 100),
      intent: opt.intent === 'impatient' ? 'impatient' : 'patient',
    }));

    return Response.json({ options });
  } catch (err) {
    console.error('[learn-options] Error:', err instanceof Error ? err.message : err);
    return Response.json({ options: [] });
  }
}
