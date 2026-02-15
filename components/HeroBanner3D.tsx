'use client';

import { useState, useEffect } from 'react';
import { HeroColumn } from './HeroColumn';

// Curated educational videos distributed across 5 columns
const CURATED_VIDEOS = [
  // Column 1 (scrolls UP)
  [
    {
      videoId: 'WUvTyaaNkzM',
      title: 'The Essence of Linear Algebra',
      channelName: '3Blue1Brown',
      viewCount: 8200000,
      publishedText: '7 years ago',
      duration: '17:52'
    },
    {
      videoId: 'aircAruvnKk',
      title: 'But what is a neural network?',
      channelName: '3Blue1Brown',
      viewCount: 15000000,
      publishedText: '7 years ago',
      duration: '19:13'
    },
    {
      videoId: 'r6sGWTCMz2k',
      title: 'But what is the Fourier Transform?',
      channelName: '3Blue1Brown',
      viewCount: 14000000,
      publishedText: '7 years ago',
      duration: '20:57'
    },
    {
      videoId: 'spUNpyF58BY',
      title: 'The beauty of Bézier curves',
      channelName: 'Freya Holmér',
      viewCount: 2100000,
      publishedText: '3 years ago',
      duration: '11:12'
    },
    {
      videoId: 'S9JGmA5_unY',
      title: 'How Blurs & Filters Work',
      channelName: 'Computerphile',
      viewCount: 1800000,
      publishedText: '6 years ago',
      duration: '9:40'
    }
  ],
  // Column 2 (scrolls DOWN)
  [
    {
      videoId: 'MHS-htjGgSY',
      title: 'Simulating Natural Selection',
      channelName: 'Primer',
      viewCount: 12000000,
      publishedText: '5 years ago',
      duration: '10:33'
    },
    {
      videoId: 'OmJ-4B-mS-Y',
      title: 'The Map of Mathematics',
      channelName: 'Domain of Science',
      viewCount: 18000000,
      publishedText: '8 years ago',
      duration: '11:06'
    },
    {
      videoId: 'f5liqUk0ZTw',
      title: 'What is a Tensor?',
      channelName: 'Dan Fleisch',
      viewCount: 4500000,
      publishedText: '12 years ago',
      duration: '12:21'
    },
    {
      videoId: 'YuIIjLr6vUA',
      title: 'How Electricity Actually Works',
      channelName: 'Veritasium',
      viewCount: 16000000,
      publishedText: '2 years ago',
      duration: '19:42'
    },
    {
      videoId: 'Kas0tIxDvrg',
      title: 'The Longest-Standing Math Problem',
      channelName: 'Veritasium',
      viewCount: 8000000,
      publishedText: '1 year ago',
      duration: '27:33'
    }
  ],
  // Column 3 (scrolls UP)
  [
    {
      videoId: 'T647CGsuOVU',
      title: 'Imaginary Numbers Are Real',
      channelName: 'Welch Labs',
      viewCount: 7700000,
      publishedText: '9 years ago',
      duration: '5:47'
    },
    {
      videoId: 'ZoT82NDpcvQ',
      title: 'How Does a Quantum Computer Work?',
      channelName: 'Veritasium',
      viewCount: 10000000,
      publishedText: '10 years ago',
      duration: '6:35'
    },
    {
      videoId: 'WsQQvHm4lSw',
      title: 'But what is a convolution?',
      channelName: '3Blue1Brown',
      viewCount: 4200000,
      publishedText: '2 years ago',
      duration: '23:01'
    },
    {
      videoId: 'HeQX2HjkcNo',
      title: 'Essence of calculus',
      channelName: '3Blue1Brown',
      viewCount: 12000000,
      publishedText: '7 years ago',
      duration: '17:04'
    },
    {
      videoId: 'S0_qX4VJhMQ',
      title: 'The paradox at the heart of calculus',
      channelName: '3Blue1Brown',
      viewCount: 7500000,
      publishedText: '7 years ago',
      duration: '18:21'
    }
  ],
  // Column 4 (scrolls DOWN)
  [
    {
      videoId: 'GiDsjIBOVoA',
      title: 'How Do Computers Remember?',
      channelName: 'Veritasium',
      viewCount: 8500000,
      publishedText: '5 years ago',
      duration: '13:37'
    },
    {
      videoId: 'ovJcsL7vyrk',
      title: 'The Butterfly Effect',
      channelName: 'Veritasium',
      viewCount: 18000000,
      publishedText: '5 years ago',
      duration: '13:02'
    },
    {
      videoId: 'bBC-nXj3Ng4',
      title: 'But how does bitcoin actually work?',
      channelName: '3Blue1Brown',
      viewCount: 10000000,
      publishedText: '7 years ago',
      duration: '26:21'
    },
    {
      videoId: 'zjkBMFhNj_g',
      title: 'But what is a GPT?',
      channelName: '3Blue1Brown',
      viewCount: 11000000,
      publishedText: '1 year ago',
      duration: '27:14'
    },
    {
      videoId: 'EK32jo7i5LQ',
      title: 'A Strange Map Projection',
      channelName: 'Veritasium',
      viewCount: 7000000,
      publishedText: '3 years ago',
      duration: '17:03'
    }
  ],
  // Column 5 (scrolls UP)
  [
    {
      videoId: 'HEfHFsfGXjs',
      title: 'Bayes theorem',
      channelName: '3Blue1Brown',
      viewCount: 8000000,
      publishedText: '5 years ago',
      duration: '15:11'
    },
    {
      videoId: 'AuA2EAgAegE',
      title: 'e (Euler Number) - Numberphile',
      channelName: 'Numberphile',
      viewCount: 4700000,
      publishedText: '12 years ago',
      duration: '10:42'
    },
    {
      videoId: 'fNk_zzaMoSs',
      title: 'Vectors, what even are they?',
      channelName: '3Blue1Brown',
      viewCount: 9000000,
      publishedText: '8 years ago',
      duration: '9:52'
    },
    {
      videoId: 'Unzc731iCUY',
      title: 'How Machines Learn',
      channelName: 'CGP Grey',
      viewCount: 14000000,
      publishedText: '7 years ago',
      duration: '9:48'
    },
    {
      videoId: 'OkmNXy7er84',
      title: 'The Unreasonable Efficiency of JPEG',
      channelName: 'Reducible',
      viewCount: 3200000,
      publishedText: '2 years ago',
      duration: '19:53'
    }
  ]
];

export function HeroBanner3D() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="relative w-full h-[500px] bg-chalk-bg" />;
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden">
      {/* Overall dim layer — darkens the entire banner for subtlety */}
      <div className="absolute inset-0 bg-black/30 z-[1] pointer-events-none" />

      {/* 3D Perspective Container */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          perspective: '1200px',
          perspectiveOrigin: '50% 35%'
        }}
      >
        {/* Card columns with steep angle */}
        <div
          className="relative flex gap-5 md:gap-7 items-start justify-center"
          style={{
            transform: 'rotateX(55deg) scale(1.5)',
            transformStyle: 'preserve-3d',
            height: '1600px'
          }}
        >
          {/* Desktop: show all 5 columns, Mobile: show first 3 */}
          {CURATED_VIDEOS.map((columnCards, colIdx) => (
            <div
              key={colIdx}
              className={colIdx >= 3 ? 'hidden md:block' : ''}
            >
              <HeroColumn
                cards={columnCards}
                direction={colIdx % 2 === 0 ? 'up' : 'down'}
                delay={colIdx * 0.4}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Center vignette — soft dark zone where the search bar lives */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: 'radial-gradient(ellipse 700px 400px at 50% 55%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)'
        }}
      />

      {/* Top header vignette — dark zone behind logo */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 8%, transparent 18%)'
        }}
      />

      {/* Edge overlays — smooth fade to black at all edges */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-chalk-bg via-chalk-bg/70 to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-chalk-bg via-chalk-bg/85 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 left-0 w-56 bg-gradient-to-r from-chalk-bg via-chalk-bg/60 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-y-0 right-0 w-56 bg-gradient-to-l from-chalk-bg via-chalk-bg/60 to-transparent pointer-events-none z-10" />
    </div>
  );
}
