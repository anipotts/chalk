'use client';
import { SafeVizWrapper } from './SafeVizWrapper';
import { VizContainer } from './VizContainer';
import { MafsPlot2D } from './MafsPlot2D';
import { LatexDisplay } from './LatexDisplay';
import type { ChalkSpec, Element } from '@/lib/schemas';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  spec?: ChalkSpec | null;
  isStreaming?: boolean;
}

function renderElement(key: string, element: Element, spec: ChalkSpec): React.ReactNode {
  const children = element.children?.map((childKey) => {
    const child = spec.elements[childKey];
    if (!child) return null;
    return renderElement(childKey, child, spec);
  });

  switch (element.type) {
    case 'vizContainer':
      return (
        <VizContainer
          key={key}
          title={element.props.title || ''}
          description={element.props.description}
          layout={element.props.layout}
        >
          {children}
        </VizContainer>
      );
    case 'plot2d':
      return (
        <SafeVizWrapper key={key}>
          <MafsPlot2D {...element.props} />
        </SafeVizWrapper>
      );
    case 'latex':
      return (
        <LatexDisplay
          key={key}
          expression={element.props.expression || ''}
          displayMode={element.props.displayMode}
          fontSize={element.props.fontSize}
          color={element.props.color}
          align={element.props.align}
          label={element.props.label}
        />
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

export function ChatMessage({ role, content, spec, isStreaming }: ChatMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-blue-500 text-white text-sm leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[95%] w-full">
        {spec ? (
          <div className="bg-chalk-surface/50 rounded-2xl rounded-bl-md p-4 backdrop-blur-sm border border-chalk-border/30">
            {renderSpec(spec)}
          </div>
        ) : (
          <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-chalk-surface text-chalk-text text-sm leading-relaxed border border-chalk-border/30">
            {isStreaming ? (
              <div className="flex items-center gap-1.5 py-1">
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
                <span className="typing-dot w-2 h-2 bg-slate-400 rounded-full" />
              </div>
            ) : (
              content
            )}
          </div>
        )}
      </div>
    </div>
  );
}
