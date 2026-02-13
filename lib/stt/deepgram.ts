/**
 * Deepgram Nova-2 API client — cloud speech-to-text.
 * Only activated when DEEPGRAM_API_KEY env var is set.
 */

import type { TranscriptSegment } from '../video-utils';

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
}

interface DeepgramAlternative {
  transcript: string;
  words: DeepgramWord[];
  paragraphs?: {
    paragraphs: Array<{
      sentences: Array<{
        text: string;
        start: number;
        end: number;
      }>;
    }>;
  };
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: DeepgramAlternative[];
    }>;
    utterances?: Array<{
      start: number;
      end: number;
      transcript: string;
    }>;
  };
}

export function isDeepgramAvailable(): boolean {
  return !!process.env.DEEPGRAM_API_KEY;
}

const MAX_DEEPGRAM_BYTES = 25 * 1024 * 1024; // 25MB limit

export async function transcribeWithDeepgram(
  audioBuffer: Buffer,
  filename: string = 'audio.webm',
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not set');

  if (audioBuffer.length > MAX_DEEPGRAM_BYTES) {
    throw new Error(`Audio too large for Deepgram (${Math.round(audioBuffer.length / 1024 / 1024)}MB, max 25MB)`);
  }

  // Infer content type from filename
  const ext = filename.split('.').pop()?.toLowerCase();
  const contentType = ext === 'wav' ? 'audio/wav'
    : ext === 'mp3' ? 'audio/mpeg'
    : ext === 'webm' ? 'audio/webm'
    : ext === 'mp4' || ext === 'm4a' ? 'audio/mp4'
    : 'audio/webm';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

  try {
    const resp = await fetch(
      // TODO: future — add diarize=true for multi-speaker support
      'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&paragraphs=true&utterances=true&language=en',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': contentType,
        },
        body: new Uint8Array(audioBuffer),
        signal: controller.signal,
      },
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Deepgram API error ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as DeepgramResponse;

    // Prefer utterances (sentence-level segments with timestamps)
    // Attach word-level data from the channel alternatives
    if (data.results?.utterances && data.results.utterances.length > 0) {
      const allWords = data.results?.channels?.[0]?.alternatives?.[0]?.words || [];
      return data.results.utterances.map((u) => {
        // Find words that fall within this utterance's time range
        const segWords = allWords
          .filter((w) => w.start >= u.start && w.start < u.end)
          .map((w) => ({ text: w.punctuated_word || w.word, startMs: w.start * 1000 }));
        return {
          text: u.transcript.trim(),
          offset: u.start,
          duration: u.end - u.start,
          words: segWords.length > 0 ? segWords : undefined,
        };
      });
    }

    // Fall back to paragraphs → sentences
    const alt = data.results?.channels?.[0]?.alternatives?.[0];
    if (alt?.paragraphs?.paragraphs) {
      const segments: TranscriptSegment[] = [];
      for (const para of alt.paragraphs.paragraphs) {
        for (const sent of para.sentences) {
          segments.push({
            text: sent.text.trim(),
            offset: sent.start,
            duration: sent.end - sent.start,
          });
        }
      }
      if (segments.length > 0) return segments;
    }

    // Last resort: build segments from words (group every ~10 words)
    if (alt?.words && alt.words.length > 0) {
      const segments: TranscriptSegment[] = [];
      const WORDS_PER_SEGMENT = 10;
      for (let i = 0; i < alt.words.length; i += WORDS_PER_SEGMENT) {
        const group = alt.words.slice(i, i + WORDS_PER_SEGMENT);
        const text = group.map((w) => w.punctuated_word || w.word).join(' ');
        const start = group[0].start;
        const end = group[group.length - 1].end;
        const words = group.map((w) => ({
          text: w.punctuated_word || w.word,
          startMs: w.start * 1000,
        }));
        segments.push({ text, offset: start, duration: end - start, words });
      }
      return segments;
    }

    throw new Error('Deepgram returned no transcription data');
  } finally {
    clearTimeout(timeout);
  }
}
