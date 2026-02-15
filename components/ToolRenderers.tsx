'use client';

import { useState } from 'react';
import { formatTimestamp } from '@/lib/video-utils';
import { ArrowSquareOut } from '@phosphor-icons/react';

// Tool result types matching the server-side tool outputs

export interface CiteMomentResult {
  type: 'cite_moment';
  timestamp: string;
  timestamp_seconds: number;
  label: string;
  context: string;
  transcript_line: string;
  video_id: string;
}

export interface ReferenceVideoResult {
  type: 'reference_video';
  video_id: string;
  timestamp_seconds: number | null;
  video_title: string;
  channel_name: string;
  reason: string;
  thumbnail_url: string;
  caption_excerpt: string | null;
  relationship?: string;
  shared_concepts?: string[];
}

export interface SearchResult {
  type: 'search_results';
  query: string;
  results: Array<{
    kind: string;
    video_id: string;
    title: string;
    channel_name: string | null;
    mention_type?: string;
  }>;
  message?: string;
}

export interface PrerequisiteChainResult {
  type: 'prerequisite_chain';
  concept_id: string;
  chain: Array<{
    concept_id: string;
    display_name: string;
    depth: number;
    best_video_id: string | null;
    best_video_title: string | null;
  }>;
  message?: string;
}

export interface QuizResult {
  type: 'quiz';
  questions: Array<{
    question: string;
    question_type: string;
    correct_answer: string;
    distractors: string[];
    explanation: string;
    difficulty: string;
    bloom_level: string | null;
    concept: string | null;
    timestamp_seconds: number | null;
  }>;
  message?: string;
}

export interface ChapterContextResult {
  type: 'chapter_context';
  chapter: {
    title: string;
    start_seconds: number;
    end_seconds: number | null;
    summary: string | null;
    concepts: string[];
  } | null;
  moments: Array<{
    moment_type: string;
    timestamp_seconds: number;
    content: string;
  }>;
  message?: string;
}

export interface AlternativeExplanationsResult {
  type: 'alternative_explanations';
  concept: string;
  alternatives: Array<{
    video_id: string;
    video_title: string;
    channel_name: string | null;
    pedagogical_approach: string | null;
    timestamp_seconds: number;
    context_snippet: string;
  }>;
  message?: string;
}

export interface LearningPathResult {
  type: 'learning_path';
  from_concept: string;
  to_concept: string;
  steps: Array<{
    step: number;
    concept_id: string;
    display_name: string;
    best_video_id: string | null;
    best_video_title: string | null;
  }>;
  message?: string;
}

export type ToolResult =
  | CiteMomentResult
  | ReferenceVideoResult
  | SearchResult
  | PrerequisiteChainResult
  | QuizResult
  | ChapterContextResult
  | AlternativeExplanationsResult
  | LearningPathResult;

export interface ToolCallData {
  toolName: string;
  result: ToolResult;
}

// === UI Components ===

const relationshipLabels: Record<string, string> = {
  prerequisite: 'Prerequisite',
  follow_up: 'Follow-up',
  related: 'Related',
  deeper_dive: 'Deeper Dive',
  alternative_explanation: 'Alt. Explanation',
  builds_on: 'Builds On',
  contrasts: 'Contrasts',
};

function getRelationshipLabel(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes('prerequisite')) return 'Prerequisite';
  if (lower.includes('follow-up') || lower.includes('followup') || lower.includes('follow up')) return 'Follow-up';
  if (lower.includes('deep dive') || lower.includes('deeper')) return 'Deep Dive';
  if (lower.includes('alternative')) return 'Alternative';
  if (lower.includes('supplement') || lower.includes('complementary')) return 'Supplement';
  return 'Related';
}

const approachLabels: Record<string, string> = {
  visual_geometric: 'Visual',
  algebraic_symbolic: 'Algebraic',
  intuitive_analogy: 'Analogy',
  formal_proof: 'Proof',
  code_implementation: 'Code',
  worked_example: 'Example',
  historical_narrative: 'History',
  comparative: 'Comparison',
  socratic: 'Socratic',
};

/**
 * Inline citation pill for a specific video moment.
 */
export function CiteMomentCard({
  result,
  onSeek,
}: {
  result: CiteMomentResult;
  onSeek: (seconds: number) => void;
}) {
  return (
    <button
      onClick={() => onSeek(result.timestamp_seconds)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] hover:border-white/[0.12] text-slate-300 transition-all duration-150 cursor-pointer"
      title={result.context}
    >
      <span className="font-mono text-xs">[{result.timestamp}]</span>
      <span className="text-xs text-slate-300">{result.label}</span>
    </button>
  );
}

/**
 * Card showing a referenced video with thumbnail, title, channel, and reason.
 */
export function ReferenceVideoCard({
  result,
  onOpenVideo,
}: {
  result: ReferenceVideoResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const handleClick = () => {
    if (onOpenVideo) {
      onOpenVideo(result.video_id, result.video_title, result.channel_name, result.timestamp_seconds ?? undefined);
    }
  };

  const handleNewTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = result.timestamp_seconds
      ? `/watch?v=${result.video_id}&t=${Math.floor(result.timestamp_seconds)}`
      : `/watch?v=${result.video_id}`;
    window.open(url, '_blank');
  };

  const badge = result.relationship
    ? (relationshipLabels[result.relationship] || result.relationship)
    : getRelationshipLabel(result.reason);

  return (
    <div
      onClick={handleClick}
      className="flex gap-3 p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.10] cursor-pointer transition-all duration-150 group my-2"
    >
      <div className="flex-shrink-0 w-28 h-16 rounded-md overflow-hidden bg-chalk-border relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.thumbnail_url}
          alt={result.video_title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {result.timestamp_seconds !== null && (
          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[10px] px-1 rounded font-mono">
            {formatTimestamp(result.timestamp_seconds)}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 line-clamp-2">{result.video_title}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-400">{result.channel_name}</span>
          <span className="text-slate-600">&middot;</span>
          <span className="text-[11px] text-slate-500">{badge}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1 line-clamp-2">{result.reason}</div>
        {result.shared_concepts && result.shared_concepts.length > 0 && (
          <div className="text-[11px] text-slate-500 mt-1">
            {result.shared_concepts.slice(0, 5).join(', ')}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <button
          onClick={handleNewTab}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all duration-150"
          title="Open in new tab"
        >
          <ArrowSquareOut size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Prerequisite chain visualization — shows concepts to learn first.
 */
export function PrerequisiteChainCard({
  result,
  onOpenVideo,
}: {
  result: PrerequisiteChainResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.chain.length === 0) {
    return null;
  }

  // Group by depth
  const byDepth = new Map<number, typeof result.chain>();
  for (const item of result.chain) {
    if (!byDepth.has(item.depth)) byDepth.set(item.depth, []);
    byDepth.get(item.depth)!.push(item);
  }

  const sortedDepths = [...byDepth.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] my-2">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-mono mb-2">
        Prerequisites
      </div>
      <div className="space-y-1.5">
        {sortedDepths.map(([depth, items]) => (
          <div key={depth} className="flex flex-wrap gap-1.5" style={{ marginLeft: `${(depth - 1) * 16}px` }}>
            {items.map((item) => (
              <button
                key={item.concept_id}
                onClick={() => {
                  if (item.best_video_id && onOpenVideo) {
                    onOpenVideo(item.best_video_id, item.best_video_title || item.display_name, '', undefined);
                  }
                }}
                className={`px-2 py-0.5 rounded text-xs transition-all duration-150 ${
                  item.best_video_id
                    ? 'bg-white/[0.04] border border-white/[0.06] text-chalk-accent hover:bg-white/[0.08] cursor-pointer'
                    : 'bg-white/[0.04] border border-white/[0.06] text-slate-300'
                }`}
                title={item.best_video_title ? `Watch: ${item.best_video_title}` : item.display_name}
              >
                {item.display_name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Interactive quiz card with reveal-on-click answers.
 */
export function QuizCard({
  result,
  onSeek,
}: {
  result: QuizResult;
  onSeek: (seconds: number) => void;
}) {
  if (result.message || result.questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 my-2">
      {result.questions.map((q, i) => (
        <QuizQuestion key={i} question={q} onSeek={onSeek} />
      ))}
    </div>
  );
}

function QuizQuestion({
  question: q,
  onSeek,
}: {
  question: QuizResult['questions'][0];
  onSeek: (seconds: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const isAnswered = selected !== null;
  const isCorrect = selected === q.correct_answer;

  // Build shuffled options (correct + distractors)
  const options = useState(() => {
    const all = [q.correct_answer, ...(q.distractors || [])];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  })[0];

  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-slate-500 uppercase tracking-wider font-mono">Quiz</span>
        <span className="text-[11px] text-slate-500">({q.difficulty})</span>
        {q.timestamp_seconds !== null && (
          <button
            onClick={() => onSeek(q.timestamp_seconds!)}
            className="text-[11px] text-chalk-accent hover:underline font-mono ml-auto"
          >
            [{formatTimestamp(q.timestamp_seconds!)}]
          </button>
        )}
      </div>
      <div className="text-sm text-slate-200 mb-3">{q.question}</div>
      <div className="space-y-1.5">
        {options.map((opt, i) => {
          const isThis = selected === opt;
          const isCorrectOpt = opt === q.correct_answer;
          let optClass = 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] text-slate-300';
          if (isAnswered) {
            if (isCorrectOpt) {
              optClass = 'bg-chalk-accent/10 border-chalk-accent/30 text-slate-200';
            } else if (isThis && !isCorrectOpt) {
              optClass = 'bg-white/[0.02] border-red-500/20 text-slate-400';
            } else {
              optClass = 'bg-white/[0.02] border-white/[0.04] text-slate-500';
            }
          }
          return (
            <button
              key={i}
              onClick={() => !isAnswered && setSelected(opt)}
              disabled={isAnswered}
              className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-all duration-150 ${optClass} ${!isAnswered ? 'cursor-pointer' : ''}`}
            >
              <span className="font-mono text-[10px] text-slate-500 mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
      {isAnswered && (
        <div className="mt-2 text-xs text-slate-400">
          <span className={isCorrect ? 'text-chalk-accent' : 'text-slate-400'}>
            {isCorrect ? 'Correct.' : `Incorrect \u2014 answer: ${q.correct_answer}`}
          </span>
          {q.explanation && <div className="mt-1">{q.explanation}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * Chapter context card — shows current chapter info and nearby moments.
 */
export function ChapterContextCard({
  result,
  onSeek,
}: {
  result: ChapterContextResult;
  onSeek: (seconds: number) => void;
}) {
  if (!result.chapter && result.moments.length === 0) return null;

  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] my-2">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-mono mb-2">
        Chapter
      </div>
      {result.chapter && (
        <div className="mb-2">
          <button
            onClick={() => onSeek(result.chapter!.start_seconds)}
            className="text-sm font-medium text-slate-200 hover:text-chalk-accent transition-colors"
          >
            {result.chapter.title}
          </button>
          {result.chapter.summary && (
            <div className="text-xs text-slate-400 mt-1">{result.chapter.summary}</div>
          )}
        </div>
      )}
      {result.moments.length > 0 && (
        <div className="space-y-1 mt-2">
          {result.moments.map((m, i) => (
            <button
              key={i}
              onClick={() => onSeek(m.timestamp_seconds)}
              className="flex items-start gap-1.5 w-full text-left text-xs hover:bg-white/[0.04] rounded px-1 py-0.5 transition-colors"
            >
              <span className="text-chalk-accent font-mono flex-shrink-0">
                [{formatTimestamp(m.timestamp_seconds)}]
              </span>
              <span className="text-slate-300 line-clamp-1">{m.content}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Alternative explanations — shows different teaching approaches for a concept.
 */
export function AlternativeExplanationsCard({
  result,
  onOpenVideo,
}: {
  result: AlternativeExplanationsResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.alternatives.length === 0) return null;

  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] my-2">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-mono mb-2">
        Alternatives
      </div>
      <div className="space-y-1">
        {result.alternatives.slice(0, 4).map((alt, i) => (
          <button
            key={i}
            onClick={() => onOpenVideo?.(alt.video_id, alt.video_title, alt.channel_name || '', alt.timestamp_seconds)}
            className="flex items-center gap-2 w-full text-left hover:bg-white/[0.04] rounded-md p-1.5 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-200 line-clamp-1">{alt.video_title}</div>
              <div className="text-xs text-slate-400">
                {alt.channel_name || 'Unknown'}
                {alt.pedagogical_approach && (
                  <span className="text-slate-500"> &middot; {approachLabels[alt.pedagogical_approach] || alt.pedagogical_approach}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Learning path — shows step-by-step concept progression.
 */
export function LearningPathCard({
  result,
  onOpenVideo,
}: {
  result: LearningPathResult;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  if (result.message || result.steps.length === 0) return null;

  return (
    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] my-2">
      <div className="text-[11px] text-slate-500 uppercase tracking-wider font-mono mb-2">
        Learning Path
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {result.steps.map((step, i) => (
          <div key={step.concept_id} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-500 text-xs">&rsaquo;</span>}
            <button
              onClick={() => {
                if (step.best_video_id && onOpenVideo) {
                  onOpenVideo(step.best_video_id, step.best_video_title || step.display_name, '', undefined);
                }
              }}
              className={`text-xs transition-colors ${
                step.best_video_id
                  ? 'text-chalk-accent hover:underline cursor-pointer'
                  : 'text-slate-300'
              }`}
              title={step.best_video_title || step.display_name}
            >
              {step.display_name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Compact Tool Strip (for conversation history) ===

const DRAWER_TYPES = new Set([
  'reference_video', 'prerequisite_chain', 'quiz',
  'chapter_context', 'alternative_explanations', 'learning_path', 'search_results',
]);

export function isDrawerTool(tc: ToolCallData): boolean {
  return DRAWER_TYPES.has(tc.result.type);
}

/**
 * Compact strip of mini-cards for tool calls in conversation history.
 */
export function CompactToolStrip({
  toolCalls,
  onSeek,
  onOpenVideo,
}: {
  toolCalls: ToolCallData[];
  onSeek: (seconds: number) => void;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (toolCalls.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {toolCalls.map((tc, i) => {
          const r = tc.result;
          const isExpanded = expandedIndex === i;
          const baseClass = `px-2 py-1 rounded text-[11px] border transition-all duration-150 cursor-pointer ${
            isExpanded
              ? 'bg-white/[0.06] border-white/[0.10] text-slate-300'
              : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.05] hover:text-slate-300'
          }`;

          let label: string | null = null;

          if (r.type === 'reference_video') {
            label = r.video_title.length > 30 ? r.video_title.slice(0, 30) + '...' : r.video_title;
          } else if (r.type === 'quiz') {
            const count = r.questions?.length || 0;
            label = `${count} question${count !== 1 ? 's' : ''}`;
          } else if (r.type === 'prerequisite_chain') {
            label = `${r.chain.length} prerequisite${r.chain.length !== 1 ? 's' : ''}`;
          } else if (r.type === 'chapter_context') {
            label = r.chapter?.title || 'Chapter';
          } else if (r.type === 'alternative_explanations') {
            label = `${r.alternatives.length} alternative${r.alternatives.length !== 1 ? 's' : ''}`;
          } else if (r.type === 'learning_path') {
            const first = r.steps[0]?.display_name || '';
            const last = r.steps[r.steps.length - 1]?.display_name || '';
            label = `${first} \u203A ${last}`;
          } else if (r.type === 'search_results') {
            return null;
          }

          if (!label) return null;

          return (
            <button
              key={i}
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
              className={baseClass}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Expanded card */}
      {expandedIndex !== null && toolCalls[expandedIndex] && (
        <div className="animate-in slide-in-from-top-1 fade-in duration-200">
          <ToolResultRenderer
            toolCall={toolCalls[expandedIndex]}
            onSeek={onSeek}
            onOpenVideo={onOpenVideo}
          />
        </div>
      )}
    </div>
  );
}

// === Registry / Renderer ===

/**
 * Renders a tool result based on its type.
 */
export function ToolResultRenderer({
  toolCall,
  onSeek,
  onOpenVideo,
}: {
  toolCall: ToolCallData;
  onSeek: (seconds: number) => void;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
}) {
  const { result } = toolCall;

  switch (result.type) {
    case 'cite_moment':
      return <CiteMomentCard result={result} onSeek={onSeek} />;
    case 'reference_video':
      return <ReferenceVideoCard result={result} onOpenVideo={onOpenVideo} />;
    case 'prerequisite_chain':
      return <PrerequisiteChainCard result={result} onOpenVideo={onOpenVideo} />;
    case 'quiz':
      return <QuizCard result={result} onSeek={onSeek} />;
    case 'chapter_context':
      return <ChapterContextCard result={result} onSeek={onSeek} />;
    case 'alternative_explanations':
      return <AlternativeExplanationsCard result={result} onOpenVideo={onOpenVideo} />;
    case 'learning_path':
      return <LearningPathCard result={result} onOpenVideo={onOpenVideo} />;
    case 'search_results':
      if (result.results.length === 0 || result.message) {
        return <p className="text-xs text-slate-500 italic my-1">No related content found</p>;
      }
      return null;
    default:
      return null;
  }
}

/**
 * Parses a stream chunk to separate text and tool results.
 * Tool results are delimited by \x1D (group separator).
 */
export function parseStreamWithToolCalls(fullText: string): {
  text: string;
  toolCalls: ToolCallData[];
} {
  const toolCalls: ToolCallData[] = [];
  let cleanText = '';
  let remaining = fullText;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf('\x1D');
    if (startIdx === -1) {
      cleanText += remaining;
      break;
    }

    cleanText += remaining.slice(0, startIdx);

    const endIdx = remaining.indexOf('\x1D', startIdx + 1);
    if (endIdx === -1) {
      break;
    }

    const jsonStr = remaining.slice(startIdx + 1, endIdx);
    try {
      const parsed = JSON.parse(jsonStr) as ToolCallData;
      if (parsed.toolName && parsed.result) {
        toolCalls.push(parsed);
      }
    } catch {
      // Malformed JSON, skip
    }

    remaining = remaining.slice(endIdx + 1);
  }

  return { text: cleanText, toolCalls };
}

/**
 * A segment of a parsed stream — either text or a tool call result.
 */
export type StreamSegment =
  | { type: 'text'; content: string }
  | { type: 'tool'; toolCall: ToolCallData };

/**
 * Parses raw stream text into ordered segments of text and tool calls.
 */
export function parseStreamToSegments(rawText: string): StreamSegment[] {
  const segments: StreamSegment[] = [];
  let remaining = rawText;

  while (remaining.length > 0) {
    const startIdx = remaining.indexOf('\x1D');
    if (startIdx === -1) {
      if (remaining.length > 0) {
        segments.push({ type: 'text', content: remaining });
      }
      break;
    }

    if (startIdx > 0) {
      segments.push({ type: 'text', content: remaining.slice(0, startIdx) });
    }

    const endIdx = remaining.indexOf('\x1D', startIdx + 1);
    if (endIdx === -1) {
      break;
    }

    const jsonStr = remaining.slice(startIdx + 1, endIdx);
    try {
      const parsed = JSON.parse(jsonStr) as ToolCallData;
      if (parsed.toolName && parsed.result) {
        segments.push({ type: 'tool', toolCall: parsed });
      }
    } catch {
      // Malformed JSON, skip
    }

    remaining = remaining.slice(endIdx + 1);
  }

  return segments;
}
