import { createClient } from '@supabase/supabase-js';
import { ChalkSpecSchema } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** Get writable client: prefer service role for server-side, fall back to anon. */
function getWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    return createClient(url, serviceKey);
  }
  return supabase;
}

const MAX_SPEC_SIZE = 500_000; // 500KB max spec size

export async function saveVisualization(spec: unknown, prompt: unknown): Promise<string> {
  const client = getWriteClient();
  if (!client) throw new Error('Supabase not configured');

  // Validate spec against ChalkSpec schema
  const parsed = ChalkSpecSchema.safeParse(spec);
  if (!parsed.success) throw new Error('Invalid visualization spec');

  const safePrompt = typeof prompt === 'string' ? prompt.slice(0, 2000) : '';
  const specJson = JSON.stringify(parsed.data);
  if (specJson.length > MAX_SPEC_SIZE) throw new Error('Spec too large');

  const { nanoid } = await import('nanoid');
  const id = nanoid(10);
  const { error } = await client
    .from('visualizations')
    .insert({ id, spec: parsed.data, prompt: safePrompt });
  if (error) throw error;
  return id;
}

export async function loadVisualization(id: string): Promise<{ spec: unknown; prompt: string }> {
  const client = supabase;
  if (!client) throw new Error('Supabase not configured');

  // Validate id format (nanoid is alphanumeric, 10 chars)
  if (!/^[a-zA-Z0-9_-]{1,20}$/.test(id)) throw new Error('Invalid visualization ID');

  const { data, error } = await client
    .from('visualizations')
    .select('spec, prompt')
    .eq('id', id)
    .single();
  if (error) throw error;
  return { spec: data.spec, prompt: String(data.prompt || '') };
}
