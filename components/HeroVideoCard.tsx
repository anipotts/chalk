'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `/watch?v=${videoId}`;
  };

  return (
    <motion.a
      href={`/watch?v=${videoId}`}
      onClick={handleClick}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="block relative rounded-lg overflow-hidden cursor-pointer border border-white/[0.04] hover:border-white/[0.12] transition-all duration-500 group h-full"
      style={{
        pointerEvents: 'auto',
        background: 'rgba(255,255,255,0.02)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 2px 16px rgba(0,0,0,0.25), inset 0 0.5px 0 rgba(255,255,255,0.03)'
      }}
    >
      {/* Thumbnail — the hero of the card */}
      <div className="relative aspect-video">
        <Image
          src={thumbnailUrl}
          alt={title}
          fill
          className="object-cover opacity-[0.45] group-hover:opacity-[0.65] transition-opacity duration-700"
          sizes="280px"
          unoptimized
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Play icon — fades in on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" className="ml-0.5">
              <path d="M0 0V14L12 7L0 0Z" fill="rgba(255,255,255,0.7)" />
            </svg>
          </div>
        </div>

        {duration && (
          <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 rounded-sm bg-black/50 text-white/50 text-[9px] font-mono tracking-wide">
            {duration}
          </div>
        )}
      </div>

      {/* Minimal metadata — only title, very subtle */}
      <div className="px-2.5 py-2">
        <p className="text-[10px] text-white/25 line-clamp-1 leading-tight group-hover:text-white/40 transition-colors duration-500">
          {title}
        </p>
        <p className="text-[9px] text-white/15 mt-0.5 group-hover:text-white/25 transition-colors duration-500">
          {channelName}
        </p>
      </div>
    </motion.a>
  );
}
