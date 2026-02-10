import { saveVisualization } from '@/lib/supabase';

export async function POST(req: Request) {
  const { spec, prompt } = await req.json();
  const id = await saveVisualization(spec, prompt);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return Response.json({ id, url: `${baseUrl}/v/${id}` });
}
