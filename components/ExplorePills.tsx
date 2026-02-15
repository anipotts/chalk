'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

interface ExplorePillsProps {
  options: string[];
  onSelect: (option: string) => void;
  onFocusInput?: () => void;
  disabled?: boolean;
}

const pillVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 12, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      delay: i * 0.06,
      type: 'spring' as const,
      stiffness: 500,
      damping: 30,
      mass: 0.8,
    },
  }),
};

export function ExplorePills({ options, onSelect, onFocusInput, disabled = false }: ExplorePillsProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allOptions = [...options, 'Something else...'];

  const handleSelect = useCallback((option: string, index: number) => {
    if (disabled) return;
    if (option === 'Something else...') {
      onFocusInput?.();
      return;
    }
    setSelectingIndex(index);
    setTimeout(() => {
      onSelect(option);
    }, 150);
  }, [disabled, onSelect, onFocusInput]);

  // Keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      // Number keys 1-4 quick-select
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4 && num <= allOptions.length) {
        e.preventDefault();
        handleSelect(allOptions[num - 1], num - 1);
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % allOptions.length);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + allOptions.length) % allOptions.length);
          break;
        case 'Tab':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % allOptions.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < allOptions.length) {
            handleSelect(allOptions[focusedIndex], focusedIndex);
          }
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [allOptions, focusedIndex, disabled, handleSelect]);

  // Focus the container when it mounts so keyboard navigation works
  useEffect(() => {
    if (containerRef.current && !disabled) {
      containerRef.current.focus();
    }
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap gap-2 mt-2"
      role="listbox"
      aria-label="Explore options"
      tabIndex={0}
    >
      {allOptions.map((option, index) => {
        const isSelecting = selectingIndex === index;
        const isFocused = focusedIndex === index;
        const isSomethingElse = option === 'Something else...';

        return (
          <motion.button
            key={`${option}-${index}`}
            custom={index}
            variants={pillVariants}
            initial="hidden"
            animate={isSelecting ? { opacity: 0, scale: 1.08, transition: { duration: 0.15 } } : "visible"}
            onClick={() => handleSelect(option, index)}
            disabled={disabled}
            className={`
              rounded-lg text-sm px-3 py-1.5 transition-colors
              ${isSomethingElse
                ? 'bg-white/[0.03] border border-dashed border-white/[0.15] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                : 'bg-white/[0.06] border border-white/[0.08] text-slate-300 hover:bg-white/[0.1] hover:text-white'
              }
              ${isFocused ? 'ring-1 ring-chalk-accent/40' : ''}
              ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
            role="option"
            aria-selected={isFocused}
          >
            {!isSomethingElse && index < 4 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-mono font-medium bg-white/[0.08] text-slate-500 mr-1.5 -ml-0.5">{index + 1}</span>
            )}
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
