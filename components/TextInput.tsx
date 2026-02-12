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
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />
    </svg>
  );
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
}: TextInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [autoFocus, textareaRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStreaming && value.trim()) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-chalk-accent/40 focus:border-chalk-accent/30 transition-colors"
        disabled={disabled || isStreaming}
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 w-9 h-9 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 flex items-center justify-center hover:bg-red-500/25 transition-colors"
          title="Stop"
        >
          <StopIcon />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="shrink-0 w-9 h-9 rounded-xl bg-chalk-accent/15 text-chalk-accent border border-chalk-accent/30 flex items-center justify-center hover:bg-chalk-accent/25 disabled:opacity-30 disabled:hover:bg-chalk-accent/15 transition-colors"
          title="Send"
        >
          <ArrowRightIcon />
        </button>
      )}
    </form>
  );
}
