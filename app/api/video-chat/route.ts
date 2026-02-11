import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildVideoSystemPrompt } from '@/lib/prompts/video-assistant';
import { buildVideoContext, formatTimestamp, type TranscriptSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, currentTimestamp, segments, history, model: modelChoice, videoTitle } = body;

  if (!message || typeof message !== 'string') {
    return Response.json({ error: 'Missing message' }, { status: 400 });
  }

  if (message.length > 2000) {
    return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 });
  }

  // Validate segments array structure
  if (segments && !Array.isArray(segments)) {
    return Response.json({ error: 'Invalid segments format' }, { status: 400 });
  }

  // Resolve model
  let resolvedModel: 'opus' | 'sonnet' | 'haiku';
  if (modelChoice === 'opus' || modelChoice === 'sonnet' || modelChoice === 'haiku') {
    resolvedModel = modelChoice;
  } else {
    resolvedModel = 'sonnet'; // Default to Sonnet for video chat (good balance)
  }

  const MODEL_IDS = {
    opus: 'claude-opus-4-6',
    sonnet: 'claude-sonnet-4-5',
    haiku: 'claude-haiku-4-5',
  } as const;

  const model = anthropic(MODEL_IDS[resolvedModel]);
  const isDeep = resolvedModel === 'opus';

  // Build transcript context around current position
  const typedSegments = (segments || []) as TranscriptSegment[];
  const currentTime = typeof currentTimestamp === 'number' ? currentTimestamp : 0;

  // For short videos (< 10 min of transcript), send the full transcript for better context
  const totalDuration = typedSegments.length > 0
    ? typedSegments[typedSegments.length - 1].offset + (typedSegments[typedSegments.length - 1].duration || 0)
    : 0;
  const fullTranscriptText = typedSegments.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
  const useFullTranscript = totalDuration < 600 && fullTranscriptText.length < 12000;

  const transcriptContext = useFullTranscript
    ? fullTranscriptText
    : buildVideoContext(typedSegments, currentTime);

  // Build system prompt with video context
  const systemPrompt = buildVideoSystemPrompt({
    transcriptContext,
    currentTimestamp: formatTimestamp(currentTime),
    videoTitle,
  });

  // Build messages array from history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history && Array.isArray(history)) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  } else {
    messages.push({ role: 'user', content: message });
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    maxOutputTokens: isDeep ? 16000 : resolvedModel === 'sonnet' ? 8000 : 4000,
    providerOptions: isDeep ? {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 8000 },
      },
    } : undefined,
  });

  // Reuse same streaming pattern as /api/generate
  if (!isDeep) {
    return result.toTextStreamResponse();
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let reasoningSent = false;

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'reasoning-delta') {
          controller.enqueue(encoder.encode(chunk.text));
        } else if (chunk.type === 'reasoning-end') {
          if (!reasoningSent) {
            controller.enqueue(encoder.encode('\x1E'));
            reasoningSent = true;
          }
        } else if (chunk.type === 'text-delta') {
          if (!reasoningSent) {
            controller.enqueue(encoder.encode('\x1E'));
            reasoningSent = true;
          }
          controller.enqueue(encoder.encode(chunk.text));
        }
      }

      if (!reasoningSent) {
        controller.enqueue(encoder.encode('\x1E'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
