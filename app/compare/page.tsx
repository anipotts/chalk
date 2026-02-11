'use client';

import { useState, useCallback } from 'react';
import { extractVideoId } from '@/lib/video-utils';

export default function ComparePage() {
  const [url1, setUrl1] = useState('');
  const [url2, setUrl2] = useState('');
  const [title1, setTitle1] = useState('');
  const [title2, setTitle2] = useState('');
  const [status, setStatus] = useState<'idle' | 'fetching' | 'comparing' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchTranscript = async (videoId: string): Promise<{ segments: { text: string; offset: number }[]; title?: string }> => {
    const resp = await fetch(`/api/transcript?videoId=${videoId}`);
    if (!resp.ok) throw new Error(`Failed to fetch transcript for ${videoId}`);
    return resp.json();
  };

  const handleCompare = useCallback(async () => {
    const id1 = extractVideoId(url1);
    const id2 = extractVideoId(url2);
    if (!id1 || !id2) {
      setErrorMsg('Please enter two valid YouTube URLs');
      return;
    }
    if (id1 === id2) {
      setErrorMsg('Please enter two different videos');
      return;
    }

    setStatus('fetching');
    setResult('');
    setErrorMsg('');

    try {
      // Fetch both transcripts
      const [t1, t2] = await Promise.all([fetchTranscript(id1), fetchTranscript(id2)]);

      if (t1.title) setTitle1(t1.title);
      if (t2.title) setTitle2(t2.title);

      const text1 = t1.segments.map((s) => s.text).join(' ');
      const text2 = t2.segments.map((s) => s.text).join(' ');

      if (!text1 || !text2) {
        setErrorMsg('Could not get transcripts for both videos');
        setStatus('error');
        return;
      }

      setStatus('comparing');

      // Stream comparison
      const resp = await fetch('/api/compare-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript1: text1.slice(0, 4000),
          transcript2: text2.slice(0, 4000),
          title1: t1.title || id1,
          title2: t2.title || id2,
        }),
      });

      if (!resp.ok) throw new Error('Comparison failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setResult(full);
      }

      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setStatus('error');
    }
  }, [url1, url2]);

  return (
    <div className="min-h-screen bg-chalk-bg text-chalk-text">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <h1 className="text-lg font-medium text-chalk-text">Compare Videos</h1>
        </div>

        {/* Input form */}
        <div className="space-y-4 mb-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Video 1</label>
              <input
                type="text"
                value={url1}
                onChange={(e) => setUrl1(e.target.value)}
                placeholder="Paste YouTube URL..."
                className="w-full px-4 py-2.5 rounded-xl bg-chalk-surface/50 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-chalk-accent/30 focus:border-chalk-accent/50"
                disabled={status === 'fetching' || status === 'comparing'}
              />
              {title1 && <p className="text-[11px] text-slate-500 truncate">{title1}</p>}
            </div>
            <div className="hidden sm:flex items-center pt-5 text-slate-600 text-sm font-medium">vs</div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">Video 2</label>
              <input
                type="text"
                value={url2}
                onChange={(e) => setUrl2(e.target.value)}
                placeholder="Paste YouTube URL..."
                className="w-full px-4 py-2.5 rounded-xl bg-chalk-surface/50 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-chalk-accent/30 focus:border-chalk-accent/50"
                disabled={status === 'fetching' || status === 'comparing'}
              />
              {title2 && <p className="text-[11px] text-slate-500 truncate">{title2}</p>}
            </div>
          </div>

          <button
            onClick={handleCompare}
            disabled={!url1.trim() || !url2.trim() || status === 'fetching' || status === 'comparing'}
            className="w-full px-6 py-3 rounded-xl text-sm font-medium bg-chalk-accent text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {status === 'fetching' ? 'Fetching transcripts...' : status === 'comparing' ? 'Comparing videos...' : 'Compare Videos'}
          </button>

          {errorMsg && (
            <p className="text-xs text-red-400 text-center">{errorMsg}</p>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="bg-chalk-surface/30 border border-chalk-border/30 rounded-2xl p-6 space-y-3">
            <div className="prose prose-invert prose-sm max-w-none">
              {result.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h2 key={i} className="text-base font-semibold text-chalk-text mt-6 mb-2 first:mt-0">{line.slice(3)}</h2>;
                }
                if (line.startsWith('- ')) {
                  return (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="text-chalk-accent mt-1 shrink-0">&#8226;</span>
                      <span className="text-sm text-slate-300 leading-relaxed">{renderBold(line.slice(2))}</span>
                    </div>
                  );
                }
                if (line.trim() === '') return <div key={i} className="h-2" />;
                return <p key={i} className="text-sm text-slate-400 leading-relaxed">{renderBold(line)}</p>;
              })}
            </div>

            {status === 'comparing' && (
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-3 h-3 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
                <span className="text-xs animate-pulse">Analyzing...</span>
              </div>
            )}
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-chalk-text font-medium">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
