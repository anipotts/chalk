import { useReducer, useCallback } from 'react';

// --- Phase type ---

export type OverlayPhase = 'watching' | 'chatting';

// --- Action types ---

export type OverlayAction =
  | { type: 'ACTIVATE' }
  | { type: 'CLICK_AWAY' }
  | { type: 'ESCAPE' }
  | { type: 'CLOSE' }
  | { type: 'CONTENT_ARRIVED' }
  | { type: 'VOICE_START' };

// --- State ---

interface OverlayState {
  phase: OverlayPhase;
}

// --- Reducer ---

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  const { phase } = state;

  switch (action.type) {
    case 'ACTIVATE':
    case 'CONTENT_ARRIVED':
    case 'VOICE_START':
      if (phase === 'watching') return { phase: 'chatting' };
      return state;

    case 'CLICK_AWAY':
    case 'ESCAPE':
    case 'CLOSE':
      if (phase === 'chatting') return { phase: 'watching' };
      return state;

    default:
      return state;
  }
}

// --- Hook ---

export function useOverlayPhase() {
  const [state, dispatch] = useReducer(overlayReducer, {
    phase: 'watching' as OverlayPhase,
  });

  const wrappedDispatch = useCallback((action: OverlayAction) => {
    dispatch(action);
  }, []);

  return {
    phase: state.phase,
    dispatch: wrappedDispatch,
  };
}
