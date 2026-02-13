import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { classifyQuery } from '@/lib/router';
import { CHALK_DEEP_SYSTEM_PROMPT, FAST_SYSTEM_PROMPT, CREATIVE_SYSTEM_PROMPT } from '@/lib/prompts/math';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { prompt, history, model: modelChoice } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response('Missing prompt', { status: 400 });
  }

  if (prompt.length > 2000) {
    return new Response('Prompt too long (max 2000 characters)', { status: 400 });
  }

  // Model selection: user choice overrides auto-routing
  const autoMode = classifyQuery(prompt);
  const isCreative = autoMode === 'creative';

  // Resolve which model to use
  let resolvedModel: 'opus' | 'sonnet' | 'haiku';
  if (modelChoice === 'opus' || modelChoice === 'sonnet' || modelChoice === 'haiku') {
    resolvedModel = modelChoice;
  } else {
    // Auto mode: route by query complexity
    resolvedModel = autoMode === 'fast' ? 'haiku' : 'opus';
  }

  const MODEL_IDS = {
    opus: 'claude-opus-4-6',
    sonnet: 'claude-sonnet-4-5',
    haiku: 'claude-haiku-4-5',
  } as const;

  const model = anthropic(MODEL_IDS[resolvedModel]);
  const isDeep = resolvedModel === 'opus';

  // System prompt: Opus gets the deep prompt, others get the fast prompt
  const systemPrompt = isDeep
    ? (isCreative ? CREATIVE_SYSTEM_PROMPT : '') + CHALK_DEEP_SYSTEM_PROMPT
    : FAST_SYSTEM_PROMPT;

  // Build messages array from history for multi-turn (cap at 20 to limit cost)
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
    messages.push({ role: 'user', content: prompt });
  }

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    maxOutputTokens: isDeep ? 32000 : resolvedModel === 'sonnet' ? 16000 : 8000,
    providerOptions: isDeep ? {
      anthropic: {
        // Adaptive thinking (Anthropic recommended for Opus 4.6)
        thinking: { type: 'enabled', budgetTokens: 10000 },
      },
    } : undefined,
  });

  // For deep mode: stream reasoning + text with \x1E separator so the client
  // can show the ReasoningPanel. Fast mode has no thinking, so use plain text.
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
