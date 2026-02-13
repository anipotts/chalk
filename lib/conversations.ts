import { nanoid } from 'nanoid';
import { supabase } from './supabase';
import { storageKey } from './brand';

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
  spec?: unknown;
  thinking?: string;
  thinkingDuration?: number;
}

const MAX_MESSAGES_PER_CONVERSATION = 200;

// ---------------------------------------------------------------------------
// localStorage cache — fast reads, synced from Supabase on mount
// ---------------------------------------------------------------------------
const STORAGE_KEY = storageKey('conversations');

function getCached(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveCache(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn('localStorage write failed:', e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// Supabase helpers — async, persistent across devices
// ---------------------------------------------------------------------------

function toSupabaseRow(conv: Conversation) {
  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    created_at: new Date(conv.createdAt).toISOString(),
    updated_at: new Date(conv.updatedAt).toISOString(),
  };
}

function fromSupabaseRow(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    messages: Array.isArray(row.messages) ? row.messages : [],
    createdAt: new Date(String(row.created_at)).getTime(),
    updatedAt: new Date(String(row.updated_at)).getTime(),
  };
}


// ---------------------------------------------------------------------------
// Public API — synchronous for immediate reads (localStorage), async for writes
// ---------------------------------------------------------------------------

export function listConversations(): Conversation[] {
  return getCached().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getConversation(id: string): Conversation | null {
  return getCached().find((c) => c.id === id) || null;
}

export function createConversation(firstMessage: string): Conversation {
  const conv: Conversation = {
    id: nanoid(12),
    title: firstMessage.slice(0, 60) + (firstMessage.length > 60 ? '...' : ''),
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = getCached();
  all.push(conv);
  saveCache(all);

  if (supabase) {
    supabase
      .from('conversations')
      .insert(toSupabaseRow(conv))
      .then(({ error }) => {
        if (error) console.warn('Supabase insert error:', error.message);
      });
  }

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
  if (updates.messages !== undefined) {
    all[idx].messages = updates.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
  all[idx].updatedAt = Date.now();
  saveCache(all);

  if (supabase) {
    const row = toSupabaseRow(all[idx]);
    supabase
      .from('conversations')
      .upsert(row)
      .then(({ error }) => {
        if (error) console.warn('Supabase upsert error:', error.message);
      });
  }

  return all[idx];
}

export function deleteConversation(id: string): boolean {
  const all = getCached();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  saveCache(filtered);

  if (supabase) {
    supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.warn('Supabase delete error:', error.message);
      });
  }

  return true;
}

/**
 * Sync conversations from Supabase into localStorage cache.
 * Merges by updatedAt timestamp — newest version wins.
 */
export async function syncConversations(): Promise<Conversation[]> {
  if (!supabase) return getCached();

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('Supabase sync error:', error.message);
      return getCached();
    }

    const remote = (data || []).map(fromSupabaseRow);
    const local = getCached();

    // Build merged map — newest version wins by updatedAt
    const merged = new Map<string, Conversation>();
    for (const conv of remote) merged.set(conv.id, conv);
    for (const conv of local) {
      const existing = merged.get(conv.id);
      if (!existing || conv.updatedAt > existing.updatedAt) {
        merged.set(conv.id, conv);
        // Push local-newer entries to Supabase
        if (existing && conv.updatedAt > existing.updatedAt) {
          supabase
            .from('conversations')
            .upsert(toSupabaseRow(conv))
            .then(({ error: e }) => {
              if (e) console.warn('Supabase sync push error:', e.message);
            });
        }
      }
      // If local-only (not in remote), push to Supabase
      if (!existing) {
        supabase
          .from('conversations')
          .upsert(toSupabaseRow(conv))
          .then(({ error: e }) => {
            if (e) console.warn('Supabase sync push error:', e.message);
          });
      }
    }

    const result = Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    saveCache(result);
    return result;
  } catch {
    return getCached();
  }
}
