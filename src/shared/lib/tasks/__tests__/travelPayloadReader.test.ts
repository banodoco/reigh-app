import { describe, expect, it } from 'vitest';
import { buildTaskPayloadSnapshot } from '../taskPayloadSnapshot';
import {
  createTravelPayloadReader,
  resolveTravelPairShotGenerationId,
} from '../travelPayloadReader';

function buildSnapshot() {
  return buildTaskPayloadSnapshot({
    prompt: 'raw prompt',
    pair_shot_generation_id: 'pair-raw',
    orchestrator_details: {
      prompt: 'orchestrator prompt',
      model_name: 'orchestrator-model',
      pair_shot_generation_id: 'pair-orchestrator',
    },
    full_orchestrator_payload: {
      prompt: 'full prompt',
    },
    family_contract: {
      read_contract: {
        prompt: 'family prompt',
        model_name: 'family-model',
      },
    },
    individual_segment_params: {
      prompt: 'segment prompt',
      pair_shot_generation_id: 'pair-segment',
    },
    task_view_contract: {
      input_images: ['start.png', 'end.png'],
      prompt: 'task-view prompt',
      resolution: '1024x576',
    },
  });
}

describe('travelPayloadReader', () => {
  it('uses default source precedence when reading values', () => {
    const reader = createTravelPayloadReader(buildSnapshot());

    expect(reader.pickString('prompt')).toBe('task-view prompt');
    expect(reader.pickString('model_name')).toBe('family-model');
    expect(reader.pickString('resolution')).toBe('1024x576');
  });

  it('supports per-read custom source order overrides', () => {
    const reader = createTravelPayloadReader(buildSnapshot());

    expect(
      reader.pickString('prompt', [
        'rawParams',
        'orchestratorDetails',
        'taskViewContract',
      ]),
    ).toBe('raw prompt');
  });

  it('resolves pair-shot generation id using explicit and fallback precedence', () => {
    const rawParams = {
      pair_shot_generation_id: 'pair-raw',
      orchestrator_details: { pair_shot_generation_id: 'pair-orchestrator' },
      individual_segment_params: { pair_shot_generation_id: 'pair-segment' },
    };

    expect(resolveTravelPairShotGenerationId(rawParams, 'pair-direct')).toBe('pair-direct');
    expect(resolveTravelPairShotGenerationId(rawParams)).toBe('pair-segment');
    expect(
      resolveTravelPairShotGenerationId({
        pair_shot_generation_id: 'pair-raw-only',
      }),
    ).toBe('pair-raw-only');
  });
});
