'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';

interface VideoTimeState {
  /** Current playback time, quantized to 1s intervals */
  currentTime: number;
  /** Whether the video is currently paused */
  isPaused: boolean;
}

const VideoTimeContext = createContext<VideoTimeState>({
  currentTime: 0,
  isPaused: true,
});

export function useVideoTime() {
  return useContext(VideoTimeContext);
}

export function VideoTimeProvider({
  currentTime: rawTime,
  isPaused,
  children,
}: {
  currentTime: number;
  isPaused: boolean;
  children: React.ReactNode;
}) {
  // Quantize to 1-second intervals to limit re-renders
  const [quantizedTime, setQuantizedTime] = useState(Math.floor(rawTime));
  const lastQuantized = useRef(Math.floor(rawTime));

  useEffect(() => {
    const q = Math.floor(rawTime);
    if (q !== lastQuantized.current) {
      lastQuantized.current = q;
      setQuantizedTime(q);
    }
  }, [rawTime]);

  return (
    <VideoTimeContext.Provider value={{ currentTime: quantizedTime, isPaused }}>
      {children}
    </VideoTimeContext.Provider>
  );
}
