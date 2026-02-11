import { saveVisualization } from '@/lib/supabase';

export async function POST(req: Request) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { spec, prompt } = body;

  if (!spec || typeof spec !== 'object' || !spec.root || !spec.elements) {
    return Response.json({ error: 'Invalid spec format' }, { status: 400 });
  }
  if (prompt !== undefined && typeof prompt !== 'string') {
    return Response.json({ error: 'Invalid prompt' }, { status: 400 });
  }

  try {
    // saveVisualization validates spec against ChalkSpecSchema
    const id = await saveVisualization(spec, prompt);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return Response.json({ id, url: `${baseUrl}/v/${id}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save';
    return Response.json({ error: message }, { status: 400 });
  }
}
