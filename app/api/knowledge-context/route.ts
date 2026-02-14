import { getAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export interface KnowledgeContext {
  video: {
    video_id: string;
    title: string;
    summary: string | null;
    topics: string[];
    difficulty: string | null;
    learning_objectives: string[];
    prerequisites: string[];
    key_moments: Array<{ timestamp_seconds: number; label: string; summary: string }>;
  } | null;
  related_videos: Array<{
    video_id: string;
    title: string;
    channel_name: string | null;
    relationship: string;
    shared_concepts: string[];
    reason: string | null;
    thumbnail_url?: string | null;
  }>;
  concept_connections: Array<{
    concept: string;
    display_name: string;
    mention_type: string;
    videos: Array<{
      video_id: string;
      title: string;
      channel_name: string | null;
      mention_type: string;
      timestamp_seconds: number | null;
    }>;
  }>;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('v');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return Response.json({ error: 'Invalid video ID' }, { status: 400 });
  }

  const client = getAdminClient();
  if (!client) {
    return Response.json({ video: null, related_videos: [], concept_connections: [] } satisfies KnowledgeContext);
  }

  // Fetch video knowledge and related videos in parallel
  const [videoResult, relatedResult] = await Promise.all([
    client
      .from('video_knowledge')
      .select('video_id, title, summary, topics, difficulty, learning_objectives, prerequisites, key_moments')
      .eq('video_id', videoId)
      .single(),
    client
      .from('cross_video_links')
      .select(`
        relationship, shared_concepts, reason,
        target:video_knowledge!cross_video_links_target_video_id_fkey(video_id, title, channel_id, thumbnail_url, channels(channel_name))
      `)
      .eq('source_video_id', videoId)
      .order('confidence', { ascending: false })
      .limit(10),
  ]);

  const video = videoResult.data as {
    video_id: string; title: string; summary: string | null; topics: string[];
    difficulty: string | null; learning_objectives: string[]; prerequisites: string[];
    key_moments: Array<{ timestamp_seconds: number; label: string; summary: string }>;
  } | null;

  // Build concept connections using the canonical concept graph:
  // Find concepts mentioned in this video, then find other videos mentioning the same concepts
  let concept_connections: KnowledgeContext['concept_connections'] = [];

  if (video) {
    // Get concepts linked to this video via concept_mentions
    const { data: rawMentionData } = await client
      .from('concept_mentions')
      .select('concept_id, mention_type')
      .eq('video_id', videoId)
      .limit(15);

    const mentionData = rawMentionData as Array<{ concept_id: string; mention_type: string }> | null;

    if (mentionData?.length) {
      const conceptIds = mentionData.map(m => m.concept_id);
      const mentionTypeMap = new Map(mentionData.map(m => [m.concept_id, m.mention_type]));

      // Get concept display names
      const { data: rawConceptData } = await client
        .from('concepts')
        .select('id, display_name')
        .in('id', conceptIds);

      const conceptData = rawConceptData as Array<{ id: string; display_name: string }> | null;
      const displayMap = new Map(conceptData?.map(c => [c.id, c.display_name]) || []);

      // Find other videos that mention these same concepts
      const { data: rawCrossMentions } = await client
        .from('concept_mentions')
        .select('concept_id, video_id, mention_type, timestamp_seconds')
        .in('concept_id', conceptIds)
        .neq('video_id', videoId)
        .limit(40);

      const crossMentions = rawCrossMentions as Array<{
        concept_id: string; video_id: string; mention_type: string; timestamp_seconds: number;
      }> | null;

      if (crossMentions?.length) {
        // Batch fetch titles + channel info for cross-referenced videos
        const videoIds = [...new Set(crossMentions.map(m => m.video_id))];
        const { data: rawTitleData } = await client
          .from('video_knowledge')
          .select('video_id, title, channel_id, channels!inner(channel_name)')
          .in('video_id', videoIds);

        // Try with inner join first; fall back to left join if no channels matched
        let titleVids = rawTitleData as Array<{ video_id: string; title: string; channel_id: string | null; channels: { channel_name: string } | null }> | null;
        if (!titleVids || titleVids.length === 0) {
          const { data: fallbackData } = await client
            .from('video_knowledge')
            .select('video_id, title, channel_id')
            .in('video_id', videoIds);
          titleVids = (fallbackData as Array<{ video_id: string; title: string; channel_id: string | null }> | null)?.map(v => ({
            ...v,
            channels: null,
          })) || null;
        }
        const titleMap = new Map(titleVids?.map(v => [v.video_id, v.title]) || []);
        const channelMap = new Map(titleVids?.map(v => [v.video_id, v.channels?.channel_name || null]) || []);

        // Group by concept
        const conceptGroupMap = new Map<string, Array<{
          video_id: string;
          title: string;
          channel_name: string | null;
          mention_type: string;
          timestamp_seconds: number | null;
        }>>();

        for (const cm of crossMentions) {
          if (!conceptGroupMap.has(cm.concept_id)) conceptGroupMap.set(cm.concept_id, []);
          conceptGroupMap.get(cm.concept_id)!.push({
            video_id: cm.video_id,
            title: titleMap.get(cm.video_id) || 'Unknown',
            channel_name: channelMap.get(cm.video_id) || null,
            mention_type: cm.mention_type,
            timestamp_seconds: cm.timestamp_seconds,
          });
        }

        concept_connections = Array.from(conceptGroupMap.entries()).map(([conceptId, videos]) => ({
          concept: conceptId,
          display_name: displayMap.get(conceptId) || conceptId,
          mention_type: mentionTypeMap.get(conceptId) || 'references',
          videos,
        }));
      }
    }
  }

  // Build related videos list
  const related_videos: KnowledgeContext['related_videos'] = [];
  const relatedLinks = relatedResult.data as Array<{
    relationship: string;
    shared_concepts: string[] | null;
    reason: string | null;
    target: { video_id: string; title: string; channel_id: string | null; thumbnail_url: string | null; channels: { channel_name: string } | null } | null;
  }> | null;
  if (relatedLinks) {
    for (const link of relatedLinks) {
      if (link.target) {
        related_videos.push({
          video_id: link.target.video_id,
          title: link.target.title,
          channel_name: link.target.channels?.channel_name || null,
          relationship: link.relationship,
          shared_concepts: link.shared_concepts || [],
          reason: link.reason,
          thumbnail_url: link.target.thumbnail_url,
        });
      }
    }
  }

  const response: KnowledgeContext = {
    video: video || null,
    related_videos,
    concept_connections,
  };

  return Response.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
