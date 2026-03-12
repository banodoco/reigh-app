import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { MotionMode } from './families/individualTravelSegment/types';

export function asMotionMode(value: unknown): MotionMode | undefined {
  return value === 'basic' || value === 'presets' || value === 'advanced'
    ? value
    : undefined;
}

export function asPhaseConfig(value: unknown): PhaseConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as {
    num_phases?: unknown;
    steps_per_phase?: unknown;
    flow_shift?: unknown;
    sample_solver?: unknown;
    model_switch_phase?: unknown;
    phases?: unknown;
  };

  if (
    typeof candidate.num_phases !== 'number'
    || !Array.isArray(candidate.steps_per_phase)
    || !candidate.steps_per_phase.every((step) => typeof step === 'number')
    || typeof candidate.flow_shift !== 'number'
    || typeof candidate.sample_solver !== 'string'
    || typeof candidate.model_switch_phase !== 'number'
    || !Array.isArray(candidate.phases)
  ) {
    return undefined;
  }

  return value as PhaseConfig;
}
