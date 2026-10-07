export type PublicAstridReadinessPhase =
  | 'loading'
  | 'module-ready'
  | 'usable'
  | 'presenting'
  | 'settled'
  | 'error';

export type PublicAstridReadinessSignal = 'media' | 'inspector' | 'timeline';

export interface PublicAstridReadiness {
  attempt: number;
  phase: PublicAstridReadinessPhase;
  moduleReady: boolean;
  mediaReady: boolean;
  mediaFallback: boolean;
  inspectorReady: boolean;
  inspectorFallback: boolean;
  timelineReady: boolean;
  timelineFallback: boolean;
  errorMessage: string | null;
  lastEvent: 'load' | 'retry' | 'module-ready' | PublicAstridReadinessSignal | 'present' | 'settled' | 'error';
}

export type PublicAstridReadinessEvent =
  | { type: 'module-ready'; attempt: number }
  | { type: 'media-ready'; attempt: number }
  | { type: 'media-fallback'; attempt: number }
  | { type: 'inspector-ready'; attempt: number }
  | { type: 'inspector-fallback'; attempt: number }
  | { type: 'timeline-ready'; attempt: number }
  | { type: 'timeline-fallback'; attempt: number }
  | { type: 'present'; attempt: number }
  | { type: 'settled'; attempt: number }
  | { type: 'error'; attempt: number; message: string };

export function createPublicAstridReadiness(attempt = 0): PublicAstridReadiness {
  return {
    attempt,
    phase: 'loading',
    moduleReady: false,
    mediaReady: false,
    mediaFallback: false,
    inspectorReady: false,
    inspectorFallback: false,
    timelineReady: false,
    timelineFallback: false,
    errorMessage: null,
    lastEvent: 'load',
  };
}

export function retryPublicAstridReadiness(state: PublicAstridReadiness): PublicAstridReadiness {
  return {
    ...createPublicAstridReadiness(state.attempt + 1),
    lastEvent: 'retry',
  };
}

export function isPublicAstridReadinessUsable(state: PublicAstridReadiness): boolean {
  return state.moduleReady
    && state.mediaReady
    && state.inspectorReady
    && state.timelineReady;
}

function phaseBeforePresentation(state: PublicAstridReadiness): PublicAstridReadinessPhase {
  if (!state.moduleReady) return 'loading';
  return isPublicAstridReadinessUsable(state) ? 'usable' : 'module-ready';
}

/**
 * Reduce one editor-attempt event. Attempt identity is part of every event so a late lazy import,
 * media callback, or readiness signal cannot advance a newer retry.
 */
export function reducePublicAstridReadiness(
  state: PublicAstridReadiness,
  event: PublicAstridReadinessEvent,
): PublicAstridReadiness {
  if (event.attempt !== state.attempt) return state;
  if (state.phase === 'error' && event.type !== 'error') return state;

  switch (event.type) {
    case 'module-ready': {
      if (state.moduleReady) return state;
      const next = { ...state, moduleReady: true, errorMessage: null, lastEvent: 'module-ready' as const };
      return { ...next, phase: phaseBeforePresentation(next) };
    }
    case 'media-ready':
      return withSignal(state, 'media', false);
    case 'media-fallback':
      return withSignal(state, 'media', true);
    case 'inspector-ready':
      return withSignal(state, 'inspector', false);
    case 'inspector-fallback':
      return withSignal(state, 'inspector', true);
    case 'timeline-ready':
      return withSignal(state, 'timeline', false);
    case 'timeline-fallback':
      return withSignal(state, 'timeline', true);
    case 'present':
      if (state.phase === 'presenting' || state.phase === 'settled') return state;
      if (!isPublicAstridReadinessUsable(state)) return state;
      return { ...state, phase: 'presenting', lastEvent: 'present' };
    case 'settled':
      if (state.phase === 'settled') return state;
      if (state.phase !== 'presenting') return state;
      return { ...state, phase: 'settled', lastEvent: 'settled' };
    case 'error':
      if (state.phase === 'error' && state.errorMessage === event.message) return state;
      return { ...state, phase: 'error', errorMessage: event.message, lastEvent: 'error' };
  }
}

function withSignal(
  state: PublicAstridReadiness,
  signal: PublicAstridReadinessSignal,
  fallback: boolean,
): PublicAstridReadiness {
  const readyKey = `${signal}Ready` as keyof PublicAstridReadiness;
  const fallbackKey = `${signal}Fallback` as keyof PublicAstridReadiness;
  if (state[readyKey] === true && state[fallbackKey] === fallback) return state;
  const next = {
    ...state,
    [`${signal}Ready`]: true,
    [`${signal}Fallback`]: fallback,
    lastEvent: signal,
  } as PublicAstridReadiness;
  return { ...next, phase: phaseBeforePresentation(next) };
}
