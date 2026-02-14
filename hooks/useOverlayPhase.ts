import { useReducer, useRef, useState, useEffect, useCallback } from 'react';

// --- Phase type ---

export type OverlayPhase = 'dormant' | 'input' | 'conversing' | 'lingering';

// --- Action types ---

export type OverlayAction =
  | { type: 'KEYPRESS'; char: string }
  | { type: 'FOCUS_INPUT' }
  | { type: 'CLICK_VIDEO' }
  | { type: 'ESCAPE' }
  | { type: 'CLOSE' }
  | { type: 'BLUR_INPUT'; hasContent: boolean; hasExchanges: boolean }
  | { type: 'CONTENT_ARRIVED' }
  | { type: 'VOICE_START' }
  | { type: 'VIDEO_PLAY'; hasExchanges: boolean }
  | { type: 'VIDEO_PAUSE' }
  | { type: 'LINGER_EXPIRE' }
  | { type: 'INTERACT' }
  | { type: 'PENDING_CHAR_CONSUMED' };

// --- State ---

interface OverlayState {
  phase: OverlayPhase;
  pendingChar: string | null;
}

// --- Reducer ---

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  const { phase } = state;

  switch (action.type) {
    case 'KEYPRESS':
      if (phase === 'dormant') {
        return { phase: 'input', pendingChar: action.char };
      }
      return state;

    case 'FOCUS_INPUT':
      if (phase === 'dormant') {
        return { ...state, phase: 'input' };
      }
      if (phase === 'lingering') {
        return { ...state, phase: 'conversing' };
      }
      return state;

    case 'CLICK_VIDEO':
      if (phase === 'dormant') {
        return { ...state, phase: 'input' };
      }
      if (phase === 'input') {
        return { ...state, phase: 'dormant' };
      }
      return state;

    case 'ESCAPE':
    case 'CLOSE':
      if (phase === 'dormant') return state;
      return { phase: 'dormant', pendingChar: null };

    case 'BLUR_INPUT':
      if (phase === 'input' && !action.hasContent && !action.hasExchanges) {
        return { ...state, phase: 'dormant' };
      }
      return state;

    case 'CONTENT_ARRIVED':
      if (phase === 'dormant' || phase === 'input') {
        return { ...state, phase: 'conversing' };
      }
      if (phase === 'lingering') {
        return { ...state, phase: 'conversing' };
      }
      return state;

    case 'VOICE_START':
      if (phase !== 'conversing') {
        return { ...state, phase: 'conversing' };
      }
      return state;

    case 'VIDEO_PLAY':
      if (phase === 'conversing') {
        return { ...state, phase: action.hasExchanges ? 'lingering' : 'dormant' };
      }
      return state;

    case 'VIDEO_PAUSE':
      if (phase === 'lingering') {
        return { ...state, phase: 'conversing' };
      }
      return state;

    case 'LINGER_EXPIRE':
      if (phase === 'lingering') {
        return { phase: 'dormant', pendingChar: null };
      }
      return state;

    case 'INTERACT':
      if (phase === 'lingering') {
        return { ...state, phase: 'conversing' };
      }
      return state;

    case 'PENDING_CHAR_CONSUMED':
      if (state.pendingChar !== null) {
        return { ...state, pendingChar: null };
      }
      return state;

    default:
      return state;
  }
}

// --- Linger duration constants ---

const LINGER_DURATION_MS = 12_000;
const LINGER_GRACE_MS = 4_000; // Full opacity for first 4s

/**
 * Compute visual progress (0→1) from elapsed time.
 * 0–4s: 0 (grace period), 4–12s: linear 0→1
 */
function computeLingerProgress(elapsedMs: number): number {
  if (elapsedMs <= LINGER_GRACE_MS) return 0;
  return Math.min(1, (elapsedMs - LINGER_GRACE_MS) / (LINGER_DURATION_MS - LINGER_GRACE_MS));
}

// --- Hook ---

export function useOverlayPhase() {
  const [state, dispatch] = useReducer(overlayReducer, {
    phase: 'dormant' as OverlayPhase,
    pendingChar: null,
  });

  // Progressive fade: lingerProgress tracks 0→1 over 12s
  const [lingerProgress, setLingerProgress] = useState(0);
  const lingerStartRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // Start/stop linger timer based on phase
  useEffect(() => {
    if (state.phase === 'lingering') {
      lingerStartRef.current = performance.now();
      setLingerProgress(0);

      const tick = () => {
        if (!lingerStartRef.current) return;
        const elapsed = performance.now() - lingerStartRef.current;
        const progress = computeLingerProgress(elapsed);
        setLingerProgress(progress);

        if (elapsed >= LINGER_DURATION_MS) {
          dispatch({ type: 'LINGER_EXPIRE' });
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafRef.current);
        lingerStartRef.current = null;
      };
    } else {
      // Reset when not lingering
      setLingerProgress(0);
      lingerStartRef.current = null;
      cancelAnimationFrame(rafRef.current);
    }
  }, [state.phase]);

  // Wrapped dispatch that also cancels linger on INTERACT
  const wrappedDispatch = useCallback((action: OverlayAction) => {
    dispatch(action);
  }, []);

  return {
    phase: state.phase,
    pendingChar: state.pendingChar,
    lingerProgress,
    dispatch: wrappedDispatch,
  };
}
