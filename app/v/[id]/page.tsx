import { loadVisualization } from '@/lib/supabase';
import { ChatMessage } from '@/components/ChatMessage';

export default async function SharedViz({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { spec, prompt } = await loadVisualization(id);
    return (
      <div className="min-h-screen bg-chalk-bg p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4">
            <a href="/" className="text-chalk-accent text-sm hover:underline">&larr; Back to chalk</a>
          </div>
          <div className="mb-4 text-sm text-slate-400">
            Original prompt: &ldquo;{prompt}&rdquo;
          </div>
          <ChatMessage role="assistant" content="" spec={spec} />
        </div>
      </div>
    );
  } catch {
    return (
      <div className="min-h-screen bg-chalk-bg flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-chalk-text mb-2">Not found</h1>
          <p className="text-slate-400">This visualization doesn&apos;t exist or has been removed.</p>
          <a href="/" className="text-chalk-accent text-sm hover:underline mt-4 inline-block">Go to chalk</a>
        </div>
      </div>
    );
  }
}
