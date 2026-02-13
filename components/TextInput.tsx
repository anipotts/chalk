'use client';

import { useRef, useEffect, type RefObject } from 'react';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  exploreMode?: boolean;
  onToggleExplore?: () => void;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onStop,
  placeholder = 'Type a message...',
  disabled = false,
  autoFocus = false,
  inputRef: externalRef,
  exploreMode = false,
  onToggleExplore,
}: TextInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [autoFocus, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Tab toggles Explore Mode
    if (e.key === 'Tab' && e.shiftKey && onToggleExplore) {
      e.preventDefault();
      onToggleExplore();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const resolvedPlaceholder = exploreMode
    ? 'What do you want to explore in this video?'
    : placeholder;

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={resolvedPlaceholder}
        aria-label={resolvedPlaceholder}
        rows={1}
        className="w-full resize-none px-3 py-2.5 pr-20 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40 focus:border-chalk-accent/30 transition-colors"
        disabled={disabled || isStreaming}
      />
      {onToggleExplore && (
        <button
          type="button"
          onClick={onToggleExplore}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all duration-200 ${
            exploreMode
              ? 'bg-chalk-accent/20 text-chalk-accent border border-chalk-accent/30'
              : 'bg-white/[0.04] text-slate-500 border border-white/[0.08] hover:bg-white/[0.08] hover:text-slate-400'
          }`}
          title="Toggle Explore Mode (Shift+Tab)"
          aria-label={exploreMode ? 'Disable Explore Mode' : 'Enable Explore Mode'}
          aria-pressed={exploreMode}
        >
          Explore
        </button>
      )}
    </div>
  );
}
