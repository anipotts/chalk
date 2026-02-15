'use client';

import { useState } from 'react';

interface HeroVideoCardProps {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  publishedText: string;
  duration?: string;
}

export function HeroVideoCard({
  videoId,
  title,
  channelName,
  duration
}: HeroVideoCardProps) {
  const [imgError, setImgError] = useState(false);

  const thumbnailUrl = imgError
    ? `https://img.youtube.com/vi/${videoId}/0.jpg`
    : `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <a
      href={`/watch?v=${videoId}`}
      onClick={(e) => {
        e.stopPropagation();
        window.location.href = `/watch?v=${videoId}`;
      }}
      className="hero-card block relative rounded-lg overflow-hidden cursor-pointer border border-white/[0.06] hover:border-white/[0.18] transition-all duration-400 group h-full"
      style={{
        pointerEvents: 'auto',
        background: 'rgba(255,255,255,0.03)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.3), inset 0 0.5px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Thumbnail — eager loading for instant display */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={thumbnailUrl}
          alt={title}
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover opacity-[0.55] group-hover:opacity-[0.75] transition-opacity duration-400"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Play icon — fades in on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-400">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" className="ml-0.5">
              <path d="M0 0V14L12 7L0 0Z" fill="rgba(255,255,255,0.8)" />
            </svg>
          </div>
        </div>

        {duration && (
          <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded-sm bg-black/60 text-white/60 text-[9px] font-mono tracking-wide">
            {duration}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="px-2.5 py-2">
        <p className="text-[10px] text-white/35 line-clamp-1 leading-tight group-hover:text-white/55 transition-colors duration-400">
          {title}
        </p>
        <p className="text-[9px] text-white/20 mt-0.5 group-hover:text-white/35 transition-colors duration-400">
          {channelName}
        </p>
      </div>
    </a>
  );
}
