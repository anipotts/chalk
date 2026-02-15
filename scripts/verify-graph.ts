#!/usr/bin/env npx tsx
/**
 * Knowledge Graph Quality Verification Script
 *
 * Reports on the health and completeness of the Chalk knowledge graph:
 * - Entity counts (videos, concepts, relations, quizzes, cross-video links)
 * - Per-video averages
 * - Most connected concepts
 * - Cross-video link samples
 * - Prerequisite chain analysis (learning path feasibility)
 * - Data quality checks
 *
 * Usage:
 *   npx tsx scripts/verify-graph.ts
 */

// Load env vars manually (process.loadEnvFile won't override existing vars)
for (const line of require('fs').readFileSync('.env.local', 'utf-8').split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) process.env[line.slice(0, eq)] = line.slice(eq + 1);
}

import { createClient } from '@supabase/supabase-js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function header(title: string) {
  const bar = '='.repeat(60);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(bar);
}

function row(label: string, value: string | number) {
  console.log(`  ${label.padEnd(40)} ${value}`);
}

function divider() {
  console.log('  ' + '-'.repeat(56));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL not set in .env.local');
    process.exit(1);
  }
  if (!key) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not set in .env.local');
    process.exit(1);
  }

  const client = createClient(url, key);

  // ──────────────────────────────────────────────────────────────────────────
  // Section 1: Entity Counts
  // ──────────────────────────────────────────────────────────────────────────
  header('1. ENTITY COUNTS');

  const [
    { count: videoCount },
    { count: conceptCount },
    { count: relationCount },
    { count: quizCount },
    { count: crossVideoCount },
    { count: mentionCount },
    { count: momentCount },
    { count: chapterCount },
    { count: embeddingCount },
    { count: externalRefCount },
  ] = await Promise.all([
    client.from('video_knowledge').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('concepts').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('concept_relations').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('quiz_questions').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('cross_video_links').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('concept_mentions').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('video_moments').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('video_chapters').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('knowledge_embeddings').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
    client.from('external_references').select('*', { count: 'exact', head: true }).then(r => ({ count: r.count ?? 0 })),
  ]);

  row('Videos extracted', videoCount);
  row('Concepts (canonical)', conceptCount);
  row('Concept relations (edges)', relationCount);
  row('Concept mentions (video-concept)', mentionCount);
  row('Quiz questions', quizCount);
  row('Cross-video links', crossVideoCount);
  row('Video moments', momentCount);
  row('Video chapters', chapterCount);
  row('Knowledge embeddings', embeddingCount);
  row('External references', externalRefCount);

  // ──────────────────────────────────────────────────────────────────────────
  // Section 2: Per-Video Averages
  // ──────────────────────────────────────────────────────────────────────────
  header('2. PER-VIDEO AVERAGES');

  if (videoCount > 0) {
    row('Avg concepts per video', (mentionCount / videoCount).toFixed(1));
    row('Avg quiz questions per video', (quizCount / videoCount).toFixed(1));
    row('Avg moments per video', (momentCount / videoCount).toFixed(1));
    row('Avg chapters per video', (chapterCount / videoCount).toFixed(1));
    row('Avg relations per video', (relationCount / videoCount).toFixed(1));
    row('Avg cross-video links per video', (crossVideoCount / videoCount).toFixed(1));
  } else {
    console.log('  (no videos found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 3: Videos with Most Cross-Video Links
  // ──────────────────────────────────────────────────────────────────────────
  header('3. VIDEOS WITH MOST CROSS-VIDEO LINKS');

  // Get all cross-video links (source side) with video titles
  const { data: cvlSourceCounts } = await client
    .from('cross_video_links')
    .select('source_video_id');

  if (cvlSourceCounts && cvlSourceCounts.length > 0) {
    // Count by source_video_id
    const linkCounts = new Map<string, number>();
    for (const row of cvlSourceCounts as Array<{ source_video_id: string }>) {
      linkCounts.set(row.source_video_id, (linkCounts.get(row.source_video_id) || 0) + 1);
    }

    // Also count target side
    const { data: cvlTargetCounts } = await client
      .from('cross_video_links')
      .select('target_video_id');

    if (cvlTargetCounts) {
      for (const r of cvlTargetCounts as Array<{ target_video_id: string }>) {
        linkCounts.set(r.target_video_id, (linkCounts.get(r.target_video_id) || 0) + 1);
      }
    }

    // Sort and get top 10
    const sorted = [...linkCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Fetch titles for those videos
    const videoIds = sorted.map(([id]) => id);
    const { data: videoTitles } = await client
      .from('video_knowledge')
      .select('video_id, title')
      .in('video_id', videoIds);

    const titleMap = new Map<string, string>();
    if (videoTitles) {
      for (const v of videoTitles as Array<{ video_id: string; title: string }>) {
        titleMap.set(v.video_id, v.title);
      }
    }

    for (const [vid, count] of sorted) {
      const title = titleMap.get(vid) || vid;
      const truncTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;
      row(truncTitle, `${count} links`);
    }
  } else {
    console.log('  (no cross-video links found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 4: Most Connected Concepts (appear in most videos)
  // ──────────────────────────────────────────────────────────────────────────
  header('4. MOST CONNECTED CONCEPTS (by video count)');

  const { data: topConcepts } = await client
    .from('concepts')
    .select('id, display_name, video_count, category, difficulty_level, prerequisite_count')
    .order('video_count', { ascending: false })
    .limit(15);

  if (topConcepts && topConcepts.length > 0) {
    for (const c of topConcepts as Array<{
      id: string; display_name: string; video_count: number;
      category: string | null; difficulty_level: string | null; prerequisite_count: number;
    }>) {
      const meta = [
        c.category,
        c.difficulty_level,
        c.prerequisite_count > 0 ? `${c.prerequisite_count} prereqs` : null,
      ].filter(Boolean).join(', ');
      const label = `${c.display_name}${meta ? ` (${meta})` : ''}`;
      row(label, `${c.video_count} videos`);
    }
  } else {
    console.log('  (no concepts found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 5: Sample Cross-Video Link
  // ──────────────────────────────────────────────────────────────────────────
  header('5. SAMPLE CROSS-VIDEO LINKS');

  const { data: sampleLinks } = await client
    .from('cross_video_links')
    .select('source_video_id, target_video_id, relationship, shared_concepts, reason, confidence')
    .order('confidence', { ascending: false })
    .limit(5);

  if (sampleLinks && sampleLinks.length > 0) {
    // Collect all video IDs to fetch titles
    const allVids = new Set<string>();
    for (const link of sampleLinks as Array<{
      source_video_id: string; target_video_id: string;
      relationship: string; shared_concepts: string[]; reason: string; confidence: number;
    }>) {
      allVids.add(link.source_video_id);
      allVids.add(link.target_video_id);
    }

    const { data: linkTitles } = await client
      .from('video_knowledge')
      .select('video_id, title')
      .in('video_id', [...allVids]);

    const titleLookup = new Map<string, string>();
    if (linkTitles) {
      for (const v of linkTitles as Array<{ video_id: string; title: string }>) {
        titleLookup.set(v.video_id, v.title);
      }
    }

    for (const link of sampleLinks as Array<{
      source_video_id: string; target_video_id: string;
      relationship: string; shared_concepts: string[]; reason: string; confidence: number;
    }>) {
      const srcTitle = titleLookup.get(link.source_video_id) || link.source_video_id;
      const tgtTitle = titleLookup.get(link.target_video_id) || link.target_video_id;
      const truncSrc = srcTitle.length > 35 ? srcTitle.slice(0, 32) + '...' : srcTitle;
      const truncTgt = tgtTitle.length > 35 ? tgtTitle.slice(0, 32) + '...' : tgtTitle;

      console.log(`\n  "${truncSrc}"`);
      console.log(`    --[${link.relationship}]--> "${truncTgt}"`);
      if (link.shared_concepts && link.shared_concepts.length > 0) {
        console.log(`    Shared concepts: ${link.shared_concepts.join(', ')}`);
      }
      if (link.reason) {
        const truncReason = link.reason.length > 80 ? link.reason.slice(0, 77) + '...' : link.reason;
        console.log(`    Reason: ${truncReason}`);
      }
      console.log(`    Confidence: ${link.confidence}`);
    }
  } else {
    console.log('  (no cross-video links found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 6: Relation Types Breakdown
  // ──────────────────────────────────────────────────────────────────────────
  header('6. CONCEPT RELATION TYPES');

  const { data: relTypes } = await client
    .from('concept_relations')
    .select('relation_type');

  if (relTypes && relTypes.length > 0) {
    const typeCounts = new Map<string, number>();
    for (const r of relTypes as Array<{ relation_type: string }>) {
      typeCounts.set(r.relation_type, (typeCounts.get(r.relation_type) || 0) + 1);
    }

    const hasPrerequisite = typeCounts.has('prerequisite');
    const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      row(type, count);
    }

    divider();
    row('"prerequisite" type exists?', hasPrerequisite ? 'YES' : 'NO');
  } else {
    console.log('  (no concept relations found)');
    row('"prerequisite" type exists?', 'NO');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 7: Learning Path Feasibility
  // ──────────────────────────────────────────────────────────────────────────
  header('7. LEARNING PATH FEASIBILITY');

  // Check prerequisite chains
  const { data: prereqEdges } = await client
    .from('concept_relations')
    .select('source_id, target_id, confidence')
    .eq('relation_type', 'prerequisite');

  if (prereqEdges && prereqEdges.length > 0) {
    const edges = prereqEdges as Array<{ source_id: string; target_id: string; confidence: number }>;
    row('Prerequisite edges', edges.length);

    // Build adjacency list (source is prereq of target)
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const allNodes = new Set<string>();

    for (const e of edges) {
      allNodes.add(e.source_id);
      allNodes.add(e.target_id);
      if (!adj.has(e.source_id)) adj.set(e.source_id, []);
      adj.get(e.source_id)!.push(e.target_id);
      inDegree.set(e.target_id, (inDegree.get(e.target_id) || 0) + 1);
    }

    row('Concepts in prerequisite DAG', allNodes.size);

    // Find root concepts (no incoming prerequisite edges)
    const roots = [...allNodes].filter(n => !inDegree.has(n) || inDegree.get(n) === 0);
    row('Root concepts (no prerequisites)', roots.length);

    // Find leaf concepts (no outgoing prerequisite edges)
    const leaves = [...allNodes].filter(n => !adj.has(n) || adj.get(n)!.length === 0);
    row('Leaf concepts (terminal)', leaves.length);

    // Compute longest chain via BFS from each root
    let maxDepth = 0;
    let longestChainEnd = '';
    let longestChainRoot = '';

    for (const root of roots) {
      const visited = new Set<string>();
      const queue: Array<{ node: string; depth: number }> = [{ node: root, depth: 0 }];
      visited.add(root);

      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (depth > maxDepth) {
          maxDepth = depth;
          longestChainEnd = node;
          longestChainRoot = root;
        }
        for (const neighbor of adj.get(node) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ node: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    row('Longest prerequisite chain depth', maxDepth);

    if (maxDepth > 0) {
      // Fetch display names for the chain endpoints
      const { data: chainConcepts } = await client
        .from('concepts')
        .select('id, display_name')
        .in('id', [longestChainRoot, longestChainEnd]);

      const nameMap = new Map<string, string>();
      if (chainConcepts) {
        for (const c of chainConcepts as Array<{ id: string; display_name: string }>) {
          nameMap.set(c.id, c.display_name);
        }
      }

      console.log(`\n  Longest chain example:`);
      console.log(`    From: ${nameMap.get(longestChainRoot) || longestChainRoot}`);
      console.log(`    To:   ${nameMap.get(longestChainEnd) || longestChainEnd}`);
      console.log(`    Depth: ${maxDepth} steps`);
    }

    // Test the get_prerequisite_chain function with a concept that has prerequisites
    const conceptsWithPrereqs = [...inDegree.entries()]
      .filter(([, d]) => d > 0)
      .sort((a, b) => b[1] - a[1]);

    if (conceptsWithPrereqs.length > 0) {
      const testConceptId = conceptsWithPrereqs[0][0];
      const { data: chainResult, error: chainError } = await client
        .rpc('get_prerequisite_chain', { p_concept_id: testConceptId, p_max_depth: 5 });

      if (chainError) {
        console.log(`\n  get_prerequisite_chain() test: ERROR - ${chainError.message}`);
      } else if (chainResult && (chainResult as Array<unknown>).length > 0) {
        const chain = chainResult as Array<{ concept_id: string; display_name: string; depth: number }>;
        console.log(`\n  get_prerequisite_chain('${testConceptId}') returned ${chain.length} prerequisites:`);
        for (const step of chain.slice(0, 5)) {
          console.log(`    depth ${step.depth}: ${step.display_name} (${step.concept_id})`);
        }
        if (chain.length > 5) {
          console.log(`    ... and ${chain.length - 5} more`);
        }
      } else {
        console.log(`\n  get_prerequisite_chain() test: returned 0 results for '${testConceptId}'`);
      }
    }

    divider();
    row('Learning paths possible?', maxDepth >= 2 ? 'YES (chains >= 2 deep)' : maxDepth === 1 ? 'PARTIAL (only 1-deep)' : 'NO');
  } else {
    console.log('  (no prerequisite edges found)');
    row('Learning paths possible?', 'NO');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 8: Data Quality Checks
  // ──────────────────────────────────────────────────────────────────────────
  header('8. DATA QUALITY CHECKS');

  // Videos without concepts
  const { data: videosWithMentions } = await client
    .from('concept_mentions')
    .select('video_id');

  const videosWithConcepts = new Set(
    ((videosWithMentions || []) as Array<{ video_id: string }>).map(r => r.video_id)
  );

  const { data: allVideoIds } = await client
    .from('video_knowledge')
    .select('video_id');

  const allVids = ((allVideoIds || []) as Array<{ video_id: string }>).map(r => r.video_id);
  const videosWithoutConcepts = allVids.filter(v => !videosWithConcepts.has(v));
  row('Videos without concept mentions', videosWithoutConcepts.length);

  // Videos without quiz questions
  const { data: videosWithQuizzes } = await client
    .from('quiz_questions')
    .select('video_id');

  const quizVids = new Set(
    ((videosWithQuizzes || []) as Array<{ video_id: string }>).map(r => r.video_id)
  );
  const videosWithoutQuizzes = allVids.filter(v => !quizVids.has(v));
  row('Videos without quiz questions', videosWithoutQuizzes.length);

  // Concepts with no definition
  const { count: noDefCount } = await client
    .from('concepts')
    .select('*', { count: 'exact', head: true })
    .is('definition', null);
  row('Concepts without definition', noDefCount ?? 0);

  // Concepts mentioned but never appear in concept_mentions
  const { data: allConceptIds } = await client
    .from('concepts')
    .select('id');

  const { data: mentionedConceptIds } = await client
    .from('concept_mentions')
    .select('concept_id');

  const mentionedSet = new Set(
    ((mentionedConceptIds || []) as Array<{ concept_id: string }>).map(r => r.concept_id)
  );
  const orphanConcepts = ((allConceptIds || []) as Array<{ id: string }>)
    .filter(c => !mentionedSet.has(c.id));
  row('Orphan concepts (no video mentions)', orphanConcepts.length);

  // Videos with context_block
  const { count: contextBlockCount } = await client
    .from('video_knowledge')
    .select('*', { count: 'exact', head: true })
    .not('context_block', 'is', null);
  row('Videos with context_block', contextBlockCount ?? 0);

  // Videos with embeddings
  const { data: embeddedVids } = await client
    .from('knowledge_embeddings')
    .select('video_id');

  const embeddedVideoSet = new Set(
    ((embeddedVids || []) as Array<{ video_id: string }>).map(r => r.video_id)
  );
  row('Videos with embeddings', embeddedVideoSet.size);

  // Batch progress status breakdown
  const { data: batchStatuses } = await client
    .from('batch_progress')
    .select('status');

  if (batchStatuses && batchStatuses.length > 0) {
    divider();
    console.log('  Pipeline status breakdown:');
    const statusCounts = new Map<string, number>();
    for (const r of batchStatuses as Array<{ status: string }>) {
      statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
    }
    for (const [status, count] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
      row(`  ${status}`, count);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 9: Moment Type Distribution
  // ──────────────────────────────────────────────────────────────────────────
  header('9. MOMENT TYPE DISTRIBUTION');

  const { data: momentTypes } = await client
    .from('video_moments')
    .select('moment_type');

  if (momentTypes && momentTypes.length > 0) {
    const mtCounts = new Map<string, number>();
    for (const r of momentTypes as Array<{ moment_type: string }>) {
      mtCounts.set(r.moment_type, (mtCounts.get(r.moment_type) || 0) + 1);
    }
    for (const [type, count] of [...mtCounts.entries()].sort((a, b) => b[1] - a[1])) {
      row(type, count);
    }
  } else {
    console.log('  (no moments found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Section 10: Quiz Question Distribution
  // ──────────────────────────────────────────────────────────────────────────
  header('10. QUIZ QUESTION DISTRIBUTION');

  const { data: quizTypes } = await client
    .from('quiz_questions')
    .select('question_type, difficulty, bloom_level');

  if (quizTypes && quizTypes.length > 0) {
    const qtCounts = new Map<string, number>();
    const diffCounts = new Map<string, number>();
    const bloomCounts = new Map<string, number>();

    for (const r of quizTypes as Array<{ question_type: string; difficulty: string; bloom_level: string }>) {
      qtCounts.set(r.question_type, (qtCounts.get(r.question_type) || 0) + 1);
      if (r.difficulty) diffCounts.set(r.difficulty, (diffCounts.get(r.difficulty) || 0) + 1);
      if (r.bloom_level) bloomCounts.set(r.bloom_level, (bloomCounts.get(r.bloom_level) || 0) + 1);
    }

    console.log('  By type:');
    for (const [type, count] of [...qtCounts.entries()].sort((a, b) => b[1] - a[1])) {
      row(`  ${type}`, count);
    }

    console.log('  By difficulty:');
    for (const [diff, count] of [...diffCounts.entries()].sort((a, b) => b[1] - a[1])) {
      row(`  ${diff}`, count);
    }

    console.log('  By Bloom level:');
    for (const [bloom, count] of [...bloomCounts.entries()].sort((a, b) => b[1] - a[1])) {
      row(`  ${bloom}`, count);
    }
  } else {
    console.log('  (no quiz questions found)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  header('SUMMARY');

  const graphDensity = conceptCount > 0 ? (relationCount / conceptCount).toFixed(2) : '0';
  const coveragePercent = videoCount > 0
    ? ((videosWithConcepts.size / videoCount) * 100).toFixed(0)
    : '0';

  row('Graph density (relations/concept)', graphDensity);
  row('Concept coverage', `${coveragePercent}% of videos have concepts`);
  row('Quiz coverage', `${videoCount > 0 ? (((videoCount - videosWithoutQuizzes.length) / videoCount) * 100).toFixed(0) : 0}% of videos have quizzes`);
  row('Embedding coverage', `${videoCount > 0 ? ((embeddedVideoSet.size / videoCount) * 100).toFixed(0) : 0}% of videos have embeddings`);
  row('Context block coverage', `${videoCount > 0 ? (((contextBlockCount ?? 0) / videoCount) * 100).toFixed(0) : 0}% of videos have context blocks`);

  console.log('\n');
}

main();
