// Quick API test
for (const line of require('fs').readFileSync('.env.local', 'utf-8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1);
}
delete process.env.ANTHROPIC_BASE_URL;

import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const key = process.env.ANTHROPIC_API_KEY;
console.log('Key length:', key?.length);
console.log('Key prefix:', key?.slice(0, 15));
console.log('BASE_URL:', process.env.ANTHROPIC_BASE_URL);

// Test with explicit apiKey
const anthropic = createAnthropic({ apiKey: key });

generateText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  prompt: 'Say hello in exactly 3 words',
  maxOutputTokens: 20,
}).then(r => {
  console.log('SUCCESS:', r.text);
}).catch(e => {
  console.log('ERROR:', e.message);
  console.log('Full error:', JSON.stringify(e, null, 2).slice(0, 500));
});
