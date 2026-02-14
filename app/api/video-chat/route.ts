import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { buildVideoSystemPromptParts, buildExploreSystemPromptParts } from '@/lib/prompts/video-assistant';
import { PERSONALITY_MODIFIERS } from '@/lib/prompts/shared';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';
import { createVideoTools } from '@/lib/tools/video-tools';
import { buildKnowledgeGraphPromptContext } from '@/hooks/useKnowledgeContext';
import type { KnowledgeContext } from '@/app/api/knowledge-context/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, currentTimestamp, segments, history, videoTitle, personality, transcriptSource, voiceMode, exploreMode, exploreGoal, modelChoice, thinkingBudget, curriculumContext, videoId, knowledgeContext } = body;

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

  // Build full transcript context with priority markers around current position
  const typedSegments = (segments || []) as TranscriptSegment[];
  const currentTime = typeof currentTimestamp === 'number' ? currentTimestamp : 0;

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

  const safeVideoTitle = typeof videoTitle === 'string' ? videoTitle.slice(0, 200) : undefined;

  // Explore Mode: use Opus with adaptive thinking budget
  if (exploreMode) {
    const model = anthropic('claude-opus-4-6');

    // Dynamic thinking budget: client classifies complexity and sends the value
    const budgetTokens = Math.max(1024, Math.min(16000,
      typeof thinkingBudget === 'number' ? thinkingBudget : 10000
    ));

    const exploreParts = buildExploreSystemPromptParts({
      transcriptContext,
      currentTimestamp: formatTimestamp(currentTime),
      videoTitle: safeVideoTitle,
      exploreGoal: typeof exploreGoal === 'string' ? exploreGoal : undefined,
      transcriptSource: typeof transcriptSource === 'string' ? transcriptSource : undefined,
    });

    // Inject curriculum context if provided (cross-video playlist context)
    if (typeof curriculumContext === 'string' && curriculumContext.length > 0) {
      const cacheOpts = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };
      exploreParts.splice(1, 0, {
        role: 'system' as const,
        content: `<curriculum_context>\nThe student is watching this video as part of a playlist/course. Here are transcripts from related videos in the series. You may reference content from other lectures using "In [Video Title] at [M:SS]..." to draw connections.\n${curriculumContext}\n</curriculum_context>`,
        providerOptions: cacheOpts,
      });
    }

    const MAX_HISTORY = 20;
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (history && Array.isArray(history)) {
      const trimmed = history.slice(-MAX_HISTORY);
      for (const msg of trimmed) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          const content = String(msg.content || '').slice(0, 4000);
          if (content.trim()) {
            messages.push({ role: msg.role, content });
          }
        }
      }
    }

    // Ensure at least the current user message is present
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: message });
    }

    const result = streamText({
      model,
      system: exploreParts,
      messages,
      maxOutputTokens: 1500,
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens },
        },
      },
    });

    // Stream reasoning tokens + \x1E separator + text (enables ThinkingDepthIndicator on client)
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
          console.error('Explore mode stream error:', err instanceof Error ? err.message : err);
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

  // Normal mode: resolve model from client choice (default Sonnet)
  const modelId = modelChoice === 'opus'
    ? 'claude-opus-4-6'
    : modelChoice === 'haiku'
      ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-5-20250929';
  const model = anthropic(modelId);

  // Build system prompt as cached parts
  const systemParts = buildVideoSystemPromptParts({
    transcriptContext,
    currentTimestamp: formatTimestamp(currentTime),
    videoTitle: safeVideoTitle,
    transcriptSource: typeof transcriptSource === 'string' ? transcriptSource : undefined,
    voiceMode: !!voiceMode,
  });

  // Inject knowledge graph context if provided (from useKnowledgeContext)
  const kgCtx = knowledgeContext as KnowledgeContext | undefined;
  if (kgCtx?.video || (kgCtx?.related_videos?.length ?? 0) > 0) {
    const kgXml = buildKnowledgeGraphPromptContext(kgCtx!);
    if (kgXml) {
      const cacheOpts = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };
      systemParts.splice(1, 0, {
        role: 'system' as const,
        content: kgXml,
        providerOptions: cacheOpts,
      });
    }
  }

  // Inject curriculum context if provided (cross-video playlist context)
  if (typeof curriculumContext === 'string' && curriculumContext.length > 0) {
    const cacheOpts = { anthropic: { cacheControl: { type: 'ephemeral' as const } } };
    systemParts.splice(1, 0, {
      role: 'system' as const,
      content: `<curriculum_context>\nThe student is watching this video as part of a playlist/course. Here are transcripts from related videos in the series. You may reference content from other lectures using "In [Video Title] at [M:SS]..." to draw connections.\n${curriculumContext}\n</curriculum_context>`,
      providerOptions: cacheOpts,
    });
  }

  // Apply personality modifier to the last (uncached) part
  if (typeof personality === 'string' && PERSONALITY_MODIFIERS[personality]) {
    const lastPart = systemParts[systemParts.length - 1];
    lastPart.content += PERSONALITY_MODIFIERS[personality];
  }

  // Build messages array from history (cap at 20 messages to limit cost)
  const MAX_HISTORY = 20;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history && Array.isArray(history)) {
    const trimmed = history.slice(-MAX_HISTORY);
    for (const msg of trimmed) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const content = String(msg.content || '').slice(0, 4000);
        if (content.trim()) {
          messages.push({ role: msg.role, content });
        }
      }
    }
  }

  // Ensure at least the current user message is present
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: message });
  }

  // Create tools if we have knowledge graph context and a valid video ID
  const safeVideoId = typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
  const hasKnowledge = kgCtx?.video || (kgCtx?.related_videos?.length ?? 0) > 0;
  const tools = safeVideoId && !voiceMode
    ? createVideoTools(safeVideoId, typedSegments)
    : undefined;

  const result = streamText({
    model,
    system: systemParts,
    messages,
    maxOutputTokens: voiceMode ? 500 : 8000,
    ...(tools ? { tools, maxSteps: 3 } : {}),
  });

  // When tools are active, stream a custom format:
  // - Text deltas are streamed as-is
  // - Tool results are embedded as \x1D{json}\x1D (group separator delimited)
  // This keeps backward compatibility with the existing text stream parser
  if (tools) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.fullStream) {
            if (chunk.type === 'text-delta') {
              controller.enqueue(encoder.encode(chunk.text));
            } else if (chunk.type === 'tool-result') {
              // Embed tool result as delimited JSON
              try {
                const toolData = JSON.stringify({
                  toolName: chunk.toolName,
                  result: chunk.output,
                });
                controller.enqueue(encoder.encode(`\x1D${toolData}\x1D`));
              } catch (toolErr) {
                console.error(`Tool result error (${chunk.toolName}):`, toolErr instanceof Error ? toolErr.message : toolErr);
                const errorData = JSON.stringify({
                  toolName: chunk.toolName,
                  result: { type: 'error', message: `Tool "${chunk.toolName}" failed to produce results.` },
                });
                controller.enqueue(encoder.encode(`\x1D${errorData}\x1D`));
              }
            }
          }
        } catch (err) {
          console.error('Tool stream error:', err instanceof Error ? err.message : err);
          controller.enqueue(encoder.encode('\n\n[An error occurred while generating the response.]'));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return result.toTextStreamResponse();
}
