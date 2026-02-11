/**
 * Groq Whisper API client — cloud speech-to-text.
 * Only activated when GROQ_API_KEY env var is set.
 * Uses fetch (no extra dependencies).
 */

import type { TranscriptSegment } from '../video-utils';

interface GroqWhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface GroqWhisperResponse {
  segments: GroqWhisperSegment[];
  text: string;
}

/**
 * Returns true if the Groq Whisper API is configured.
 */
export function isGroqAvailable(): boolean {
  return !!process.env.GROQ_API_KEY;
}

/**
 * Transcribe an audio file using Groq's Whisper API.
 * @param audioBuffer - Raw audio file bytes (WAV/MP3/etc.)
 * @param filename - Filename hint for the API (e.g., "audio.wav")
 */
export async function transcribeWithGroq(
  audioBuffer: Buffer,
  filename: string = 'audio.wav',
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'en');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Groq API error ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as GroqWhisperResponse;

    if (!data.segments || data.segments.length === 0) {
      throw new Error('Groq Whisper returned no segments');
    }

    return data.segments.map((s) => ({
      text: s.text.trim(),
      offset: s.start,
      duration: s.end - s.start,
    }));
  } finally {
    clearTimeout(timeout);
  }
}
