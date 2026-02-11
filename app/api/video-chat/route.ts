import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildVideoSystemPrompt } from '@/lib/prompts/video-assistant';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, currentTimestamp, segments, history, model: modelChoice, videoTitle, personality, transcriptSource } = body;

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
  if (segments && segments.length > 5000) {
    return Response.json({ error: 'Too many segments (max 5000)' }, { status: 400 });
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

  // Build full transcript context with priority markers around current position
  const typedSegments = (segments || []) as TranscriptSegment[];
  const currentTime = typeof currentTimestamp === 'number' ? currentTimestamp : 0;

  // Always send the full transcript, partitioned into watched (high priority) and upcoming (awareness)
  const watched = typedSegments.filter((s) => s.offset <= currentTime);
  const upcoming = typedSegments.filter((s) => s.offset > currentTime);

  let transcriptContext = '';
  if (watched.length > 0) {
    transcriptContext += '<watched_content priority="high">\n';
    transcriptContext += watched.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
    transcriptContext += '\n</watched_content>';
  }
  if (upcoming.length > 0) {
    transcriptContext += '\n\n<upcoming_content priority="low">\n';
    transcriptContext += upcoming.map((s) => `[${formatTimestamp(s.offset)}] ${s.text}`).join('\n');
    transcriptContext += '\n</upcoming_content>';
  }
  if (!transcriptContext) {
    transcriptContext = '(No transcript available)';
  }

  // Build system prompt with video context
  const safeVideoTitle = typeof videoTitle === 'string' ? videoTitle.slice(0, 200) : undefined;
  let systemPrompt = buildVideoSystemPrompt({
    transcriptContext,
    currentTimestamp: formatTimestamp(currentTime),
    videoTitle: safeVideoTitle,
    transcriptSource: typeof transcriptSource === 'string' ? transcriptSource : undefined,
  });

  // Apply personality modifier
  const PERSONALITY_PROMPTS: Record<string, string> = {
    encouraging: '\n\nAdopt an encouraging, supportive teaching style. Praise the user for good questions, celebrate their understanding, and use positive reinforcement. Be warm and enthusiastic.',
    strict: '\n\nAdopt a direct, no-nonsense teaching style. Be concise and challenging. Point out gaps in understanding directly. Push the user to think deeper. No fluff.',
    socratic: '\n\nAdopt the Socratic method. Instead of giving direct answers, guide the user with probing questions. Help them discover answers themselves. Only reveal answers if they are truly stuck.',
  };
  if (typeof personality === 'string' && PERSONALITY_PROMPTS[personality]) {
    systemPrompt += PERSONALITY_PROMPTS[personality];
  }

  // Build messages array from history (cap at 20 messages to limit cost)
  const MAX_HISTORY = 20;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history && Array.isArray(history)) {
    const trimmed = history.slice(-MAX_HISTORY);
    for (const msg of trimmed) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: String(msg.content).slice(0, 4000) });
      }
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

      try {
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
      } catch (err) {
        console.error('Stream error:', err instanceof Error ? err.message : err);
        if (!reasoningSent) {
          controller.enqueue(encoder.encode('\x1E'));
        }
        controller.enqueue(encoder.encode('\n\n[An error occurred while generating the response.]'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
