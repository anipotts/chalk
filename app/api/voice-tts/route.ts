import { textToSpeechStream, isElevenLabsAvailable } from '@/lib/tts/elevenlabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isElevenLabsAvailable()) {
    return Response.json(
      { error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY.' },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, voiceId, isClonedVoice } = body;

  if (!text || typeof text !== 'string') {
    return Response.json({ error: 'Missing text' }, { status: 400 });
  }

  if (text.length > 5000) {
    return Response.json({ error: 'Text too long (max 5000 characters)' }, { status: 400 });
  }

  try {
    const stream = await textToSpeechStream(text, voiceId || undefined, !!isClonedVoice);
    return new Response(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('[voice-tts] Error:', err instanceof Error ? err.message : err);
    return Response.json(
      { error: 'TTS generation failed' },
      { status: 500 },
    );
  }
}
