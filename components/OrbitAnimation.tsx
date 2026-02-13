'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface OrbitThumbnail {
  videoId: string;
  title: string;
}

const CURATED_VIDEOS: OrbitThumbnail[] = [
  { videoId: 'WUvTyaaNkzM', title: 'Linear Algebra' },
  { videoId: 'kYB8IZa5AuE', title: 'Neural Networks' },
  { videoId: 'r-98YRAF1dY', title: '100 Seconds of Code' },
  { videoId: 'VMj-3S1tku0', title: 'GPT from Scratch' },
  { videoId: 'bfGGyCadSe8', title: 'Claude 4 System Prompts' },
  { videoId: 'HeQX2HjkcNo', title: "Math's Unsolvable Problem" },
  { videoId: 'SbS20rEt9EY', title: 'AI Research' },
  { videoId: '7U-RbOKanYs', title: "Dijkstra's Algorithm" },
  { videoId: 'HtSuA80QTyo', title: 'Introduction to Algorithms' },
  { videoId: 'aircAruvnKk', title: 'Essence of Calculus' },
];

// Subset for mobile
const MOBILE_VIDEOS = CURATED_VIDEOS.slice(0, 6);

interface OrbitAnimationProps {
  children: React.ReactNode;
  isInputFocused: boolean;
}

export default function OrbitAnimation({ children, isInputFocused }: OrbitAnimationProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const orbitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const videos = isMobile ? MOBILE_VIDEOS : CURATED_VIDEOS;
  const baseRadius = isMobile ? 180 : 280;
  const focusedRadius = baseRadius + 20;
  const radius = isInputFocused ? focusedRadius : baseRadius;
  const thumbWidth = isMobile ? 60 : 80;
  const thumbHeight = isMobile ? 34 : 45;

  // Duration: 60s normal, 120s when hovered/focused
  const isSlowed = hoveredIndex !== null || isInputFocused;
  const duration = isSlowed ? 120 : 60;

  const handleImageError = useCallback((videoId: string) => {
    setFailedImages(prev => new Set(prev).add(videoId));
  }, []);

  const handleThumbnailClick = useCallback((videoId: string) => {
    router.push(`/watch?v=${videoId}`);
  }, [router]);

  // Container size needs to be at least 2*radius + thumbnail size
  const containerSize = (focusedRadius + 20) * 2 + thumbWidth + 20;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: containerSize,
        height: containerSize,
        maxWidth: '100vw',
      }}
    >
      {/* Orbit ring container - rotates via CSS animation */}
      <div
        ref={orbitRef}
        className="absolute inset-0"
        style={{
          animation: `orbitRotate ${duration}s linear infinite`,
          willChange: 'transform',
          transition: 'animation-duration 1s ease',
        }}
      >
        {videos.map((video, index) => {
          const angle = (360 / videos.length) * index;
          const isHovered = hoveredIndex === index;
          const failed = failedImages.has(video.videoId);

          return (
            <div
              key={video.videoId}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                transform: `rotate(${angle}deg) translateX(${radius}px) rotate(-${angle}deg)`,
                marginLeft: -thumbWidth / 2,
                marginTop: -thumbHeight / 2,
                transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
              }}
            >
              {/* Counter-rotation to keep thumbnails upright */}
              <div
                style={{
                  animation: `orbitRotate ${duration}s linear infinite reverse`,
                  willChange: 'transform',
                }}
              >
                <motion.button
                  onClick={() => handleThumbnailClick(video.videoId)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="relative block cursor-pointer focus:outline-none group"
                  whileHover={{ scale: 1.3 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {failed ? (
                    <div
                      className="rounded-lg bg-gradient-to-br from-chalk-accent/20 to-purple-500/20 border border-chalk-border/30"
                      style={{ width: thumbWidth, height: thumbHeight }}
                    />
                  ) : (
                    <img
                      src={`https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`}
                      alt={video.title}
                      draggable={false}
                      onError={() => handleImageError(video.videoId)}
                      className="rounded-lg object-cover shadow-lg shadow-black/40 border border-white/[0.06]"
                      style={{ width: thumbWidth, height: thumbHeight }}
                    />
                  )}

                  {/* Tooltip on hover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2.5 py-1 rounded-md bg-chalk-surface/95 border border-chalk-border/40 backdrop-blur-md shadow-xl shadow-black/50 whitespace-nowrap z-50 pointer-events-none"
                      >
                        <span className="text-[10px] font-medium text-chalk-text/90">{video.title}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center content (search input) */}
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
