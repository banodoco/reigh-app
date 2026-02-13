import { describe, it, expect } from 'vitest';
import {
  buildPhaseConfigWithLoras,
  DEFAULT_VACE_PHASE_CONFIG,
  VACE_GENERATION_DEFAULTS,
  BUILTIN_VACE_DEFAULT_ID,
} from '../vaceDefaults';

describe('VACE_GENERATION_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(VACE_GENERATION_DEFAULTS.model).toBe('wan_2_2_vace_lightning_baseline_2_2_2');
    expect(VACE_GENERATION_DEFAULTS.numInferenceSteps).toBe(6);
    expect(VACE_GENERATION_DEFAULTS.guidanceScale).toBe(3.0);
    expect(VACE_GENERATION_DEFAULTS.seed).toBe(-1);
    expect(VACE_GENERATION_DEFAULTS.randomSeed).toBe(true);
    expect(VACE_GENERATION_DEFAULTS.replaceMode).toBe(true);
    expect(VACE_GENERATION_DEFAULTS.negativePrompt).toBe('');
    expect(VACE_GENERATION_DEFAULTS.prompt).toBe('');
    expect(VACE_GENERATION_DEFAULTS.enhancePrompt).toBe(false);
    expect(VACE_GENERATION_DEFAULTS.motionMode).toBe('basic');
    expect(VACE_GENERATION_DEFAULTS.selectedPhasePresetId).toBe(BUILTIN_VACE_DEFAULT_ID);
  });
});

describe('DEFAULT_VACE_PHASE_CONFIG', () => {
  it('has 3 phases', () => {
    expect(DEFAULT_VACE_PHASE_CONFIG.num_phases).toBe(3);
    expect(DEFAULT_VACE_PHASE_CONFIG.phases).toHaveLength(3);
  });

  it('has correct steps per phase', () => {
    expect(DEFAULT_VACE_PHASE_CONFIG.steps_per_phase).toEqual([2, 2, 5]);
  });

  it('each phase has loras', () => {
    DEFAULT_VACE_PHASE_CONFIG.phases.forEach(phase => {
      expect(phase.loras.length).toBeGreaterThan(0);
    });
  });

  it('phases are numbered 1 through 3', () => {
    expect(DEFAULT_VACE_PHASE_CONFIG.phases.map(p => p.phase)).toEqual([1, 2, 3]);
  });
});

describe('buildPhaseConfigWithLoras', () => {
  it('returns base config when no user loras', () => {
    const result = buildPhaseConfigWithLoras([]);
    expect(result).toBe(DEFAULT_VACE_PHASE_CONFIG);
  });

  it('returns base config when undefined user loras', () => {
    const result = buildPhaseConfigWithLoras(undefined);
    expect(result).toBe(DEFAULT_VACE_PHASE_CONFIG);
  });

  it('adds user loras to every phase', () => {
    const userLoras = [
      { path: 'https://example.com/lora1.safetensors', strength: 0.75 },
    ];
    const result = buildPhaseConfigWithLoras(userLoras);

    expect(result.phases).toHaveLength(3);
    result.phases.forEach((phase, i) => {
      const baseLoras = DEFAULT_VACE_PHASE_CONFIG.phases[i].loras;
      expect(phase.loras).toHaveLength(baseLoras.length + 1);
      const addedLora = phase.loras[phase.loras.length - 1];
      expect(addedLora.url).toBe('https://example.com/lora1.safetensors');
      expect(addedLora.multiplier).toBe('0.75');
    });
  });

  it('adds multiple user loras', () => {
    const userLoras = [
      { path: 'https://example.com/lora1.safetensors', strength: 0.5 },
      { path: 'https://example.com/lora2.safetensors', strength: 1.0 },
    ];
    const result = buildPhaseConfigWithLoras(userLoras);

    result.phases.forEach((phase, i) => {
      const baseLoras = DEFAULT_VACE_PHASE_CONFIG.phases[i].loras;
      expect(phase.loras).toHaveLength(baseLoras.length + 2);
    });
  });

  it('filters out loras with empty path', () => {
    const userLoras = [
      { path: '', strength: 0.75 },
      { path: 'https://example.com/lora2.safetensors', strength: 1.0 },
    ];
    const result = buildPhaseConfigWithLoras(userLoras);

    result.phases.forEach((phase, i) => {
      const baseLoras = DEFAULT_VACE_PHASE_CONFIG.phases[i].loras;
      // Only 1 user lora should be added (the one with non-empty path)
      expect(phase.loras).toHaveLength(baseLoras.length + 1);
    });
  });

  it('formats strength to 2 decimal places', () => {
    const userLoras = [
      { path: 'https://example.com/lora.safetensors', strength: 0.333333 },
    ];
    const result = buildPhaseConfigWithLoras(userLoras);
    const addedLora = result.phases[0].loras[result.phases[0].loras.length - 1];
    expect(addedLora.multiplier).toBe('0.33');
  });

  it('does not mutate the base config', () => {
    const originalPhaseCount = DEFAULT_VACE_PHASE_CONFIG.phases[0].loras.length;
    const userLoras = [
      { path: 'https://example.com/lora.safetensors', strength: 1.0 },
    ];
    buildPhaseConfigWithLoras(userLoras);
    expect(DEFAULT_VACE_PHASE_CONFIG.phases[0].loras).toHaveLength(originalPhaseCount);
  });

  it('uses custom base config when provided', () => {
    const customConfig = {
      num_phases: 1,
      steps_per_phase: [5],
      flow_shift: 3.0,
      sample_solver: 'euler' as const,
      model_switch_phase: 1,
      mode: 'vace' as const,
      phases: [
        {
          phase: 1,
          guidance_scale: 2.0,
          loras: [{ url: 'https://example.com/base.safetensors', multiplier: '1.0' }],
        },
      ],
    };
    const userLoras = [
      { path: 'https://example.com/user.safetensors', strength: 0.5 },
    ];
    const result = buildPhaseConfigWithLoras(userLoras, customConfig);
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].loras).toHaveLength(2);
  });
});
