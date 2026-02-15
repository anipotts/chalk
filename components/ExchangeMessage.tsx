'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { TimestampLink } from './TimestampLink';
import { parseTimestampLinks } from '@/lib/video-utils';
import { ClipboardText, CheckCircle, SpeakerSimpleHigh, SpeakerSimpleLow } from '@phosphor-icons/react';
import { ToolResultRenderer, CompactToolStrip, isDrawerTool, parseStreamToSegments, type ToolCallData } from './ToolRenderers';
import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import 'highlight.js/styles/github-dark.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);

export interface UnifiedExchange {
  id: string;
  type: 'text' | 'voice';
  mode: 'chat' | 'explore';
  userText: string;
  aiText: string;
  timestamp: number;
  model?: string;
  toolCalls?: ToolCallData[];
  rawAiText?: string;
  thinking?: string;
  thinkingDuration?: number;
  explorePills?: string[];
}

interface ExchangeMessageProps {
  exchange: UnifiedExchange;
  onSeek: (seconds: number) => void;
  videoId: string;
  onPlayMessage?: (id: string, text: string) => void;
  isPlaying?: boolean;
  isReadAloudLoading?: boolean;
  onOpenVideo?: (videoId: string, title: string, channelName: string, seekTo?: number) => void;
  skipEntrance?: boolean;
  suppressDrawerTools?: boolean;
}

/**
 * Render inline LaTeX ($...$) to a React element.
 */
function renderInlineLatex(expr: string, key: string): React.ReactNode {
  try {
    const html = katex.renderToString(expr, {
      displayMode: false,
      throwOnError: false,
      trust: true,
    });
    return (
      <span
        key={key}
        className="inline-block align-middle mx-0.5"
        style={{ color: '#e2e8f0' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <span key={key} className="text-rose-400">${expr}$</span>;
  }
}

/**
 * Render a display LaTeX block ($$...$$).
 */
function renderDisplayLatex(expr: string, key: string): React.ReactNode {
  try {
    const html = katex.renderToString(expr, {
      displayMode: true,
      throwOnError: false,
      trust: true,
    });
    return (
      <div
        key={key}
        className="my-2 flex justify-center overflow-x-auto"
        style={{ color: '#e2e8f0' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <div key={key} className="text-rose-400 my-2 text-center">{`$$${expr}$$`}</div>;
  }
}

/**
 * Render a fenced code block with syntax highlighting.
 */
function renderCodeBlock(lang: string, code: string, key: string): React.ReactNode {
  let highlighted: string;
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(code, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }
  } catch {
    highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return (
    <div key={key} className="my-2 rounded-lg overflow-hidden border border-white/[0.08]">
      {lang && (
        <div className="px-3 py-1 text-xs font-mono text-slate-500 bg-white/[0.03] border-b border-white/[0.06]">
          {lang}
        </div>
      )}
      <pre className="p-3 overflow-x-auto bg-white/[0.04]">
        <code
          className="hljs text-[13px] font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

/**
 * Apply inline formatting: **bold**, *italic*, _italic_, `code`, $LaTeX$, [text](url)
 */
function applyInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match: **bold**, *italic*, _italic_, `code`, $latex$, [text](url)
  // Order matters: ** before * to avoid conflict
  const regex = /(\*\*(.+?)\*\*|\*(?!\*)(.+?)(?<!\*)\*|_([^_\s][^_]*?[^_\s])_|`([^`]+)`|\$([^$]+?)\$|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-semibold text-chalk-text">{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={`${keyPrefix}-i-${match.index}`} className="italic text-slate-300">{match[3]}</em>);
    } else if (match[4]) {
      // _italic_
      parts.push(<em key={`${keyPrefix}-u-${match.index}`} className="italic text-slate-300">{match[4]}</em>);
    } else if (match[5]) {
      // `code`
      parts.push(<code key={`${keyPrefix}-c-${match.index}`} className="px-1 py-0.5 rounded bg-white/[0.06] text-[13px] font-mono text-slate-200">{match[5]}</code>);
    } else if (match[6]) {
      // $latex$
      parts.push(renderInlineLatex(match[6], `${keyPrefix}-l-${match.index}`));
    } else if (match[7] && match[8]) {
      // [text](url)
      parts.push(
        <a
          key={`${keyPrefix}-a-${match.index}`}
          href={match[8]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-chalk-accent hover:text-blue-400 hover:underline transition-colors"
        >
          {match[7]}
        </a>
      );
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts;
}

/**
 * Renders a text segment with both timestamp links and inline formatting.
 */
function renderInlineContent(text: string, onSeek: (seconds: number) => void, keyPrefix: string, videoId: string): React.ReactNode[] {
  // Strip bold markers wrapping timestamps (e.g. **[5:32]** → [5:32])
  text = text.replace(/\*\*(\[\d{1,2}:\d{2}(?::\d{2})?\])\*\*/g, '$1');
  const timestamps = parseTimestampLinks(text);
  if (timestamps.length === 0) {
    return applyInlineFormatting(text, keyPrefix);
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const ts of timestamps) {
    if (ts.index > lastIndex) {
      parts.push(...applyInlineFormatting(text.slice(lastIndex, ts.index), `${keyPrefix}-${ts.index}`));
    }
    const display = ts.match.slice(1, -1);
    parts.push(
      <TimestampLink
        key={`ts-${keyPrefix}-${ts.index}`}
        timestamp={display}
        seconds={ts.seconds}
        onSeek={onSeek}
        videoId={videoId}
      />
    );
    lastIndex = ts.index + ts.match.length;
  }

  if (lastIndex < text.length) {
    parts.push(...applyInlineFormatting(text.slice(lastIndex), `${keyPrefix}-end`));
  }

  return parts;
}

/**
 * Renders content with markdown-like formatting:
 * - Fenced code blocks with syntax highlighting
 * - Display LaTeX ($$...$$)
 * - **bold**, *italic*, _italic_ text
 * - `inline code`
 * - [text](url) links
 * - Bullet lists (- item or * item)
 * - Numbered lists (1. item)
 * - [M:SS] timestamp citations as clickable pills
 *
 * Parsing order: code blocks → display latex → line-by-line → inline formatting
 */
export function renderRichContent(content: string, onSeek?: (seconds: number) => void, videoId?: string): React.ReactNode {
  const seekFn = onSeek ?? (() => {});
  const vid = videoId ?? '';

  // Phase 1: Extract fenced code blocks and replace with placeholders
  const codeBlocks: Array<{ lang: string; code: string }> = [];
  let processed = content.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.replace(/\n$/, '') });
    return `\n__CODE_BLOCK_${idx}__\n`;
  });

  // Phase 2: Extract display LaTeX ($$...$$) and replace with placeholders
  const displayLatexBlocks: string[] = [];
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const idx = displayLatexBlocks.length;
    displayLatexBlocks.push(expr.trim());
    return `\n__DISPLAY_LATEX_${idx}__\n`;
  });

  // Phase 3: Line-by-line parsing
  const lines = processed.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let blockIdx = 0;

  function flushList() {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      const items = currentList.items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-[0.45em] w-1.5 h-1.5 rounded-full bg-chalk-accent flex-shrink-0" />
          <span className="text-slate-300">{renderInlineContent(item, seekFn, `li-${blockIdx}-${i}`, vid)}</span>
        </li>
      ));
      blocks.push(<ul key={`bl-${blockIdx++}`} className="space-y-1 my-1.5 ml-4">{items}</ul>);
    } else {
      const items = currentList.items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-chalk-accent text-sm font-medium flex-shrink-0 w-5 text-right">{i + 1}.</span>
          <span className="text-slate-300">{renderInlineContent(item, seekFn, `li-${blockIdx}-${i}`, vid)}</span>
        </li>
      ));
      blocks.push(<ol key={`bl-${blockIdx++}`} className="space-y-1 my-1.5 ml-4">{items}</ol>);
    }
    currentList = null;
  }

  for (const line of lines) {
    // Check for code block placeholder
    const codeMatch = line.match(/^\s*__CODE_BLOCK_(\d+)__\s*$/);
    if (codeMatch) {
      flushList();
      const idx = parseInt(codeMatch[1]);
      const block = codeBlocks[idx];
      if (block) {
        blocks.push(renderCodeBlock(block.lang, block.code, `cb-${blockIdx++}`));
      }
      continue;
    }

    // Check for display LaTeX placeholder
    const latexMatch = line.match(/^\s*__DISPLAY_LATEX_(\d+)__\s*$/);
    if (latexMatch) {
      flushList();
      const idx = parseInt(latexMatch[1]);
      const expr = displayLatexBlocks[idx];
      if (expr) {
        blocks.push(renderDisplayLatex(expr, `dl-${blockIdx++}`));
      }
      continue;
    }

    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    const numberMatch = line.match(/^[\s]*\d+[.)]\s+(.+)/);

    if (bulletMatch) {
      if (currentList?.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList!.items.push(bulletMatch[1]);
    } else if (numberMatch) {
      if (currentList?.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList!.items.push(numberMatch[1]);
    } else {
      flushList();
      if (line.trim()) {
        blocks.push(
          <span key={`bl-${blockIdx++}`}>
            {renderInlineContent(line, seekFn, `p-${blockIdx}`, vid)}
            {'\n'}
          </span>
        );
      } else {
        // Empty line → visual paragraph break spacer
        blocks.push(<div key={`bl-${blockIdx++}`} className="h-3.5" />);
      }
    }
  }

  flushList();
  return blocks;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="opacity-30 group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]"
      aria-label={copied ? 'Copied!' : 'Copy response'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <CheckCircle size={12} weight="fill" className="text-emerald-400" />
      ) : (
        <ClipboardText size={12} weight="bold" />
      )}
    </button>
  );
}

function SpeakerButton({ exchange, onPlay, isPlaying, isLoading }: { exchange: UnifiedExchange; onPlay: (id: string, text: string) => void; isPlaying: boolean; isLoading: boolean }) {
  return (
    <button
      onClick={() => onPlay(exchange.id, exchange.aiText)}
      className={`group-hover:opacity-100 focus:opacity-100 transition-opacity p-2 rounded-md hover:bg-white/[0.06] ${
        isPlaying ? 'opacity-100 text-emerald-400' : isLoading ? 'opacity-100 text-chalk-accent' : 'opacity-30 text-slate-500 hover:text-slate-300'
      }`}
      aria-label={isPlaying ? 'Playing...' : 'Read aloud'}
      title={isPlaying ? 'Playing...' : 'Read aloud'}
    >
      {isLoading ? (
        <div className="w-3 h-3 border border-chalk-accent/50 border-t-chalk-accent rounded-full animate-spin" />
      ) : isPlaying ? (
        <SpeakerSimpleHigh size={12} weight="fill" />
      ) : (
        <SpeakerSimpleLow size={12} weight="bold" />
      )}
    </button>
  );
}

export function ExchangeMessage({ exchange, onSeek, videoId, onPlayMessage, isPlaying, isReadAloudLoading, onOpenVideo, skipEntrance, suppressDrawerTools }: ExchangeMessageProps) {

  return (
    <div className="space-y-3">
      {/* User message - right aligned with max width */}
      <motion.div
        initial={skipEntrance ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end w-full"
      >
        <div className="max-w-[85%] px-3.5 py-2 rounded-lg bg-white/[0.10] border border-white/[0.12] text-white text-sm leading-relaxed break-words">
          {exchange.userText}
        </div>
      </motion.div>

      {/* AI message - left aligned, full width */}
      <motion.div
        initial={skipEntrance ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={skipEntrance ? { duration: 0.2 } : { duration: 0.2, delay: 0.1 }}
        className="flex justify-start group w-full"
      >
        <div className="max-w-[90%]">
          {/* Talking duration */}
          {exchange.thinkingDuration != null && (
            <div className="flex items-center gap-1.5 py-1.5 mb-1">
              <span className="text-xs text-slate-400 font-mono">
                talked for {(exchange.thinkingDuration / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Message content with interleaved tool cards */}
          <div className="text-[15px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
            {exchange.rawAiText ? (
              // Segment-based rendering: tool cards at their natural position
              (() => {
                const segments = parseStreamToSegments(exchange.rawAiText!);
                const drawerTools = segments
                  .filter((s): s is { type: 'tool'; toolCall: ToolCallData } =>
                    s.type === 'tool' && isDrawerTool(s.toolCall))
                  .map(s => s.toolCall);

                return (
                  <>
                    {segments.map((seg, i) => {
                      if (seg.type === 'text') {
                        if (!seg.content.trim()) return null;
                        return <span key={`seg-${exchange.id}-${i}`}>{renderRichContent(seg.content, onSeek, videoId)}</span>;
                      }
                      // cite_moment: always inline
                      if (seg.toolCall.result.type === 'cite_moment') {
                        return (
                          <ToolResultRenderer
                            key={`tool-${exchange.id}-${i}`}
                            toolCall={seg.toolCall}
                            onSeek={onSeek}
                            onOpenVideo={onOpenVideo}
                          />
                        );
                      }
                      // Drawer tools: skip if suppressed (shown in drawer), otherwise skip (shown in compact strip below)
                      if (isDrawerTool(seg.toolCall)) return null;
                      // Non-drawer, non-cite tools: render inline
                      return (
                        <div key={`tool-${exchange.id}-${i}`} className="my-2">
                          <ToolResultRenderer
                            toolCall={seg.toolCall}
                            onSeek={onSeek}
                            onOpenVideo={onOpenVideo}
                          />
                        </div>
                      );
                    })}
                    {/* Compact strip for historical drawer tools (not the active drawer exchange) */}
                    {!suppressDrawerTools && drawerTools.length > 0 && (
                      <CompactToolStrip toolCalls={drawerTools} onSeek={onSeek} onOpenVideo={onOpenVideo} />
                    )}
                  </>
                );
              })()
            ) : (
              // Fallback: text then tool calls (backward compat for exchanges without rawAiText)
              (() => {
                const allTools = exchange.toolCalls || [];
                const drawerTools = allTools.filter(tc => isDrawerTool(tc));
                const otherTools = allTools.filter(tc => !isDrawerTool(tc) && tc.result.type !== 'cite_moment');
                const citeTools = allTools.filter(tc => tc.result.type === 'cite_moment');

                return (
                  <>
                    {renderRichContent(exchange.aiText, onSeek, videoId)}
                    {citeTools.map((tc, i) => (
                      <ToolResultRenderer
                        key={`cite-${exchange.id}-${i}`}
                        toolCall={tc}
                        onSeek={onSeek}
                        onOpenVideo={onOpenVideo}
                      />
                    ))}
                    {otherTools.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {otherTools.map((tc, i) => (
                          <ToolResultRenderer
                            key={`tool-${exchange.id}-${i}`}
                            toolCall={tc}
                            onSeek={onSeek}
                            onOpenVideo={onOpenVideo}
                          />
                        ))}
                      </div>
                    )}
                    {!suppressDrawerTools && drawerTools.length > 0 && (
                      <CompactToolStrip toolCalls={drawerTools} onSeek={onSeek} onOpenVideo={onOpenVideo} />
                    )}
                  </>
                );
              })()
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-1 flex items-center gap-0.5">
            <CopyButton text={exchange.aiText} />
            {onPlayMessage && (
              <SpeakerButton
                exchange={exchange}
                onPlay={onPlayMessage}
                isPlaying={!!isPlaying}
                isLoading={!!isReadAloudLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
