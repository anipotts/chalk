/**
 * Whisper speech-to-text transcription.
 * Tries OpenAI Whisper API first, falls back to local whisper CLI.
 * Server-only — do NOT import from client components.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { basename, dirname, join } from 'path';
import type { TranscriptSegment } from '@/lib/video-utils';

interface WhisperApiSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperApiResponse {
  segments?: WhisperApiSegment[];
  text?: string;
}

interface WhisperCliSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperCliOutput {
  segments?: WhisperCliSegment[];
}

/**
 * Transcribe audio via OpenAI Whisper API.
 */
async function transcribeOpenAI(audioPath: string): Promise<TranscriptSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const audioBuffer = readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: 'audio/wav' });

  const formData = new FormData();
  formData.append('file', blob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'segment');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI Whisper API error: ${resp.status} ${errText}`);
  }

  const data = (await resp.json()) as WhisperApiResponse;
  if (!data.segments || data.segments.length === 0) {
    throw new Error('Whisper API returned no segments');
  }

  return data.segments.map((seg) => ({
    text: seg.text.trim(),
    offset: seg.start,
    duration: seg.end - seg.start,
  }));
}

/**
 * Transcribe audio via local whisper CLI.
 */
function transcribeLocalWhisper(audioPath: string): TranscriptSegment[] {
  const outputDir = dirname(audioPath);
  const outputName = basename(audioPath, '.wav');

  execSync(
    `whisper "${audioPath}" --model base --output_format json --output_dir "${outputDir}"`,
    { timeout: 300_000, stdio: 'pipe' },
  );

  const jsonPath = join(outputDir, `${outputName}.json`);
  const raw = readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(raw) as WhisperCliOutput;

  if (!data.segments || data.segments.length === 0) {
    throw new Error('Local Whisper returned no segments');
  }

  return data.segments.map((seg) => ({
    text: seg.text.trim(),
    offset: seg.start,
    duration: seg.end - seg.start,
  }));
}

/**
 * Transcribe an audio file using Whisper.
 * Tries OpenAI API first (if OPENAI_API_KEY set), then local CLI.
 *
 * @param audioPath Path to WAV audio file
 * @param onProgress Optional progress callback (only for local CLI, approximate)
 * @returns Array of transcript segments
 */
export async function transcribeWithWhisper(
  audioPath: string,
  onProgress?: (percent: number) => void,
): Promise<TranscriptSegment[]> {
  // Try OpenAI API first
  if (process.env.OPENAI_API_KEY) {
    try {
      onProgress?.(10);
      const segments = await transcribeOpenAI(audioPath);
      onProgress?.(100);
      return segments;
    } catch {
      // Fall through to local
    }
  }

  // Try local whisper CLI
  try {
    onProgress?.(10);
    const segments = transcribeLocalWhisper(audioPath);
    onProgress?.(100);
    return segments;
  } catch {
    throw new Error('Whisper transcription failed (no API key and no local whisper CLI)');
  }
}
