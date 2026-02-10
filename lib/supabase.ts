import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function saveVisualization(spec: any, prompt: string): Promise<string> {
  const id = nanoid(10);
  const { error } = await supabase
    .from('visualizations')
    .insert({ id, spec, prompt });
  if (error) throw error;
  return id;
}

export async function loadVisualization(id: string): Promise<{ spec: any; prompt: string }> {
  const { data, error } = await supabase
    .from('visualizations')
    .select('spec, prompt')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
