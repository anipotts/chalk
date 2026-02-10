'use client';

interface VizContainerProps {
  title: string;
  description?: string;
  layout?: 'single' | 'split' | 'grid';
  children: React.ReactNode;
}

export function VizContainer({
  title,
  description,
  layout = 'single',
  children,
}: VizContainerProps) {
  const layoutClass = layout === 'grid'
    ? 'grid grid-cols-2 gap-4'
    : layout === 'split'
    ? 'flex flex-col md:flex-row gap-4'
    : 'flex flex-col gap-4';

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-chalk-text break-words">{title}</h2>
        {description && (
          <p className="text-sm text-slate-400 mt-1 break-words">{description}</p>
        )}
      </div>
      <div className={`${layoutClass} min-w-0 overflow-hidden`}>{children}</div>
    </div>
  );
}
