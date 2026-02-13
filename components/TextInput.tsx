'use client';

import { useRef, useEffect, type RefObject, type ReactNode } from 'react';

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
  rightSlot?: ReactNode;
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
  rightSlot,
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

  return (
    <div className="flex-1 flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus-within:ring-1 focus-within:ring-chalk-accent/40 focus-within:border-chalk-accent/30 transition-colors">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        className="flex-1 resize-none px-3 py-2.5 bg-transparent text-sm text-chalk-text placeholder:text-slate-600 focus:outline-none"
        disabled={disabled || isStreaming}
      />
      {rightSlot && <div className="flex-shrink-0 pr-1.5">{rightSlot}</div>}
    </div>
  );
}
