import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { classifyQuery } from '@/lib/router';
import { CHALK_DEEP_SYSTEM_PROMPT, FAST_SYSTEM_PROMPT, CREATIVE_SYSTEM_PROMPT } from '@/lib/prompts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { prompt, history } = await req.json();
  const mode = classifyQuery(prompt);

  const isDeep = mode !== 'fast';
  const isCreative = mode === 'creative';

  const model = isDeep
    ? anthropic('claude-opus-4-6')
    : anthropic('claude-haiku-4-5');

  const systemPrompt = isDeep
    ? (isCreative ? CREATIVE_SYSTEM_PROMPT : '') + CHALK_DEEP_SYSTEM_PROMPT
    : FAST_SYSTEM_PROMPT;

  // Build messages array from history for multi-turn
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (history && Array.isArray(history)) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current prompt
  messages.push({ role: 'user', content: prompt });

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    maxOutputTokens: isDeep ? 32000 : 8000,
    providerOptions: isDeep ? {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 10000 },
      },
    } : undefined,
  });

  return result.toTextStreamResponse();
}
