'use client';

import { Waveform } from '@phosphor-icons/react';

interface VoiceModeButtonProps {
  active: boolean;
  onClick: () => void;
  isCloning?: boolean;
  hasClone?: boolean;
}

export function VoiceModeButton({ active, onClick, isCloning, hasClone }: VoiceModeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors relative ${
        active
          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
          : 'text-slate-500 hover:text-slate-300 bg-chalk-surface/50 border border-chalk-border/30'
      }`}
      title={active ? 'Voice mode active (V)' : 'Toggle voice mode (V)'}
    >
      <Waveform size={12} weight="bold" />
      Voice
      {/* Clone status indicator */}
      {isCloning && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Cloning voice..." />
      )}
      {hasClone && !isCloning && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" title="Voice cloned" />
      )}
    </button>
  );
}
