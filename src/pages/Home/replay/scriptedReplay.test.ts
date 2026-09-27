import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCRIPTED_EXAMPLE_LABEL,
  SCRIPTED_REPLAY_CUES,
  SCRIPTED_REPLAY_DURATION_MS,
  UNAVAILABLE_SCRIPTED_RESULT,
  createInitialScriptedReplayState,
  deriveScriptedReplayPresentation,
  scriptedReplayReducer,
  type ScriptedReplayScript,
  type ScriptedReplayState,
} from './scriptedReplay';

const fixturePath = path.resolve(
  process.cwd(),
  '../../runs/astrid-2026-09-25/evidence/C01/light-study-v1/scripted-example.json',
);
const script = JSON.parse(readFileSync(fixturePath, 'utf8')) as ScriptedReplayScript;

const tick = (state: ScriptedReplayState, deltaMs: number): ScriptedReplayState =>
  scriptedReplayReducer(state, { type: 'TICK', deltaMs, generation: state.generation });

describe('scripted replay mechanism', () => {
  it('uses the C01 label and complete request/response without duplicating fixture prose', () => {
    const presentation = deriveScriptedReplayPresentation(script, createInitialScriptedReplayState());

    expect(presentation.label).toBe(SCRIPTED_EXAMPLE_LABEL);
    expect(presentation.request).toBe(script.request);
    expect(presentation.response).toBe(script.response);
    expect(presentation.steps.map(({ id }) => id)).toEqual(SCRIPTED_REPLAY_CUES.map(({ id }) => id));
  });

  it('reveals ordered step IDs at exact cue boundaries and finishes at 12 seconds', () => {
    let state = createInitialScriptedReplayState();
    expect(deriveScriptedReplayPresentation(script, state).visibleStepIds).toEqual(['source-media']);

    state = scriptedReplayReducer(state, { type: 'PLAY' });
    const playingGeneration = state.generation;
    for (const [index, cue] of SCRIPTED_REPLAY_CUES.slice(1).entries()) {
      state = tick(state, cue.atMs - (SCRIPTED_REPLAY_CUES[index].atMs ?? 0));
      expect(deriveScriptedReplayPresentation(script, state).visibleStepIds).toEqual(
        SCRIPTED_REPLAY_CUES.slice(0, index + 2).map(({ id }) => id),
      );
    }

    state = tick(state, 3_000);
    expect(state).toEqual({ elapsedMs: SCRIPTED_REPLAY_DURATION_MS, status: 'finished', generation: playingGeneration });
    expect(deriveScriptedReplayPresentation(script, state).visibleStepIds).toEqual(
      SCRIPTED_REPLAY_CUES.map(({ id }) => id),
    );
  });

  it('supports pause, resume, reset, replay after finish, and clamp', () => {
    let state = scriptedReplayReducer(createInitialScriptedReplayState(), { type: 'PLAY' });
    state = tick(state, 1_250);
    state = scriptedReplayReducer(state, { type: 'PAUSE' });
    expect(state).toMatchObject({ elapsedMs: 1_250, status: 'paused' });
    const pausedGeneration = state.generation;
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    expect(state.generation).toBe(pausedGeneration + 1);
    state = tick(state, 99_999);
    expect(state.status).toBe('finished');
    const generationAfterFinish = state.generation;
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    expect(state).toEqual({ elapsedMs: 0, status: 'playing', generation: generationAfterFinish + 1 });
    state = scriptedReplayReducer(state, { type: 'RESET' });
    expect(state).toEqual({ elapsedMs: 0, status: 'paused', generation: generationAfterFinish + 2 });
  });

  it('advances manually and is a no-op after the final boundary', () => {
    let state = createInitialScriptedReplayState();
    state = scriptedReplayReducer(state, { type: 'NEXT_STEP' });
    expect(state).toMatchObject({ elapsedMs: 3_000, status: 'paused' });
    state = scriptedReplayReducer(state, { type: 'NEXT_STEP' });
    state = scriptedReplayReducer(state, { type: 'NEXT_STEP' });
    state = scriptedReplayReducer(state, { type: 'NEXT_STEP' });
    expect(state).toMatchObject({ elapsedMs: 9_000, status: 'paused' });
    expect(scriptedReplayReducer(state, { type: 'NEXT_STEP' })).toBe(state);
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    const resumedGeneration = state.generation;
    expect(scriptedReplayReducer(state, { type: 'NEXT_STEP' })).toBe(state);
    state = tick(state, 3_000);
    expect(state).toMatchObject({ elapsedMs: SCRIPTED_REPLAY_DURATION_MS, status: 'finished', generation: resumedGeneration });
    expect(scriptedReplayReducer(state, { type: 'NEXT_STEP' })).toBe(state);
  });

  it('keeps the final cue stable while paused or playing before TICK finishes', () => {
    let paused = createInitialScriptedReplayState();
    paused = scriptedReplayReducer(paused, { type: 'PLAY' });
    paused = tick(paused, 9_000);
    paused = scriptedReplayReducer(paused, { type: 'PAUSE' });
    expect(paused.elapsedMs).toBe(9_000);
    expect(scriptedReplayReducer(paused, { type: 'NEXT_STEP' })).toBe(paused);

    let playing = scriptedReplayReducer(paused, { type: 'PLAY' });
    const playingGeneration = playing.generation;
    expect(scriptedReplayReducer(playing, { type: 'NEXT_STEP' })).toBe(playing);
    playing = tick(playing, 2_999);
    expect(playing).toMatchObject({ elapsedMs: 11_999, status: 'playing', generation: playingGeneration });
    expect(scriptedReplayReducer(playing, { type: 'NEXT_STEP' })).toBe(playing);
    playing = tick(playing, 1);
    expect(playing.status).toBe('finished');
    expect(scriptedReplayReducer(playing, { type: 'NEXT_STEP' })).toBe(playing);
  });

  it('rejects stale ticks and invalid timing inputs', () => {
    let state = scriptedReplayReducer(createInitialScriptedReplayState(), { type: 'PLAY' });
    const staleGeneration = state.generation;
    state = scriptedReplayReducer(state, { type: 'RESET' });
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: staleGeneration })).toBe(state);
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    expect(state.generation).toBe(staleGeneration + 2);
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: staleGeneration })).toBe(state);
    expect(tick(state, 500).elapsedMs).toBe(500);
    expect(() => scriptedReplayReducer(state, { type: 'TICK', deltaMs: -1, generation: state.generation })).toThrow(
      'nonnegative integer',
    );
    expect(() => scriptedReplayReducer(state, { type: 'TICK', deltaMs: 1.5, generation: state.generation })).toThrow(
      'nonnegative integer',
    );
  });

  it('rejects stale ticks after pause/resume, manual step/resume, reset, and replay', () => {
    let state = scriptedReplayReducer(createInitialScriptedReplayState(), { type: 'PLAY' });
    const firstGeneration = state.generation;
    state = tick(state, 1_000);
    state = scriptedReplayReducer(state, { type: 'PAUSE' });
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    const resumedGeneration = state.generation;
    expect(resumedGeneration).toBe(firstGeneration + 1);
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: firstGeneration })).toBe(state);
    state = tick(state, 500);
    expect(state.elapsedMs).toBe(1_500);

    state = scriptedReplayReducer(state, { type: 'RESET' });
    const resetGeneration = state.generation;
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: resumedGeneration })).toBe(state);
    state = scriptedReplayReducer(state, { type: 'NEXT_STEP' });
    const steppedGeneration = state.generation;
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    const manuallyResumedGeneration = state.generation;
    expect(manuallyResumedGeneration).toBe(steppedGeneration + 1);
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: steppedGeneration })).toBe(state);
    state = scriptedReplayReducer(state, { type: 'RESET' });
    expect(state.generation).toBe(resetGeneration + 2);

    state = scriptedReplayReducer(state, { type: 'PLAY' });
    state = tick(state, SCRIPTED_REPLAY_DURATION_MS);
    const finishedGeneration = state.generation;
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    expect(state.generation).toBe(finishedGeneration + 1);
    expect(scriptedReplayReducer(state, { type: 'TICK', deltaMs: 500, generation: finishedGeneration })).toBe(state);
    expect(tick(state, 500).elapsedMs).toBe(500);
  });

  it('keeps disclosure and the unavailable result truthful at every replay state', () => {
    let state = createInitialScriptedReplayState();
    const inspect = () => {
      const presentation = deriveScriptedReplayPresentation(script, state);
      expect(presentation.label).toBe(SCRIPTED_EXAMPLE_LABEL);
      expect(presentation.result).toEqual(UNAVAILABLE_SCRIPTED_RESULT);
      expect(Object.keys(presentation.result)).toEqual(['logicalKey', 'availability', 'reason']);
    };
    inspect();
    state = scriptedReplayReducer(state, { type: 'PLAY' });
    inspect();
    state = tick(state, 9_000);
    inspect();
    state = tick(state, 3_000);
    inspect();
    state = scriptedReplayReducer(state, { type: 'RESET' });
    inspect();
  });

  it('is deterministic, input-immutable, and has no UI/editor coupling', () => {
    const state = createInitialScriptedReplayState();
    const scriptSnapshot = JSON.stringify(script);
    const stateSnapshot = JSON.stringify(state);
    const reduceAll = () => {
      let next = scriptedReplayReducer(state, { type: 'PLAY' });
      next = scriptedReplayReducer(next, { type: 'TICK', deltaMs: 3_000, generation: next.generation });
      return scriptedReplayReducer(next, { type: 'NEXT_STEP' });
    };

    expect(reduceAll()).toEqual(reduceAll());
    expect(JSON.stringify(script)).toBe(scriptSnapshot);
    expect(JSON.stringify(state)).toBe(stateSnapshot);

    const source = readFileSync(path.resolve(process.cwd(), 'src/pages/Home/replay/scriptedReplay.ts'), 'utf8');
    expect(source).not.toMatch(/react|document|window|localStorage|fetch|setTimeout|setInterval|playhead|seek/i);
    expect(source).not.toMatch(/artifactId|artifact_id|openResult|playResult|autoplay/i);
  });
});
