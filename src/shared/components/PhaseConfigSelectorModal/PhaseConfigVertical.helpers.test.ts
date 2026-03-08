import { describe, expect, it } from 'vitest';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import {
  PHASE_LABELS_2,
  PHASE_LABELS_3,
  computePhaseTransition,
  updateLoraField,
} from './PhaseConfigVertical.helpers';

function buildPhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 5],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      {
        phase: 1,
        guidance_scale: 1,
        loras: [{ url: 'phase-1-lora', multiplier: '0.5' }],
      },
      {
        phase: 2,
        guidance_scale: 2,
        loras: [{ url: 'phase-2-lora', multiplier: '0.7' }],
      },
    ],
    ...overrides,
  };
}

describe('PhaseConfigVertical.helpers', () => {
  it('exposes stable labels for 2-phase and 3-phase modes', () => {
    expect(PHASE_LABELS_2).toEqual(['High Noise Sampler', 'Low Noise Sampler']);
    expect(PHASE_LABELS_3).toEqual([
      'High Noise Sampler 1',
      'High Noise Sampler 2',
      'Low Noise Sampler',
    ]);
  });

  it('expands a 2-phase config into 3 phases by duplicating the first phase', () => {
    const config = buildPhaseConfig();

    const transition = computePhaseTransition(config, 3);

    expect(transition.steps).toEqual([3, 3, 5]);
    expect(transition.phases).toHaveLength(3);
    expect(transition.phases.map((phase) => phase.phase)).toEqual([1, 2, 3]);
    expect(transition.phases[0].loras).toEqual(config.phases[0].loras);
    expect(transition.phases[1].loras).toEqual(config.phases[0].loras);
    expect(transition.phases[2].loras).toEqual(config.phases[1].loras);
    expect(transition.phases[0].loras).not.toBe(config.phases[0].loras);
  });

  it('compresses a 3-phase config into 2 phases by keeping first and last phases', () => {
    const config = buildPhaseConfig({
      num_phases: 3,
      steps_per_phase: [2, 4, 6],
      phases: [
        { phase: 1, guidance_scale: 1, loras: [{ url: 'a', multiplier: '0.3' }] },
        { phase: 2, guidance_scale: 2, loras: [{ url: 'b', multiplier: '0.4' }] },
        { phase: 3, guidance_scale: 3, loras: [{ url: 'c', multiplier: '0.5' }] },
      ],
    });

    const transition = computePhaseTransition(config, 2);

    expect(transition.steps).toEqual([2, 6]);
    expect(transition.phases.map((phase) => phase.phase)).toEqual([1, 2]);
    expect(transition.phases[0].loras).toEqual([{ url: 'a', multiplier: '0.3' }]);
    expect(transition.phases[1].loras).toEqual([{ url: 'c', multiplier: '0.5' }]);
  });

  it('pads missing phases and steps with defaults in generic transitions', () => {
    const config = buildPhaseConfig({
      phases: [{ phase: 1, guidance_scale: 1, loras: [] }],
      steps_per_phase: [9],
    });

    const transition = computePhaseTransition(config, 2);

    expect(transition.phases).toEqual([
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ]);
    expect(transition.steps).toEqual([9, 2]);
  });

  it('updates a single lora field immutably in the targeted phase and index', () => {
    const config = buildPhaseConfig({
      phases: [
        {
          phase: 1,
          guidance_scale: 1,
          loras: [
            { url: 'first', multiplier: '0.2' },
            { url: 'second', multiplier: '0.4' },
          ],
        },
        {
          phase: 2,
          guidance_scale: 1,
          loras: [{ url: 'third', multiplier: '0.6' }],
        },
      ],
    });

    const nextPhases = updateLoraField(config, 0, 1, 'multiplier', '0.9');

    expect(nextPhases[0].loras[1]).toEqual({ url: 'second', multiplier: '0.9' });
    expect(nextPhases[0].loras[0]).toEqual({ url: 'first', multiplier: '0.2' });
    expect(nextPhases[1]).toBe(config.phases[1]);
    expect(nextPhases[0]).not.toBe(config.phases[0]);
    expect(nextPhases[0].loras[1]).not.toBe(config.phases[0].loras[1]);
  });
});
