'use client';

import { HeroVideoCard } from './HeroVideoCard';

interface HeroVideoCardProps {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  publishedText: string;
  duration?: string;
  conversation?: {
    question: string;
    answer: string;
    timestamp: string;
  };
}

interface HeroColumnProps {
  cards: HeroVideoCardProps[];
  direction: 'up' | 'down';
  delay?: number;
  speed?: number;
}

const CARD_HEIGHT = 200;
const GAP = 20;

export function HeroColumn({ cards, direction, delay = 0, speed = 22 }: HeroColumnProps) {
  // Duplicate for seamless infinite loop
  const doubledCards = [...cards, ...cards];
  // Total height of one set of cards
  const setHeight = cards.length * CARD_HEIGHT + (cards.length - 1) * GAP;

  return (
    <div
      className="hero-column relative"
      style={{
        height: `${setHeight}px`,
        pointerEvents: 'auto',
        clipPath: 'inset(0 -16px)',
      }}
    >
      <div
        className={`flex flex-col gap-5 ${
          direction === 'up' ? 'animate-scroll-up' : 'animate-scroll-down'
        }`}
        style={{
          animationDelay: `${delay}s`,
          animationDuration: `${speed}s`,
          pointerEvents: 'auto'
        }}
      >
        {doubledCards.map((card, idx) => (
          <div
            key={idx}
            className="flex-shrink-0 w-52 md:w-72"
            style={{ height: `${CARD_HEIGHT}px`, pointerEvents: 'auto' }}
          >
            <HeroVideoCard {...card} />
          </div>
        ))}
      </div>
    </div>
  );
}
