#!/usr/bin/env npx tsx
/**
 * Automated test script for all 8 video tools.
 * Tests both extracted and non-extracted video scenarios.
 *
 * Usage:
 *   npx tsx scripts/test-tools.ts
 */

// Load env
for (const line of require('fs').readFileSync('.env.local', 'utf-8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1);
}
delete process.env.ANTHROPIC_BASE_URL;

import { createVideoTools } from '../lib/tools/video-tools';
import type { TranscriptSegment } from '../lib/video-utils';

// Helper: call a tool's execute function (bypasses optional typing from AI SDK)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exec(tool: { execute?: (...args: any[]) => any }, input: Record<string, unknown>): Promise<any> {
  if (!tool.execute) throw new Error('Tool has no execute function');
  return tool.execute(input, { toolCallId: 'test', messages: [], abortSignal: undefined as unknown as AbortSignal });
}

// Known extracted video (3Blue1Brown transformers)
const EXTRACTED_VIDEO_ID = 'eMlx5fFNoYc';
// A video ID not in the knowledge graph
const UNEXTRACTED_VIDEO_ID = 'dQw4w9WgXcQ';

// Fake transcript segments for testing
const FAKE_SEGMENTS: TranscriptSegment[] = [
  { offset: 0, duration: 30, text: 'Welcome to this video about attention mechanisms' },
  { offset: 30, duration: 30, text: 'First we need to understand what a query is' },
  { offset: 60, duration: 60, text: 'The key insight is that attention computes relevance' },
  { offset: 120, duration: 60, text: 'Now lets look at how transformers use self-attention' },
  { offset: 180, duration: 120, text: 'Each token generates a query, key, and value vector' },
  { offset: 300, duration: 120, text: 'The softmax function normalizes the attention weights' },
  { offset: 420, duration: 180, text: 'Multi-head attention allows attending to different subspaces' },
  { offset: 600, duration: 60, text: 'In summary, attention is all you need' },
];

interface TestResult {
  tool: string;
  scenario: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function testTool(
  toolName: string,
  scenario: string,
  fn: () => Promise<void>,
) {
  try {
    await fn();
    results.push({ tool: toolName, scenario, passed: true });
    console.log(`  ✓ ${toolName} (${scenario})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ tool: toolName, scenario, passed: false, error: msg });
    console.log(`  ✗ ${toolName} (${scenario}): ${msg}`);
  }
}

async function main() {
  console.log('\n=== Video Tools Test Suite ===\n');

  // ──────────────────────────────────────────────
  // Test with EXTRACTED video
  // ──────────────────────────────────────────────
  console.log(`\n--- Extracted video: ${EXTRACTED_VIDEO_ID} ---\n`);
  const et = createVideoTools(EXTRACTED_VIDEO_ID, FAKE_SEGMENTS);

  // 1. cite_moment
  await testTool('cite_moment', 'extracted', async () => {
    const r = await exec(et.cite_moment, { timestamp_seconds: 120, label: 'Key concept', context: 'Attention mechanism' });
    assert(r.type === 'cite_moment', `expected type cite_moment, got ${r.type}`);
    assert(r.timestamp_seconds === 120, 'timestamp_seconds should be 120');
    assert(typeof r.timestamp === 'string', 'timestamp should be a string');
    assert(typeof r.label === 'string', 'label should be a string');
    assert(r.video_id === EXTRACTED_VIDEO_ID, 'video_id mismatch');
    assert(typeof r.transcript_line === 'string', 'transcript_line should be a string');
  });

  // 2. reference_video — valid extracted video reference
  await testTool('reference_video', 'extracted - valid ref', async () => {
    const r = await exec(et.reference_video, {
      video_id: 'Ilg3gGewQ5U', video_title: 'But what is a GPT?',
      channel_name: '3Blue1Brown', reason: 'Covers same topic',
    });
    assert(r.type === 'reference_video', `expected type reference_video, got ${r.type}`);
    assert(typeof r.thumbnail_url === 'string', 'thumbnail_url should be a string');
    assert(typeof r.video_title === 'string', 'video_title should be a string');
    console.log(`    → relationship: ${r.relationship || 'none'}, shared: ${r.shared_concepts?.length || 0}`);
    console.log(`    → warning: ${r.warning || 'none'}`);
  });

  // 3. reference_video — invalid/nonexistent video
  await testTool('reference_video', 'extracted - nonexistent ref', async () => {
    const r = await exec(et.reference_video, {
      video_id: 'XXXXXXXXXXX', video_title: 'Does not exist',
      channel_name: 'Nobody', reason: 'Testing graceful handling',
    });
    assert(r.type === 'reference_video', 'type should be reference_video');
    assert(r.warning !== undefined, 'should have a warning for nonexistent video');
    console.log(`    → warning: ${r.warning}`);
  });

  // 4. reference_video — invalid format
  await testTool('reference_video', 'extracted - bad format ID', async () => {
    const r = await exec(et.reference_video, {
      video_id: 'short', video_title: 'Bad ID',
      channel_name: 'Test', reason: 'Testing validation',
    });
    assert(r.warning === 'Invalid video ID format', `expected invalid format warning, got: ${r.warning}`);
  });

  // 5. search_knowledge — concept search
  await testTool('search_knowledge', 'extracted - concept search', async () => {
    const r = await exec(et.search_knowledge, { query: 'attention', type: 'concept' });
    assert(r.type === 'search_results', `expected type search_results, got ${r.type}`);
    assert(Array.isArray(r.results), 'results should be an array');
    console.log(`    → found ${r.results.length} results`);
  });

  // 6. search_knowledge — video search
  await testTool('search_knowledge', 'extracted - video search', async () => {
    const r = await exec(et.search_knowledge, { query: 'neural network', type: 'video' });
    assert(r.type === 'search_results', 'type should be search_results');
    assert(Array.isArray(r.results), 'results should be an array');
    console.log(`    → found ${r.results.length} video results`);
  });

  // 7. search_knowledge — injection attempt
  await testTool('search_knowledge', 'extracted - injection test', async () => {
    const r = await exec(et.search_knowledge, { query: 'test),video_id.eq.abc,(title.ilike.%' });
    assert(r.type === 'search_results', 'should not crash on injection attempt');
    console.log(`    → results: ${r.results.length} (expected ~0 for injection attempt)`);
  });

  // 8. get_prerequisites
  await testTool('get_prerequisites', 'extracted - real concept', async () => {
    const r = await exec(et.get_prerequisites, { concept_id: 'attention_mechanism' });
    assert(r.type === 'prerequisite_chain', `expected type prerequisite_chain, got ${r.type}`);
    assert(Array.isArray(r.chain), 'chain should be an array');
    console.log(`    → chain length: ${r.chain.length}, message: ${r.message || 'none'}`);
  });

  // 9. get_prerequisites — nonexistent
  await testTool('get_prerequisites', 'extracted - nonexistent concept', async () => {
    const r = await exec(et.get_prerequisites, { concept_id: 'nonexistent_concept_xyz' });
    assert(r.type === 'prerequisite_chain', 'type should be prerequisite_chain');
    assert(r.chain.length === 0, 'should return empty chain for nonexistent concept');
    console.log(`    → message: ${r.message || 'none'}`);
  });

  // 10. get_quiz
  await testTool('get_quiz', 'extracted', async () => {
    const r = await exec(et.get_quiz, { limit: 3 });
    assert(r.type === 'quiz', `expected type quiz, got ${r.type}`);
    assert(Array.isArray(r.questions), 'questions should be an array');
    console.log(`    → questions: ${r.questions.length}, message: ${r.message || 'none'}`);
    if (r.questions.length > 0) {
      assert(typeof r.questions[0].question === 'string', 'question text should be string');
      assert(typeof r.questions[0].correct_answer === 'string', 'correct_answer should be string');
    }
  });

  // 11. get_chapter_context
  await testTool('get_chapter_context', 'extracted', async () => {
    const r = await exec(et.get_chapter_context, { timestamp_seconds: 300 });
    assert(r.type === 'chapter_context', `expected type chapter_context, got ${r.type}`);
    console.log(`    → chapter: ${r.chapter?.title || 'none'}, moments: ${r.moments.length}`);
  });

  // 12. explain_differently
  await testTool('explain_differently', 'extracted - real concept', async () => {
    const r = await exec(et.explain_differently, { concept_id: 'neural_network' });
    assert(r.type === 'alternative_explanations', `expected type alternative_explanations, got ${r.type}`);
    assert(Array.isArray(r.alternatives), 'alternatives should be an array');
    console.log(`    → alternatives: ${r.alternatives.length}, message: ${r.message || 'none'}`);
  });

  // 13. explain_differently — nonexistent
  await testTool('explain_differently', 'extracted - nonexistent concept', async () => {
    const r = await exec(et.explain_differently, { concept_id: 'nonexistent_concept_xyz' });
    assert(r.type === 'alternative_explanations', 'type should be alternative_explanations');
    assert(r.alternatives.length === 0, 'should return empty for nonexistent concept');
  });

  // 14. get_learning_path
  await testTool('get_learning_path', 'extracted', async () => {
    const r = await exec(et.get_learning_path, { from_concept: 'linear_algebra', to_concept: 'attention_mechanism' });
    assert(r.type === 'learning_path', `expected type learning_path, got ${r.type}`);
    assert(Array.isArray(r.steps), 'steps should be an array');
    console.log(`    → steps: ${r.steps.length}, message: ${r.message || 'none'}`);
  });

  // ──────────────────────────────────────────────
  // Test with NON-EXTRACTED video
  // ──────────────────────────────────────────────
  console.log(`\n--- Non-extracted video: ${UNEXTRACTED_VIDEO_ID} ---\n`);
  const ut = createVideoTools(UNEXTRACTED_VIDEO_ID, FAKE_SEGMENTS);

  // cite_moment should still work (uses transcript)
  await testTool('cite_moment', 'non-extracted', async () => {
    const r = await exec(ut.cite_moment, { timestamp_seconds: 60, label: 'Test', context: 'Testing' });
    assert(r.type === 'cite_moment', 'cite_moment should work on any video');
    assert(r.transcript_line.length > 0, 'should find closest transcript line');
  });

  // get_quiz — should return empty or fallback gracefully
  await testTool('get_quiz', 'non-extracted', async () => {
    const r = await exec(ut.get_quiz, { limit: 3 });
    assert(r.type === 'quiz', 'type should be quiz');
    assert(r.questions.length === 0, 'should return no questions for non-extracted video');
    assert(typeof r.message === 'string', 'should have a message explaining no quiz available');
  });

  // get_chapter_context — should return empty
  await testTool('get_chapter_context', 'non-extracted', async () => {
    const r = await exec(ut.get_chapter_context, { timestamp_seconds: 120 });
    assert(r.type === 'chapter_context', 'type should be chapter_context');
    assert(r.chapter === null, 'chapter should be null for non-extracted video');
    assert(r.moments.length === 0, 'moments should be empty for non-extracted video');
  });

  // search_knowledge — should still search (it queries globally)
  await testTool('search_knowledge', 'non-extracted', async () => {
    const r = await exec(ut.search_knowledge, { query: 'attention' });
    assert(r.type === 'search_results', 'type should be search_results');
    console.log(`    → found ${r.results.length} results (from other extracted videos)`);
  });

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  console.log('\n=== Results Summary ===\n');

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failed) {
      console.log(`  ✗ ${f.tool} (${f.scenario}): ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
