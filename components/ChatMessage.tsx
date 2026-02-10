'use client';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { SafeVizWrapper } from './SafeVizWrapper';
import { VizContainer } from './VizContainer';
import { MafsPlot2D } from './MafsPlot2D';
import { LatexDisplay } from './LatexDisplay';
import { ReasoningPanel } from './ReasoningPanel';
import { ShareButton } from './ShareButton';
import type { ChalkSpec, Element } from '@/lib/schemas';

const ThreeDSurface = dynamic(() => import('./ThreeDSurface'), { ssr: false });

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  spec?: ChalkSpec | null;
  isStreaming?: boolean;
  isJsonPending?: boolean;
  thinking?: string;
  thinkingDuration?: number;
  prompt?: string;
}

const fadeSlideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

function renderElement(key: string, element: Element, spec: ChalkSpec): React.ReactNode {
  const children = element.children?.map((childKey) => {
    const child = spec.elements[childKey];
    if (!child) return null;
    return renderElement(childKey, child, spec);
  });

  switch (element.type) {
    case 'vizContainer':
      return (
        <motion.div key={key} {...fadeSlideUp}>
          <VizContainer
            title={element.props.title || ''}
            description={element.props.description}
            layout={element.props.layout}
          >
            {children}
          </VizContainer>
        </motion.div>
      );
    case 'plot2d':
      return (
        <motion.div key={key} {...fadeSlideUp}>
          <SafeVizWrapper>
            <MafsPlot2D {...element.props} />
          </SafeVizWrapper>
        </motion.div>
      );
    case 'plot3d':
      return (
        <motion.div key={key} {...fadeSlideUp}>
          <SafeVizWrapper>
            <ThreeDSurface
              expr={element.props.expr || 'x^2 + y^2'}
              xDomain={element.props.xDomain}
              yDomain={element.props.yDomain}
              colorLow={element.props.colorLow}
              colorHigh={element.props.colorHigh}
              resolution={element.props.resolution}
              height={element.props.height}
              wireframe={element.props.wireframe}
              autoRotate={element.props.autoRotate}
              showAxes={element.props.showAxes}
            />
          </SafeVizWrapper>
        </motion.div>
      );
    case 'latex':
      return (
        <motion.div key={key} {...fadeSlideUp}>
          <LatexDisplay
            expression={element.props.expression || ''}
            displayMode={element.props.displayMode}
            fontSize={element.props.fontSize}
            color={element.props.color}
            align={element.props.align}
            label={element.props.label}
          />
        </motion.div>
      );
    case 'textBlock':
      return (
        <motion.div key={key} {...fadeSlideUp}>
          <div className={`text-sm leading-relaxed break-words overflow-wrap-anywhere ${
            element.props.variant === 'callout'
              ? 'pl-3 border-l-2 border-chalk-accent/50 text-slate-300'
              : element.props.variant === 'definition'
              ? 'bg-chalk-surface/50 rounded-lg p-3 text-slate-300'
              : element.props.variant === 'insight'
              ? 'bg-chalk-accent/5 border border-chalk-accent/20 rounded-lg p-3 text-slate-200'
              : 'text-slate-300'
          }`}>
            {element.props.content}
          </div>
        </motion.div>
      );
    default:
      return null;
  }
}

function renderSpec(spec: ChalkSpec): React.ReactNode {
  const rootElement = spec.elements[spec.root];
  if (!rootElement) return null;
  return renderElement(spec.root, rootElement, spec);
}

export function ChatMessage({ role, content, spec, isStreaming, isJsonPending, thinking, thinkingDuration, prompt }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-blue-500 text-white text-sm leading-relaxed break-words">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message — hybrid text + viz rendering
  const hasContent = content && content.trim().length > 0;
  const hasSpec = !!spec;
  const showTypingDots = isStreaming && !hasContent && !hasSpec && !isJsonPending && !thinking;
  const showVizShimmer = isJsonPending && !hasSpec;

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[95%] w-full min-w-0">
        <div className="bg-chalk-surface/50 rounded-2xl rounded-bl-md p-4 backdrop-blur-sm border border-chalk-border/30">
          <AnimatePresence mode="wait">
            {/* Typing indicator — shown before any content arrives */}
            {showTypingDots && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 py-1"
              >
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Streamed explanation text */}
          {hasContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
                {content}
                {isStreaming && !isJsonPending && (
                  <span className="inline-block w-0.5 h-4 bg-chalk-accent/70 animate-pulse ml-0.5 align-middle" />
                )}
              </p>
            </motion.div>
          )}

          {/* Viz loading shimmer — text is done, JSON is being parsed */}
          {showVizShimmer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-3"
            >
              <div className="animate-pulse rounded-xl overflow-hidden">
                <div className="bg-gradient-to-br from-chalk-surface to-chalk-surface/60 h-12 rounded-lg mb-2" />
                <div className="bg-gradient-to-br from-chalk-surface to-chalk-surface/60 h-6 rounded-lg mb-2 w-2/3" />
                <div className="bg-gradient-to-br from-chalk-surface to-chalk-surface/60 h-48 rounded-lg" />
              </div>
            </motion.div>
          )}

          {/* Visualization spec — rendered when JSON is fully parsed */}
          {hasSpec && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={hasContent ? 'mt-3' : ''}
            >
              {renderSpec(spec)}
            </motion.div>
          )}

          {/* Fallback for empty completed messages */}
          {!isStreaming && !hasContent && !hasSpec && !thinking && (
            <p className="text-sm text-slate-500 italic">No response generated.</p>
          )}

          {/* Reasoning panel — shows Opus 4.6 thinking trace */}
          {thinking && (
            <ReasoningPanel
              thinking={thinking}
              thinkingDuration={thinkingDuration}
              isStreaming={isStreaming && !hasContent && !hasSpec}
            />
          )}

          {/* Share button — visible on completed assistant messages with a viz */}
          {!isStreaming && hasSpec && spec && prompt && (
            <div className="mt-3 flex justify-end">
              <ShareButton spec={spec} prompt={prompt} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
