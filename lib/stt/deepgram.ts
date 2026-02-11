/**
 * Deepgram Nova-2 speech-to-text transcription.
 * Server-only — do NOT import from client components.
 */

import { createClient } from '@deepgram/sdk';
import { readFileSync } from 'fs';
import type { TranscriptSegment } from '@/lib/video-utils';

/**
 * Transcribe an audio file using Deepgram Nova-2 pre-recorded API.
 * Requires DEEPGRAM_API_KEY env var.
 *
 * @param audioPath Path to WAV audio file
 * @param onSegment Optional callback invoked per utterance for streaming
 * @returns Array of transcript segments
 */
export async function transcribeWithDeepgram(
  audioPath: string,
  onSegment?: (segment: TranscriptSegment) => void,
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const deepgram = createClient(apiKey);
  const audioBuffer = readFileSync(audioPath);

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
    model: 'nova-2',
    language: 'en',
    smart_format: true,
    utterances: true,
    punctuate: true,
  });

  if (error) throw new Error(`Deepgram error: ${error.message}`);

  const utterances = result?.results?.utterances;
  if (!utterances || utterances.length === 0) {
    throw new Error('Deepgram returned no utterances');
  }

  const segments: TranscriptSegment[] = [];
  for (const utt of utterances) {
    const segment: TranscriptSegment = {
      text: utt.transcript,
      offset: utt.start,
      duration: utt.end - utt.start,
    };
    segments.push(segment);
    onSegment?.(segment);
  }

  return segments;
}
