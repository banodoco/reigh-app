export const SCRIPTED_REPLAY_DURATION_MS = 12_000;
export const SCRIPTED_EXAMPLE_LABEL = 'Scripted example';

export const SCRIPTED_REPLAY_CUES = [
  { atMs: 0, id: 'source-media' },
  { atMs: 3_000, id: 'sequence' },
  { atMs: 6_000, id: 'timing' },
  { atMs: 9_000, id: 'result' },
] as const;

export const unavailableScriptedResult = (logicalKey: string) => ({
  logicalKey,
  availability: 'unavailable' as const,
  reason: 'awaiting_verified_project_and_export' as const,
});

export type ScriptedReplayCueId = (typeof SCRIPTED_REPLAY_CUES)[number]['id'];

export type ScriptedReplayStep = {
  id: ScriptedReplayCueId;
  title: string;
  detail: string;
  asset_ids?: readonly string[];
  clip_ids?: readonly string[];
  result_logical_key?: string;
  reveal_condition?: string;
};

export type ScriptedReplayScript = {
  fixture_version: string;
  label: string;
  logical_key: string;
  result_logical_key: string;
  request: string;
  response: string;
  steps: readonly ScriptedReplayStep[];
};

export type ScriptedReplayStatus = 'paused' | 'playing' | 'finished';

export type ScriptedReplayState = {
  elapsedMs: number;
  status: ScriptedReplayStatus;
  generation: number;
};

export type ScriptedReplayAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'RESET' }
  | { type: 'NEXT_STEP' }
  | { type: 'TICK'; deltaMs: number; generation: number };

export type ScriptedReplayPresentationStep = ScriptedReplayStep & { visible: boolean };

export type ScriptedReplayPresentation = {
  label: typeof SCRIPTED_EXAMPLE_LABEL;
  request: string;
  response: string;
  elapsedMs: number;
  status: ScriptedReplayStatus;
  currentStepId: ScriptedReplayCueId;
  visibleStepIds: ScriptedReplayCueId[];
  steps: ScriptedReplayPresentationStep[];
  result: ReturnType<typeof unavailableScriptedResult>;
};

const isNonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const cueAtOrBefore = (elapsedMs: number) =>
  SCRIPTED_REPLAY_CUES.filter((cue) => cue.atMs <= elapsedMs);

const nextCueAt = (elapsedMs: number) =>
  SCRIPTED_REPLAY_CUES.find((cue) => cue.atMs > elapsedMs)?.atMs;

export const createInitialScriptedReplayState = (): ScriptedReplayState => ({
  elapsedMs: 0,
  status: 'paused',
  generation: 0,
});

export const scriptedReplayReducer = (
  state: ScriptedReplayState,
  action: ScriptedReplayAction,
): ScriptedReplayState => {
  switch (action.type) {
    case 'PLAY':
      if (state.status === 'playing') return state;
      return state.status === 'finished'
        ? { elapsedMs: 0, status: 'playing', generation: state.generation + 1 }
        : { ...state, status: 'playing', generation: state.generation + 1 };
    case 'PAUSE':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'RESET':
      return { elapsedMs: 0, status: 'paused', generation: state.generation + 1 };
    case 'NEXT_STEP': {
      const elapsedMs = nextCueAt(state.elapsedMs);
      if (elapsedMs === undefined) return state;
      return {
        ...state,
        elapsedMs,
        status: 'paused',
      };
    }
    case 'TICK': {
      if (!isNonnegativeInteger(action.deltaMs)) {
        throw new TypeError('TICK deltaMs must be a nonnegative integer');
      }
      if (!isNonnegativeInteger(action.generation)) {
        throw new TypeError('TICK generation must be a nonnegative integer');
      }
      if (action.generation !== state.generation || state.status !== 'playing') return state;
      const elapsedMs = Math.min(SCRIPTED_REPLAY_DURATION_MS, state.elapsedMs + action.deltaMs);
      return {
        ...state,
        elapsedMs,
        status: elapsedMs === SCRIPTED_REPLAY_DURATION_MS ? 'finished' : 'playing',
      };
    }
  }
};

export const deriveScriptedReplayPresentation = (
  script: ScriptedReplayScript,
  state: ScriptedReplayState,
): ScriptedReplayPresentation => {
  const visibleStepIds = cueAtOrBefore(state.elapsedMs).map((cue) => cue.id);
  const currentStepId = visibleStepIds[visibleStepIds.length - 1] ?? 'source-media';

  return {
    label: SCRIPTED_EXAMPLE_LABEL,
    request: script.request,
    response: script.response,
    elapsedMs: state.elapsedMs,
    status: state.status,
    currentStepId,
    visibleStepIds,
    steps: script.steps.map((step) => ({ ...step, visible: visibleStepIds.includes(step.id) })),
    result: unavailableScriptedResult(script.result_logical_key),
  };
};
