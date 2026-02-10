'use client';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

function ErrorFallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return (
    <div className="p-4 rounded-lg bg-red-900/20 border border-red-800/30">
      <p className="text-sm text-red-400 mb-2">Visualization error: {message}</p>
      <button
        onClick={resetErrorBoundary}
        className="text-xs px-3 py-1 rounded-md bg-red-900/30 text-red-300 hover:bg-red-900/50 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse bg-chalk-surface/50 rounded-xl h-48 flex items-center justify-center">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <div className="w-4 h-4 border-2 border-slate-500/30 border-t-slate-500 rounded-full animate-spin" />
        Loading visualization...
      </div>
    </div>
  );
}

export function SafeVizWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<LoadingSkeleton />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
