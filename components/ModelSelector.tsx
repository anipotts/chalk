'use client';

import { useState, useRef, useEffect } from 'react';

export type ModelChoice = 'auto' | 'opus' | 'sonnet' | 'haiku';

interface ModelOption {
  id: ModelChoice;
  label: string;
  sublabel: string;
  badge?: string;
}

const MODELS: ModelOption[] = [
  { id: 'auto', label: 'Auto', sublabel: 'Routes by complexity' },
  { id: 'opus', label: 'Opus 4.6', sublabel: 'Most intelligent', badge: 'Deep' },
  { id: 'sonnet', label: 'Sonnet 4.5', sublabel: 'Speed + intelligence', badge: 'Fast' },
  { id: 'haiku', label: 'Haiku 4.5', sublabel: 'Fastest', badge: 'Instant' },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

interface ModelSelectorProps {
  value: ModelChoice;
  onChange: (model: ModelChoice) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = MODELS.find((m) => m.id === value) || MODELS[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`
          flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium
          transition-all duration-150 cursor-pointer select-none
          ${open
            ? 'bg-chalk-accent/15 border border-chalk-accent/40 text-chalk-accent'
            : 'bg-chalk-surface/60 border border-chalk-border/30 text-slate-400 hover:text-slate-300 hover:border-chalk-border/50'
          }
          disabled:opacity-40 disabled:cursor-not-allowed
        `}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronIcon open={open} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl bg-chalk-surface border border-chalk-border/40 shadow-xl shadow-black/30 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="p-1">
            {MODELS.map((model) => {
              const isActive = model.id === value;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    transition-colors duration-100
                    ${isActive
                      ? 'bg-chalk-accent/10 text-chalk-text'
                      : 'text-slate-300 hover:bg-chalk-bg/60'
                    }
                  `}
                >
                  {/* Radio dot */}
                  <div className={`
                    w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                    ${isActive ? 'border-chalk-accent' : 'border-slate-500'}
                  `}>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-chalk-accent" />
                    )}
                  </div>

                  {/* Label + sublabel */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isActive ? 'text-chalk-text' : ''}`}>
                        {model.label}
                      </span>
                      {model.badge && (
                        <span className={`
                          text-[10px] font-medium px-1.5 py-0.5 rounded-full
                          ${isActive
                            ? 'bg-chalk-accent/20 text-chalk-accent'
                            : 'bg-chalk-bg/60 text-slate-500'
                          }
                        `}>
                          {model.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">{model.sublabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
