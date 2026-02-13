import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

/**
 * Shared server-side Supabase admin client (singleton).
 * Uses service role key when available, falls back to anon key.
 */
export function getAdminClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}
