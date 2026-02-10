import { supabase } from './supabase';

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  spec?: any;
  thinking?: string;
  thinkingDuration?: number;
}

// ---------------------------------------------------------------------------
// localStorage cache — fast reads, synced from Supabase on mount
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'chalk_conversations';

function getCached(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCache(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Supabase helpers — async, persistent across devices
// ---------------------------------------------------------------------------

function toSupabaseRow(conv: Conversation) {
  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages,
    created_at: new Date(conv.createdAt).toISOString(),
    updated_at: new Date(conv.updatedAt).toISOString(),
  };
}

function fromSupabaseRow(row: any): Conversation {
  return {
    id: row.id,
    title: row.title,
    messages: row.messages || [],
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ---------------------------------------------------------------------------
// Public API — synchronous for immediate reads (localStorage), async for writes
// ---------------------------------------------------------------------------

/**
 * List conversations — reads from localStorage cache for instant response.
 * Call `syncConversations()` on mount to hydrate cache from Supabase.
 */
export function listConversations(): Conversation[] {
  return getCached().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | null {
  return getCached().find((c) => c.id === id) || null;
}

export function createConversation(firstMessage: string): Conversation {
  const conv: Conversation = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : ''),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // Update localStorage cache immediately
  const all = getCached();
  all.push(conv);
  saveCache(all);

  // Persist to Supabase async (fire and forget)
  supabase
    .from('conversations')
    .insert(toSupabaseRow(conv))
    .then(({ error }) => {
      if (error) console.warn('Supabase insert error:', error.message);
    });

  return conv;
}

export function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'title' | 'messages'>>,
): Conversation | null {
  const all = getCached();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  if (updates.title !== undefined) all[idx].title = updates.title;
  if (updates.messages !== undefined) all[idx].messages = updates.messages;
  all[idx].updatedAt = Date.now();
  saveCache(all);

  // Persist to Supabase async
  const row = toSupabaseRow(all[idx]);
  supabase
    .from('conversations')
    .upsert(row)
    .then(({ error }) => {
      if (error) console.warn('Supabase upsert error:', error.message);
    });

  return all[idx];
}

export function deleteConversation(id: string): boolean {
  const all = getCached();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  saveCache(filtered);

  // Delete from Supabase async
  supabase
    .from('conversations')
    .delete()
    .eq('id', id)
    .then(({ error }) => {
      if (error) console.warn('Supabase delete error:', error.message);
    });

  return true;
}

/**
 * Sync conversations from Supabase into localStorage cache.
 * Call this on mount to hydrate. Merges remote data with any local-only entries.
 */
export async function syncConversations(): Promise<Conversation[]> {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('Supabase sync error:', error.message);
      return getCached();
    }

    const remote = (data || []).map(fromSupabaseRow);
    const local = getCached();

    // Merge: use remote as source of truth, but keep any local-only entries
    // that haven't been synced yet (e.g. created offline)
    const remoteIds = new Set(remote.map((c) => c.id));
    const localOnly = local.filter((c) => !remoteIds.has(c.id));

    // Push any local-only entries to Supabase
    for (const conv of localOnly) {
      supabase
        .from('conversations')
        .upsert(toSupabaseRow(conv))
        .then(({ error: e }) => {
          if (e) console.warn('Supabase sync push error:', e.message);
        });
    }

    const merged = [...remote, ...localOnly].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    saveCache(merged);
    return merged;
  } catch {
    return getCached();
  }
}
