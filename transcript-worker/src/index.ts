interface Env {
  TRANSCRIPT_CACHE: KVNamespace;
}

interface Segment {
  text: string;
  offset: number;
  duration: number;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

interface AdaptiveFormat {
  itag: number;
  url?: string;
  mimeType: string;
  contentLength?: string;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — Groq Whisper limit
const CHUNK_SIZE = 200 * 1024; // 200KB — YouTube allows Range requests up to ~200KB without throttle

/** Parse XML timedtext: <p t="ms" d="ms">text</p> or <text start="s" dur="s">text</text> */
function parseXmlCaptions(xml: string): Segment[] {
  const segments: Segment[] = [];
  const isPFormat = xml.includes('<p ');
  const re = isPFormat
    ? /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g
    : /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
      .trim();
    if (text) {
      const rawVal = parseFloat(m[1]);
      segments.push({
        text,
        offset: isPFormat ? rawVal / 1000 : rawVal,
        duration: m[2] ? (isPFormat ? parseFloat(m[2]) / 1000 : parseFloat(m[2])) : 0,
      });
    }
  }
  return segments;
}

/**
 * Select best English caption track. If no English track exists,
 * pick the best available track and append &tlang=en for auto-translation.
 */
function selectTrack(tracks: CaptionTrack[]): CaptionTrack {
  const enManual = tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr');
  if (enManual) return enManual;

  const enAsr = tracks.find((t) => t.languageCode?.startsWith('en'));
  if (enAsr) return enAsr;

  // No English track — auto-translate the best available
  const manual = tracks.find((t) => t.kind !== 'asr');
  const best = manual || tracks[0];
  const url = new URL(best.baseUrl);
  url.searchParams.set('tlang', 'en');
  return { ...best, baseUrl: url.toString() };
}

/** Try fetching captions via a specific Innertube client */
async function tryInnertubeClient(
  videoId: string,
  clientConfig: { name: string; body: Record<string, unknown> },
): Promise<Segment[]> {
  const resp = await fetch(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, ...clientConfig.body }),
    },
  );
  if (!resp.ok) throw new Error(`${clientConfig.name}: ${resp.status}`);
  const data = (await resp.json()) as Record<string, any>;

  // Check captions even on LOGIN_REQUIRED — YouTube sometimes includes them
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks as CaptionTrack[] | undefined;
  if (!tracks || tracks.length === 0) {
    const status = data?.playabilityStatus?.status;
    const reason = data?.playabilityStatus?.reason;
    throw new Error(`${clientConfig.name}: no tracks (${status}: ${(reason || 'unknown').slice(0, 80)})`);
  }
  const track = selectTrack(tracks);
  if (!track.baseUrl) throw new Error(`${clientConfig.name}: no baseUrl`);
  const captionResp = await fetch(track.baseUrl);
  if (!captionResp.ok) throw new Error(`${clientConfig.name}: caption ${captionResp.status}`);
  const body = await captionResp.text();
  if (!body) throw new Error(`${clientConfig.name}: empty caption`);
  const segments = parseXmlCaptions(body);
  if (segments.length === 0) throw new Error(`${clientConfig.name}: 0 segments`);
  return segments;
}

/**
 * Try fetching audio streaming URL via a specific Innertube client.
 * Returns the smallest audio-only adaptive format URL.
 */
async function tryInnertubeAudio(
  videoId: string,
  clientConfig: { name: string; body: Record<string, unknown> },
): Promise<{ url: string; contentLength: number; mimeType: string; client: string }> {
  const resp = await fetch(
    'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, ...clientConfig.body }),
    },
  );
  if (!resp.ok) throw new Error(`${clientConfig.name}: audio ${resp.status}`);
  const data = (await resp.json()) as Record<string, any>;
  const formats = data?.streamingData?.adaptiveFormats as AdaptiveFormat[] | undefined;
  if (!formats || formats.length === 0) throw new Error(`${clientConfig.name}: no adaptive formats`);

  const audioFormats = formats
    .filter((f) => f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => parseInt(a.contentLength || '999999999') - parseInt(b.contentLength || '999999999'));

  if (audioFormats.length === 0) throw new Error(`${clientConfig.name}: no audio streams with URLs`);

  const chosen = audioFormats[0];
  const contentLength = parseInt(chosen.contentLength || '0');
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error(`${clientConfig.name}: audio too large (${Math.round(contentLength / 1024 / 1024)}MB)`);
  }

  // SSRF check
  try {
    const u = new URL(chosen.url!);
    if (!u.hostname.endsWith('.googlevideo.com')) {
      throw new Error(`${clientConfig.name}: audio URL host not googlevideo.com`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('audio URL')) throw e;
    throw new Error(`${clientConfig.name}: invalid audio URL`);
  }

  return { url: chosen.url!, contentLength, mimeType: chosen.mimeType, client: clientConfig.name };
}

// ─── Web scrape fallback ────────────────────────────────────────────────────────

async function scrapeWatchPage(videoId: string): Promise<{
  captionTracks?: CaptionTrack[];
  adaptiveFormats?: AdaptiveFormat[];
}> {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!resp.ok) throw new Error(`web-scrape: page ${resp.status}`);
  const html = await resp.text();

  const match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var|<\/script>)/);
  if (!match) throw new Error('web-scrape: no ytInitialPlayerResponse');

  const data = JSON.parse(match[1]);
  return {
    captionTracks: data?.captions?.playerCaptionsTracklistRenderer?.captionTracks,
    adaptiveFormats: data?.streamingData?.adaptiveFormats,
  };
}

async function fetchCaptionsWebScrape(videoId: string): Promise<Segment[]> {
  const { captionTracks } = await scrapeWatchPage(videoId);
  if (!captionTracks || captionTracks.length === 0) throw new Error('web-scrape: no caption tracks');

  const track = selectTrack(captionTracks);
  if (!track.baseUrl) throw new Error('web-scrape: no baseUrl');
  const captionResp = await fetch(track.baseUrl);
  if (!captionResp.ok) throw new Error(`web-scrape: caption ${captionResp.status}`);
  const body = await captionResp.text();
  if (!body) throw new Error('web-scrape: empty caption');
  const segments = parseXmlCaptions(body);
  if (segments.length === 0) throw new Error('web-scrape: 0 segments');
  return segments;
}

async function fetchAudioWebScrape(
  videoId: string,
): Promise<{ url: string; contentLength: number; mimeType: string; client: string }> {
  const { adaptiveFormats } = await scrapeWatchPage(videoId);
  if (!adaptiveFormats || adaptiveFormats.length === 0) throw new Error('web-scrape: no adaptive formats');

  const audioFormats = adaptiveFormats
    .filter((f) => f.mimeType.startsWith('audio/') && f.url)
    .sort((a, b) => parseInt(a.contentLength || '999999999') - parseInt(b.contentLength || '999999999'));

  if (audioFormats.length === 0) throw new Error('web-scrape: no audio streams with URLs');

  const chosen = audioFormats[0];
  const contentLength = parseInt(chosen.contentLength || '0');
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error(`web-scrape: audio too large (${Math.round(contentLength / 1024 / 1024)}MB)`);
  }

  try {
    const u = new URL(chosen.url!);
    if (!u.hostname.endsWith('.googlevideo.com')) {
      throw new Error('web-scrape: audio URL host not googlevideo.com');
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('audio URL')) throw e;
    throw new Error('web-scrape: invalid audio URL');
  }

  return { url: chosen.url!, contentLength, mimeType: chosen.mimeType, client: 'web-scrape' };
}

/**
 * Download audio from a YouTube CDN URL.
 * Returns { response, isPartial } — isPartial is true when only a chunk was retrieved.
 *
 * Strategy:
 * 1. Direct fetch (works for many videos from CF IPs)
 * 2. Small Range request (YouTube CDN sometimes requires Range header)
 * 3. Return partial audio (200KB chunk) — still useful for STT (~30-60s)
 */
async function downloadAudio(
  audioUrl: string,
  contentLength: number,
): Promise<{ response: Response; isPartial: boolean }> {
  // Attempt 1: Direct fetch (works for unthrottled videos)
  const directResp = await fetch(audioUrl);
  if (directResp.ok) return { response: directResp, isPartial: false };

  // Attempt 2: Range request for the full file
  if (contentLength > 0) {
    const rangeResp = await fetch(audioUrl, {
      headers: { Range: `bytes=0-${contentLength - 1}` },
    });
    if (rangeResp.ok || rangeResp.status === 206) {
      return { response: rangeResp, isPartial: false };
    }
  }

  // Attempt 3: Get first chunk only (YouTube throttles after ~200KB)
  // Even partial audio is useful for STT (200KB ≈ 30-60s at low bitrate)
  const chunkResp = await fetch(audioUrl, {
    headers: { Range: `bytes=0-${CHUNK_SIZE - 1}` },
  });
  if (chunkResp.ok || chunkResp.status === 206) {
    return { response: chunkResp, isPartial: true };
  }

  throw new Error(`Audio download failed: ${directResp.status}`);
}

// Innertube client configs — ordered by reliability for captions
const CLIENTS = [
  {
    name: 'ANDROID',
    body: {
      context: { client: { clientName: 'ANDROID', clientVersion: '19.44.38', androidSdkVersion: 34, hl: 'en', gl: 'US' } },
    },
  },
  {
    name: 'IOS',
    body: {
      context: { client: { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' } },
    },
  },
  {
    name: 'WEB',
    body: {
      context: { client: { clientName: 'WEB', clientVersion: '2.20241126.01.00', hl: 'en', gl: 'US' } },
    },
  },
  {
    name: 'MWEB',
    body: {
      context: { client: { clientName: 'MWEB', clientVersion: '2.20241126.01.00', hl: 'en', gl: 'US' } },
    },
  },
  {
    name: 'WEB_EMBEDDED',
    body: {
      context: {
        client: { clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20260115.01.00', hl: 'en', gl: 'US' },
        thirdParty: { embedUrl: 'https://www.youtube.com/' },
      },
    },
  },
];

// ─── KV cache helpers ───────────────────────────────────────────────────────────

const CACHE_TTL = 86400; // 24 hours in seconds

interface CachedCaptions {
  segments: Segment[];
  client: string;
  cachedAt: number;
}

async function getCachedCaptions(kv: KVNamespace, videoId: string): Promise<CachedCaptions | null> {
  try {
    const data = await kv.get(`captions:${videoId}`, 'json');
    return data as CachedCaptions | null;
  } catch {
    return null;
  }
}

async function setCachedCaptions(kv: KVNamespace, videoId: string, segments: Segment[], client: string): Promise<void> {
  try {
    await kv.put(
      `captions:${videoId}`,
      JSON.stringify({ segments, client, cachedAt: Date.now() } as CachedCaptions),
      { expirationTtl: CACHE_TTL },
    );
  } catch {
    // Cache write failure is non-critical
  }
}

// ─── Caption endpoint handler ───────────────────────────────────────────────────

async function handleCaptions(videoId: string, corsHeaders: Record<string, string>, kv: KVNamespace): Promise<Response> {
  // Check KV cache first — globally replicated, works from any edge
  const cached = await getCachedCaptions(kv, videoId);
  if (cached && cached.segments.length > 0) {
    return Response.json(
      { segments: cached.segments, source: 'cf-worker', client: cached.client, cached: true },
      { headers: corsHeaders },
    );
  }

  // Phase 1: Race all Innertube clients, retry up to 3 rounds
  for (let round = 1; round <= 3; round++) {
    try {
      const result = await Promise.any(
        CLIENTS.map((c) => tryInnertubeClient(videoId, c).then((segments) => ({ segments, client: c.name }))),
      );
      // Cache in KV for future requests from any edge
      await setCachedCaptions(kv, videoId, result.segments, result.client);
      return Response.json(
        { segments: result.segments, source: 'cf-worker', client: result.client, round },
        { headers: corsHeaders },
      );
    } catch {
      // All clients failed this round
    }
    if (round < 3) await new Promise((r) => setTimeout(r, 300));
  }

  // Phase 2: Web scrape fallback
  try {
    const segments = await fetchCaptionsWebScrape(videoId);
    // Cache web scrape results too
    await setCachedCaptions(kv, videoId, segments, 'web-scrape');
    return Response.json(
      { segments, source: 'cf-worker', client: 'web-scrape' },
      { headers: corsHeaders },
    );
  } catch {
    // Web scrape also failed
  }

  return Response.json(
    { error: 'All caption sources failed (Innertube + web scrape)' },
    { status: 502, headers: corsHeaders },
  );
}

// ─── Audio proxy endpoint handler ───────────────────────────────────────────────

async function handleAudio(videoId: string, corsHeaders: Record<string, string>): Promise<Response> {
  // Collect audio info from all sources
  type AudioInfo = { url: string; contentLength: number; mimeType: string; client: string };
  const audioSources: AudioInfo[] = [];

  // Phase 1: Try all Innertube clients in parallel
  const innertubeResults = await Promise.allSettled(
    CLIENTS.map((c) => tryInnertubeAudio(videoId, c)),
  );
  for (const r of innertubeResults) {
    if (r.status === 'fulfilled') audioSources.push(r.value);
  }

  // Phase 2: Web scrape fallback
  if (audioSources.length === 0) {
    try {
      audioSources.push(await fetchAudioWebScrape(videoId));
    } catch {
      // Web scrape also failed
    }
  }

  if (audioSources.length === 0) {
    return Response.json(
      { error: 'No audio streams available' },
      { status: 502, headers: corsHeaders },
    );
  }

  // Try each audio source — prefer full downloads, fall back to partial
  let bestPartial: { response: Response; info: AudioInfo } | null = null;

  for (const info of audioSources) {
    try {
      const { response, isPartial } = await downloadAudio(info.url, info.contentLength);
      if (!isPartial) {
        // Full download — return immediately
        return new Response(response.body, {
          headers: {
            ...corsHeaders,
            'Content-Type': info.mimeType.split(';')[0] || 'audio/mp4',
            ...(info.contentLength > 0 ? { 'Content-Length': String(info.contentLength) } : {}),
            'X-Audio-Client': info.client,
          },
        });
      }
      // Partial — save as fallback (prefer first partial we get)
      if (!bestPartial) {
        bestPartial = { response, info };
      }
    } catch {
      continue;
    }
  }

  // Return partial audio if that's all we got (still useful for STT)
  if (bestPartial) {
    return new Response(bestPartial.response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': bestPartial.info.mimeType.split(';')[0] || 'audio/mp4',
        'X-Audio-Client': bestPartial.info.client,
        'X-Audio-Partial': 'true',
      },
    });
  }

  return Response.json(
    { error: 'All audio download attempts failed (throttled by YouTube)' },
    { status: 502, headers: corsHeaders },
  );
}

// ─── Main handler ───────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);
    const videoId = url.searchParams.get('v');
    const mode = url.searchParams.get('mode');

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return Response.json({ error: 'Missing or invalid ?v= parameter' }, { status: 400, headers: corsHeaders });
    }

    // Warm mode: fetch and cache captions from the caller's edge (pre-populate KV)
    if (mode === 'warm') {
      const result = await handleCaptions(videoId, corsHeaders, env.TRANSCRIPT_CACHE);
      const body = (await result.json()) as Record<string, unknown>;
      const count = Array.isArray(body.segments) ? body.segments.length : 0;
      return Response.json(
        { warmed: result.ok, segments: count, cached: body.cached || false, client: body.client },
        { headers: corsHeaders },
      );
    }

    if (mode === 'audio') {
      return handleAudio(videoId, corsHeaders);
    }

    return handleCaptions(videoId, corsHeaders, env.TRANSCRIPT_CACHE);
  },
};
