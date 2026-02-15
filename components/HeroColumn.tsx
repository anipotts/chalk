'use client';

import { HeroVideoCard } from './HeroVideoCard';

interface HeroVideoCardProps {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  publishedText: string;
  duration?: string;
}

interface HeroColumnProps {
  cards: HeroVideoCardProps[];
  direction: 'up' | 'down';
  delay?: number;
}

const CARD_HEIGHT = 200;
const GAP = 20;

export function HeroColumn({ cards, direction, delay = 0 }: HeroColumnProps) {
  // Duplicate for seamless infinite loop
  const doubledCards = [...cards, ...cards];
  // Total height of one set of cards
  const setHeight = cards.length * CARD_HEIGHT + (cards.length - 1) * GAP;

  return (
    <div
      className="hero-column relative overflow-hidden"
      style={{ height: `${setHeight}px`, pointerEvents: 'auto' }}
    >
      <div
        className={`flex flex-col gap-5 ${
          direction === 'up' ? 'animate-scroll-up' : 'animate-scroll-down'
        }`}
        style={{
          animationDelay: `${delay}s`,
          animationDuration: direction === 'up' ? '22s' : '25s',
          pointerEvents: 'auto'
        }}
      >
        {doubledCards.map((card, idx) => (
          <div
            key={idx}
            className="flex-shrink-0 w-56 md:w-72"
            style={{ height: `${CARD_HEIGHT}px`, pointerEvents: 'auto' }}
          >
            <HeroVideoCard {...card} />
          </div>
        ))}
      </div>
    </div>
  );
}
