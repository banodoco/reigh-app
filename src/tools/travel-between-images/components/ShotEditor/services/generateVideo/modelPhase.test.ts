import { describe, expect, it } from 'vitest';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { ValidationError } from '@/shared/lib/errorHandling/errors';
import {
  buildBasicModeGenerationRequest,
  resolveModelPhaseSelection,
  validatePhaseConfigConsistency,
} from './modelPhase';

function makePhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 3],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1, loras: [] },
      { phase: 2, guidance_scale: 1, loras: [] },
    ],
    ...overrides,
  };
}

describe('modelPhase', () => {
  it('builds a baseline basic-mode model request with user LoRAs', () => {
    const result = buildBasicModeGenerationRequest(60, [
      { path: '/lora/style.safetensors', strength: 0.35 },
    ]);

    expect(result.model).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
    expect(result.phaseConfig.num_phases).toBe(2);
    expect(result.phaseConfig.phases[0]?.loras.some((lora) => lora.url === '/lora/style.safetensors')).toBe(true);
  });

  it('uses advanced mode selection when advanced settings are valid', () => {
    const advancedConfig = makePhaseConfig({ num_phases: 2, steps_per_phase: [2, 2] });
    const result = resolveModelPhaseSelection(
      75,
      true,
      advancedConfig,
      'standard',
      [{ id: '1', path: '/x', strength: '0.5', name: 'x' }] as never,
    );

    expect(result.useAdvancedMode).toBe(true);
    expect(result.actualModelName).toBe('wan_2_2_i2v_lightning_baseline_3_3');
    expect(result.effectivePhaseConfig).toBe(advancedConfig);
  });

  it('falls back to basic mode when motion mode is basic', () => {
    const advancedConfig = makePhaseConfig({ num_phases: 3 });
    const result = resolveModelPhaseSelection(
      40,
      true,
      advancedConfig,
      'basic',
      [{ id: '1', path: '/x', strength: '0.25', name: 'x' }] as never,
    );

    expect(result.useAdvancedMode).toBe(false);
    expect(result.actualModelName).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
    expect(result.effectivePhaseConfig.num_phases).toBe(2);
  });

  it('validates phase array lengths against num_phases', () => {
    expect(() => validatePhaseConfigConsistency(makePhaseConfig())).not.toThrow();

    const invalid = makePhaseConfig({
      num_phases: 3,
      steps_per_phase: [3, 3],
      phases: [
        { phase: 1, guidance_scale: 1, loras: [] },
        { phase: 2, guidance_scale: 1, loras: [] },
      ],
    });

    expect(() => validatePhaseConfigConsistency(invalid)).toThrow(ValidationError);
  });
});
