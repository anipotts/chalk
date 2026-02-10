'use client';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

function ErrorFallback({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return (
    <div className="p-4 rounded-lg bg-red-900/20 border border-red-800/30">
      <p className="text-sm text-red-400">Visualization error: {message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse bg-chalk-surface rounded-lg h-48 flex items-center justify-center">
      <div className="text-slate-500 text-sm">Loading visualization...</div>
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
