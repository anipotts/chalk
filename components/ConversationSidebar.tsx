'use client';
import { useState } from 'react';
import type { Conversation } from '@/lib/conversations';
import { PlusCircle, PencilSimpleLine, TrashSimple } from '@phosphor-icons/react';

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-chalk-bg border-r border-chalk-border/30">
      {/* New chat button */}
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-chalk-accent/10 text-chalk-accent hover:bg-chalk-accent/20 text-sm font-medium transition-colors"
        >
          <PlusCircle size={16} weight="bold" />
          New Chat
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversations.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8">No conversations yet</p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group relative flex items-center rounded-lg cursor-pointer transition-colors ${
                  activeId === conv.id
                    ? 'bg-chalk-surface text-chalk-text'
                    : 'text-slate-400 hover:bg-chalk-surface/50 hover:text-chalk-text'
                }`}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="flex-1 text-left px-3 py-2.5 min-w-0"
                >
                  {editingId === conv.id ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                      className="w-full bg-transparent text-sm text-chalk-text outline-none border-b border-chalk-accent"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="text-sm truncate">{conv.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatDate(conv.updatedAt)}
                        {conv.messages.length > 0 && (
                          <span> &middot; {conv.messages.length} msg{conv.messages.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </>
                  )}
                </button>

                {/* Actions */}
                {editingId !== conv.id && (
                  <div className="hidden group-hover:flex items-center gap-0.5 pr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(conv); }}
                      className="p-1 rounded hover:bg-chalk-border/30 text-slate-500 hover:text-chalk-text"
                      title="Rename"
                    >
                      <PencilSimpleLine size={14} weight="bold" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                      className="p-1 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400"
                      title="Delete"
                    >
                      <TrashSimple size={14} weight="bold" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
