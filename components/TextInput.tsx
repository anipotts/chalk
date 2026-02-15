'use client';

import { useRef, useEffect, useCallback, type RefObject } from 'react';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  onStop: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLElement | null>;
  exploreMode?: boolean;
  onToggleExplore?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  actions?: React.ReactNode;
  topBar?: React.ReactNode;
}

const TIMESTAMP_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

/** Convert raw value (with [M:SS] tokens) to HTML with badge spans */
function valueToHtml(text: string): string {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    TIMESTAMP_RE,
    '<span contenteditable="false" data-ts="$1" class="ts-badge">$1</span>',
  );
}

/** Extract raw value from contentEditable DOM — badge spans become [M:SS] */
function extractValue(el: HTMLElement): string {
  let result = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (elem.hasAttribute('data-ts')) {
        result += `[${elem.getAttribute('data-ts')}]`;
      } else {
        result += extractValue(elem);
      }
    }
  }
  return result;
}

/**
 * Walk text nodes in the element (skipping inside badges) and convert
 * completed [M:SS] patterns to non-editable badge spans.
 * Returns the last created badge element (for cursor positioning).
 */
function tokenizeTimestamps(el: HTMLElement): HTMLElement | null {
  let lastNewBadge: HTMLElement | null = null;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if ((walker.currentNode.parentElement)?.hasAttribute?.('data-ts')) continue;
    textNodes.push(walker.currentNode as Text);
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent || '';
    const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    let match;
    const parts: (string | { ts: string })[] = [];
    let lastIndex = 0;

    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push({ ts: match[1] });
      lastIndex = re.lastIndex;
    }

    if (!parts.some(p => typeof p !== 'string')) continue;

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (typeof part === 'string') {
        frag.appendChild(document.createTextNode(part));
      } else {
        const badge = document.createElement('span');
        badge.contentEditable = 'false';
        badge.setAttribute('data-ts', part.ts);
        badge.className = 'ts-badge';
        badge.textContent = part.ts;
        frag.appendChild(badge);
        lastNewBadge = badge;
      }
    }

    textNode.parentNode!.replaceChild(frag, textNode);
  }

  return lastNewBadge;
}

/** Place caret at end of element */
function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
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
  onFocus,
  onBlur,
  actions,
  topBar,
}: TextInputProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const lastSyncedRef = useRef(value);
  const isComposingRef = useRef(false);

  // Sync internal ref to external ref
  useEffect(() => {
    if (externalRef && 'current' in externalRef) {
      (externalRef as { current: HTMLElement | null }).current = internalRef.current;
    }
  }, [externalRef]);

  // Set initial content
  useEffect(() => {
    if (internalRef.current) {
      internalRef.current.innerHTML = valueToHtml(value);
      lastSyncedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when value changes externally (cleared after submit, set by @ chip, etc.)
  useEffect(() => {
    if (!internalRef.current) return;
    if (value !== lastSyncedRef.current) {
      internalRef.current.innerHTML = valueToHtml(value);
      lastSyncedRef.current = value;
      if (value && document.activeElement === internalRef.current) {
        placeCaretAtEnd(internalRef.current);
      }
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = internalRef.current;
    if (!el || isComposingRef.current) return;

    // Sanitize: remove <br>/<div>/<p> injected by browser line-break behavior
    el.querySelectorAll('br').forEach(br => br.remove());
    el.querySelectorAll('div, p').forEach(d => {
      while (d.firstChild) d.parentNode!.insertBefore(d.firstChild, d);
      d.remove();
    });

    // Convert completed [M:SS] patterns in text nodes to badge spans
    const newBadge = tokenizeTimestamps(el);

    // Place cursor after the newly created badge
    if (newBadge) {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStartAfter(newBadge);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    // Extract and sync
    const raw = extractValue(el);
    lastSyncedRef.current = raw;
    onChange(raw);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Shift+Tab toggles Explore Mode
    if (e.key === 'Tab' && e.shiftKey && onToggleExplore) {
      e.preventDefault();
      onToggleExplore();
      return;
    }

    // Enter submits (block all Enter to keep single-line)
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.shiftKey && !isStreaming && value.trim()) {
        onSubmit();
      }
    }
  }, [onSubmit, isStreaming, value, onToggleExplore]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ');
    document.execCommand('insertText', false, text);
  }, []);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  useEffect(() => {
    if (autoFocus && internalRef.current) {
      setTimeout(() => internalRef.current?.focus(), 100);
    }
  }, [autoFocus]);

  const resolvedPlaceholder = exploreMode ? 'Ask anything...' : placeholder;
  const isEmpty = !value;

  return (
    <div className="flex-1 flex flex-col min-h-[44px] md:min-h-[88px] rounded-xl bg-white/[0.06] focus-within:bg-white/[0.10] transition-colors duration-200">
      {topBar}
      <div className="flex-1 relative">
        {isEmpty && (
          <div className="absolute inset-0 px-3 pt-2.5 pb-1 text-sm text-slate-600 pointer-events-none select-none">
            {resolvedPlaceholder}
          </div>
        )}
        <div
          ref={internalRef}
          contentEditable={!disabled && !isStreaming}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={onFocus}
          onBlur={onBlur}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          role="textbox"
          aria-label={resolvedPlaceholder}
          className="w-full min-h-[20px] px-3 pt-2.5 pb-1 text-sm text-chalk-text focus:outline-none whitespace-pre-wrap break-words [&_.ts-badge]:inline-flex [&_.ts-badge]:items-center [&_.ts-badge]:text-blue-400 [&_.ts-badge]:bg-blue-500/20 [&_.ts-badge]:rounded [&_.ts-badge]:px-1.5 [&_.ts-badge]:py-0.5 [&_.ts-badge]:text-xs [&_.ts-badge]:font-mono [&_.ts-badge]:mx-0.5 [&_.ts-badge]:align-baseline [&_.ts-badge]:leading-none"
        />
      </div>
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <div>
          {onToggleExplore && (
            <button
              type="button"
              onClick={onToggleExplore}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-medium transition-all ${
                exploreMode
                  ? 'bg-chalk-accent/15 text-chalk-accent hover:bg-chalk-accent/25'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white/80'
              }`}
              title="Toggle Explore Mode (Shift+Tab)"
              aria-label={exploreMode ? 'Exit Explore Mode' : 'Start Explore Mode'}
              aria-pressed={exploreMode}
            >
              Explore
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {actions}
        </div>
      </div>
    </div>
  );
}
