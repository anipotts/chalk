import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { formatTimestamp, type TranscriptSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { segments, videoTitle } = body;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return Response.json({ error: 'Transcript required' }, { status: 400 });
  }

  const typedSegments = segments as TranscriptSegment[];

  // Build a condensed transcript (sample segments evenly)
  const step = Math.max(1, Math.floor(typedSegments.length / 40));
  const sampled = typedSegments.filter((_, i) => i % step === 0);
  const transcriptText = sampled
    .map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`)
    .join('\n');

  const prompt = `Extract 3-5 key takeaways from this video transcript. Return ONLY a JSON array of objects with "text" (the takeaway) and "timestamp" (seconds number for the most relevant moment).${videoTitle ? `\n\nVideo: "${videoTitle}"` : ''}\n\nTranscript:\n${transcriptText.slice(0, 15000)}`;

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt,
      maxOutputTokens: 600,
    });

    // Parse JSON from response
    const match = result.text.match(/\[[\s\S]*\]/);
    if (match) {
      const takeaways = JSON.parse(match[0]);
      return Response.json({ takeaways });
    }
    return Response.json({ error: 'Failed to parse takeaways' }, { status: 500 });
  } catch {
    return Response.json({ error: 'Generation failed' }, { status: 500 });
  }
}
