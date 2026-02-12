import { transcribeWithGroq, isGroqAvailable } from '@/lib/stt/groq-whisper';
import { transcribeWithDeepgram, isDeepgramAvailable } from '@/lib/stt/deepgram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof Blob)) {
    return Response.json({ error: 'No audio file provided' }, { status: 400 });
  }

  if (audioFile.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: 'Audio file too large (max 10MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await audioFile.arrayBuffer());
  const filename = 'recording.webm';

  // Try Groq Whisper first, then Deepgram
  if (isGroqAvailable()) {
    try {
      const segments = await transcribeWithGroq(buffer, filename);
      const text = segments.map((s) => s.text).join(' ');
      return Response.json({ text });
    } catch (err) {
      console.error('[voice-stt] Groq failed:', err instanceof Error ? err.message : err);
    }
  }

  if (isDeepgramAvailable()) {
    try {
      const segments = await transcribeWithDeepgram(buffer, filename);
      const text = segments.map((s) => s.text).join(' ');
      return Response.json({ text });
    } catch (err) {
      console.error('[voice-stt] Deepgram failed:', err instanceof Error ? err.message : err);
    }
  }

  return Response.json(
    { error: 'No speech-to-text provider available. Set GROQ_API_KEY or DEEPGRAM_API_KEY.' },
    { status: 503 },
  );
}
