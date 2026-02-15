// Quick progress check
for (const line of require('fs').readFileSync('.env.local', 'utf-8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1);
}

import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const { data: vids, error } = await sb
    .from('video_knowledge')
    .select('video_id, title, extraction_model, extracted_at')
    .order('extracted_at', { ascending: false })
    .limit(25);

  if (error) {
    console.log('ERROR:', error.message);
  } else {
    console.log('=== video_knowledge ===');
    for (const v of vids || []) {
      console.log(`  ${v.video_id}  ${(v.extraction_model || '?').padEnd(8)} ${(v.title || '').slice(0, 50)}  ${v.extracted_at}`);
    }
    console.log(`  total: ${(vids || []).length} videos`);
  }

  const { data: bp, error: bpErr } = await sb
    .from('batch_progress')
    .select('video_id, status, last_attempt_at')
    .order('last_attempt_at', { ascending: false })
    .limit(25);

  if (!bpErr && bp) {
    console.log('\n=== batch_progress ===');
    for (const v of bp) {
      console.log(`  ${v.video_id}  ${(v.status || '').padEnd(12)} ${v.last_attempt_at}`);
    }
  }

  const { count: concepts } = await sb.from('concepts').select('*', { count: 'exact', head: true });
  const { count: quizzes } = await sb.from('quiz_questions').select('*', { count: 'exact', head: true });
  const { count: xlinks } = await sb.from('cross_video_links').select('*', { count: 'exact', head: true });
  const { count: relations } = await sb.from('concept_relations').select('*', { count: 'exact', head: true });

  console.log('\n=== knowledge graph totals ===');
  console.log(`  concepts: ${concepts}`);
  console.log(`  concept_relations: ${relations}`);
  console.log(`  quiz_questions: ${quizzes}`);
  console.log(`  cross_video_links: ${xlinks}`);
}

main();
