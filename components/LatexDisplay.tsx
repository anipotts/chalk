'use client';
import katex from 'katex';

interface LatexProps {
  expression: string;
  displayMode?: 'block' | 'inline';
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  color?: string;
  align?: 'left' | 'center' | 'right';
  label?: string;
}

const fontSizeMap: Record<string, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
};

export function LatexDisplay({
  expression,
  displayMode = 'block',
  fontSize = 'lg',
  color = '#f1f5f9',
  align = 'center',
  label,
}: LatexProps) {
  let html: string;
  try {
    html = katex.renderToString(expression, {
      displayMode: displayMode === 'block',
      throwOnError: false,
      trust: true,
    });
  } catch {
    html = `<span style="color: #ef4444;">${expression}</span>`;
  }

  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`${alignClass} ${fontSizeMap[fontSize] || 'text-lg'} my-2`}>
      {label && (
        <div className="text-sm text-slate-400 mb-1">{label}</div>
      )}
      <div
        style={{ color }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
