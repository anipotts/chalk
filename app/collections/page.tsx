'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  listCollections,
  createCollection,
  deleteCollection,
  removeVideoFromCollection,
  type StudyCollection,
} from '@/lib/video-sessions';

export default function CollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState<StudyCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const refresh = useCallback(() => {
    listCollections().then((data) => {
      setCollections(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createCollection(newName.trim(), newDesc.trim() || undefined);
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteCollection(id);
    refresh();
  };

  const handleRemoveVideo = async (collectionId: string, videoId: string) => {
    await removeVideoFromCollection(collectionId, videoId);
    refresh();
  };

  return (
    <div className="min-h-screen bg-chalk-bg">
      {/* Header */}
      <div className="border-b border-chalk-border/30 bg-chalk-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="text-lg font-semibold text-chalk-text hover:text-chalk-accent transition-colors">
            Chalk
          </a>
          <span className="text-slate-600">|</span>
          <span className="text-sm text-slate-400">Study Collections</span>
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 rounded-lg text-xs bg-chalk-accent text-white hover:bg-blue-600 transition-colors"
            >
              + New Collection
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Create form */}
        {showCreate && (
          <div className="mb-8 p-4 rounded-xl bg-chalk-surface/30 border border-chalk-border/30">
            <h3 className="text-sm font-medium text-chalk-text mb-3">Create Collection</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Collection name..."
                className="w-full px-3 py-2 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
                autoFocus
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full px-3 py-2 rounded-lg bg-chalk-bg/60 border border-chalk-border/30 text-sm text-chalk-text placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-chalk-accent/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs bg-chalk-accent text-white hover:bg-blue-600 disabled:opacity-30 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); }}
                  className="px-4 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-chalk-accent/40 border-t-chalk-accent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && collections.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-chalk-surface/40 border border-chalk-border/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-slate-500">
                <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
              </svg>
            </div>
            <p className="text-slate-400 mb-1">No collections yet</p>
            <p className="text-xs text-slate-500 mb-5">Organize your study videos into playlists for focused learning</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg text-xs bg-chalk-accent text-white hover:bg-blue-600 transition-colors"
            >
              Create your first collection
            </button>
          </div>
        )}

        {/* Collections list */}
        <div className="space-y-6">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="rounded-xl bg-chalk-surface/20 border border-chalk-border/20 overflow-hidden"
            >
              {/* Collection header */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-chalk-border/20">
                <div>
                  <h3 className="text-sm font-medium text-chalk-text">{collection.name}</h3>
                  {collection.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{collection.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">
                    {collection.videos.length} video{collection.videos.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => handleDelete(collection.id)}
                    className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title="Delete collection"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Videos grid */}
              {collection.videos.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-slate-500">
                    No videos yet. Add videos from the watch page.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-3">
                  {collection.videos.map((video) => (
                    <div
                      key={video.id}
                      className="group relative rounded-lg overflow-hidden bg-chalk-surface/30 border border-chalk-border/20 hover:border-chalk-accent/30 transition-all cursor-pointer"
                      onClick={() => router.push(`/watch?v=${video.id}`)}
                    >
                      <img
                        src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                        alt={video.title || ''}
                        className="w-full aspect-video object-cover"
                      />
                      {video.title && (
                        <div className="px-2 py-1.5">
                          <p className="text-[11px] text-slate-400 line-clamp-2">{video.title}</p>
                        </div>
                      )}
                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveVideo(collection.id, video.id);
                        }}
                        className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove from collection"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
