'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatTimestamp, type TranscriptSegment } from '@/lib/video-utils';

interface MindMapNode {
  id: string;
  label: string;
  timestamp?: number;
  level: number;
  parent?: string;
}

interface MindMapConnection {
  from: string;
  to: string;
  label?: string;
}

interface MindMapData {
  central: { label: string; timestamp?: number };
  nodes: MindMapNode[];
  connections?: MindMapConnection[];
}

interface MindMapButtonProps {
  videoId: string;
  videoTitle?: string;
  segments: TranscriptSegment[];
  onSeek: (seconds: number) => void;
}

// Simple radial layout
function layoutNodes(data: MindMapData, width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const positions = new Map<string, { x: number; y: number }>();

  // Central node
  positions.set('central', { x: cx, y: cy });

  // Level 1 nodes in a circle
  const level1 = data.nodes.filter((n) => n.level === 1);
  const radius1 = Math.min(width, height) * 0.32;
  level1.forEach((node, i) => {
    const angle = (i / level1.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(node.id, {
      x: cx + Math.cos(angle) * radius1,
      y: cy + Math.sin(angle) * radius1,
    });
  });

  // Level 2 nodes around their parent
  const level2 = data.nodes.filter((n) => n.level === 2 && n.parent);
  const parentGroups = new Map<string, MindMapNode[]>();
  for (const node of level2) {
    const group = parentGroups.get(node.parent!) || [];
    group.push(node);
    parentGroups.set(node.parent!, group);
  }

  const radius2 = Math.min(width, height) * 0.15;
  for (const [parentId, children] of parentGroups) {
    const parentPos = positions.get(parentId);
    if (!parentPos) continue;
    // Direction from center to parent
    const dx = parentPos.x - cx;
    const dy = parentPos.y - cy;
    const baseAngle = Math.atan2(dy, dx);

    children.forEach((node, i) => {
      const spread = Math.PI * 0.5;
      const startAngle = baseAngle - spread / 2;
      const angle = startAngle + (i / Math.max(1, children.length - 1)) * spread;
      positions.set(node.id, {
        x: parentPos.x + Math.cos(angle) * radius2,
        y: parentPos.y + Math.sin(angle) * radius2,
      });
    });
  }

  return positions;
}

const LEVEL_COLORS = [
  { bg: 'fill-chalk-accent', text: 'fill-white', stroke: 'stroke-chalk-accent' },
  { bg: 'fill-purple-500', text: 'fill-white', stroke: 'stroke-purple-500' },
  { bg: 'fill-emerald-500/80', text: 'fill-white', stroke: 'stroke-emerald-500' },
];

export function MindMapButton({ videoId, videoTitle, segments, onSeek }: MindMapButtonProps) {
  const [state, setState] = useState<'idle' | 'generating' | 'open'>('idle');
  const [data, setData] = useState<MindMapData | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setState('generating');
    try {
      const resp = await fetch('/api/generate-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments, videoTitle }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { mindmap } = await resp.json();
      if (mindmap) {
        setData(mindmap);
        setState('open');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }, [segments, videoTitle]);

  const width = 700;
  const height = 500;
  const positions = useMemo(() => data ? layoutNodes(data, width, height) : new Map(), [data]);

  return (
    <>
      <button
        onClick={() => {
          if (state === 'idle') generate();
          else if (state === 'open') setState('idle');
          else if (data) setState('open');
        }}
        disabled={state === 'generating' || segments.length === 0}
        className={`w-7 h-7 rounded-lg text-xs flex items-center justify-center transition-colors ${
          state === 'open'
            ? 'bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30'
            : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 disabled:opacity-30'
        }`}
        aria-label="Mind map"
        title="Generate mind map from video"
      >
        {state === 'generating' ? (
          <div className="w-3 h-3 border-2 border-slate-500/40 border-t-slate-400 rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
          </svg>
        )}
      </button>

      <AnimatePresence>
        {state === 'open' && data && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setState('idle')}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl bg-chalk-surface border border-chalk-border/40 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-chalk-border/30">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-chalk-accent">
                    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    <path d="M12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
                  </svg>
                  <span className="text-sm font-medium text-chalk-text">Mind Map</span>
                  {videoTitle && <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{videoTitle}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={generate}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                    title="Regenerate"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.025-.273Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setState('idle')}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* SVG Mind Map */}
              <div className="p-4 overflow-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-h-[60vh]" style={{ minHeight: 300 }}>
                  {/* Connections between nodes */}
                  {data.connections?.map((conn, i) => {
                    const from = positions.get(conn.from);
                    const to = positions.get(conn.to);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={`conn-${i}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="rgba(148,163,184,0.15)"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {/* Parent-child lines */}
                  {data.nodes.filter((n) => n.level === 2 && n.parent).map((node) => {
                    const childPos = positions.get(node.id);
                    const parentPos = positions.get(node.parent!);
                    if (!childPos || !parentPos) return null;
                    return (
                      <line
                        key={`edge-${node.id}`}
                        x1={parentPos.x}
                        y1={parentPos.y}
                        x2={childPos.x}
                        y2={childPos.y}
                        stroke="rgba(148,163,184,0.2)"
                        strokeWidth={1.5}
                      />
                    );
                  })}

                  {/* Lines from central to level 1 */}
                  {data.nodes.filter((n) => n.level === 1).map((node) => {
                    const pos = positions.get(node.id);
                    const centralPos = positions.get('central');
                    if (!pos || !centralPos) return null;
                    return (
                      <line
                        key={`edge-central-${node.id}`}
                        x1={centralPos.x}
                        y1={centralPos.y}
                        x2={pos.x}
                        y2={pos.y}
                        stroke="rgba(59,130,246,0.25)"
                        strokeWidth={2}
                      />
                    );
                  })}

                  {/* Central node */}
                  {(() => {
                    const pos = positions.get('central');
                    if (!pos) return null;
                    const isHovered = hoveredNode === 'central';
                    return (
                      <g
                        className="cursor-pointer"
                        onClick={() => data.central.timestamp !== undefined && onSeek(data.central.timestamp)}
                        onMouseEnter={() => setHoveredNode('central')}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={isHovered ? 38 : 34}
                          className="fill-chalk-accent transition-all duration-200"
                          opacity={isHovered ? 1 : 0.9}
                        />
                        <text
                          x={pos.x}
                          y={pos.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="fill-white text-[11px] font-semibold pointer-events-none"
                        >
                          {truncateLabel(data.central.label, 18)}
                        </text>
                        {isHovered && data.central.timestamp !== undefined && (
                          <text
                            x={pos.x}
                            y={pos.y + 18}
                            textAnchor="middle"
                            className="fill-white/70 text-[9px] pointer-events-none"
                          >
                            [{formatTimestamp(data.central.timestamp)}]
                          </text>
                        )}
                      </g>
                    );
                  })()}

                  {/* All other nodes */}
                  {data.nodes.map((node) => {
                    const pos = positions.get(node.id);
                    if (!pos) return null;
                    const isHovered = hoveredNode === node.id;
                    const colors = LEVEL_COLORS[node.level] || LEVEL_COLORS[1];
                    const nodeRadius = node.level === 1 ? (isHovered ? 28 : 24) : (isHovered ? 20 : 16);

                    return (
                      <g
                        key={node.id}
                        className="cursor-pointer"
                        onClick={() => node.timestamp !== undefined && onSeek(node.timestamp)}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={nodeRadius}
                          className={`${colors.bg} transition-all duration-200`}
                          opacity={isHovered ? 1 : 0.8}
                        />
                        <text
                          x={pos.x}
                          y={pos.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className={`${colors.text} pointer-events-none font-medium`}
                          fontSize={node.level === 1 ? 9 : 7.5}
                        >
                          {truncateLabel(node.label, node.level === 1 ? 14 : 10)}
                        </text>
                        {isHovered && node.timestamp !== undefined && (
                          <text
                            x={pos.x}
                            y={pos.y + (node.level === 1 ? 14 : 10)}
                            textAnchor="middle"
                            className="fill-white/60 pointer-events-none"
                            fontSize={8}
                          >
                            [{formatTimestamp(node.timestamp)}]
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div className="px-5 py-2 border-t border-chalk-border/30 flex items-center gap-4">
                <span className="text-[10px] text-slate-500">Click nodes to jump to that moment</span>
                <div className="flex items-center gap-3 ml-auto">
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-chalk-accent" />
                    <span className="text-[10px] text-slate-500">Central</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <span className="text-[10px] text-slate-500">Subtopic</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-slate-500">Detail</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}
