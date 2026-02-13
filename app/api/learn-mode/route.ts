import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { getLearnModeSystemPrompt, buildLearnModePrompt, buildTranscriptContext } from '@/lib/prompts/learn-mode';
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

  const { segments, currentTimestamp, videoTitle, history, action, difficulty, score, thinkingBudget } = body;

  // Validate
  if (segments && !Array.isArray(segments)) {
    return Response.json({ error: 'Invalid segments format' }, { status: 400 });
  }
  if (segments && segments.length > 5000) {
    return Response.json({ error: 'Too many segments' }, { status: 400 });
  }

  const typedSegments = (segments || []) as TranscriptSegment[];
  const currentTime = typeof currentTimestamp === 'number' ? currentTimestamp : 0;
  const safeVideoTitle = typeof videoTitle === 'string' ? videoTitle.slice(0, 200) : undefined;

  // Build transcript context
  const transcriptContext = buildTranscriptContext(typedSegments, currentTime);

  // Determine if using new action-based or legacy difficulty-based mode
  const hasAction = action && typeof action === 'object' && action.id;

  const cacheOpts = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };

  let systemInput: string | Array<{ role: 'system'; content: string; providerOptions?: typeof cacheOpts }>;

  if (hasAction) {
    // New action-based mode with prompt caching
    const basePrompt = getLearnModeSystemPrompt(action.id, action.intent || 'patient');
    const videoTitleBlock = safeVideoTitle ? `\n<video_title>${safeVideoTitle}</video_title>` : '';
    const scoreBlock = score && typeof score.correct === 'number' && score.total > 0
      ? `\n<student_performance>The student has answered ${score.correct} out of ${score.total} questions correctly so far. Adjust difficulty accordingly.</student_performance>`
      : '';

    systemInput = [
      {
        role: 'system' as const,
        content: basePrompt + videoTitleBlock + scoreBlock,
        providerOptions: cacheOpts,
      },
      {
        role: 'system' as const,
        content: `<transcript>\n${transcriptContext}\n</transcript>`,
        providerOptions: cacheOpts,
      },
      {
        role: 'system' as const,
        content: `<current_position>${formatTimestamp(currentTime)}</current_position>`,
      },
    ];
  } else {
    // Legacy difficulty-based mode (single string, no caching)
    systemInput = buildLearnModePrompt({
      transcriptContext,
      currentTimestamp: formatTimestamp(currentTime),
      videoTitle: safeVideoTitle,
      difficulty: typeof difficulty === 'string' ? difficulty : undefined,
      score: score && typeof score.correct === 'number' ? score : undefined,
    });
  }

  // Build messages array (cap at 20)
  const MAX_HISTORY = 20;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history && Array.isArray(history)) {
    const trimmed = history.slice(-MAX_HISTORY);
    for (const msg of trimmed) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: String(msg.content).slice(0, 4000) });
      }
    }
  }

  // Always add a user message if history is empty
  if (messages.length === 0) {
    if (hasAction) {
      messages.push({
        role: 'user',
        content: `${action.label}. Focus on what I've watched so far.`,
      });
    } else {
      const diffLabel = difficulty || 'intermediate';
      messages.push({
        role: 'user',
        content: `Start Learn Mode at ${diffLabel} difficulty. Generate a quiz about what I've watched so far.`,
      });
    }
  }

  // Use Opus 4.6 with thinking enabled
  const model = anthropic('claude-opus-4-6');

  const result = streamText({
    model,
    system: systemInput,
    messages,
    maxOutputTokens: 4000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: Math.max(1024, Math.min(16000, typeof thinkingBudget === 'number' ? thinkingBudget : 10000)) },
      },
    },
  });

  // Stream with reasoning separator protocol
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
        console.error('Learn mode stream error:', err instanceof Error ? err.message : err);
        if (!reasoningSent) {
          controller.enqueue(encoder.encode('\x1E'));
        }
        controller.enqueue(encoder.encode('\n\n[An error occurred while generating the quiz.]'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
