'use client';

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
      {/* Mic icon */}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
        <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 8 1Z" />
        <path d="M4 7a.75.75 0 0 0-1.5 0 5.5 5.5 0 0 0 4.75 5.45v1.8a.75.75 0 0 0 1.5 0v-1.8A5.5 5.5 0 0 0 13.5 7a.75.75 0 0 0-1.5 0 4 4 0 0 1-8 0Z" />
      </svg>
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
