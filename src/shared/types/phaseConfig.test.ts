import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PHASE_CONFIG,
  DEFAULT_VACE_PHASE_CONFIG,
  buildBasicModePhaseConfig,
} from './phaseConfig';

describe('phaseConfig', () => {
  it('builds config from the expected base model', () => {
    const i2vConfig = buildBasicModePhaseConfig(false, 0.5, []);
    const vaceConfig = buildBasicModePhaseConfig(true, 0.5, []);

    expect(i2vConfig.num_phases).toBe(DEFAULT_PHASE_CONFIG.num_phases);
    expect(vaceConfig.num_phases).toBe(DEFAULT_VACE_PHASE_CONFIG.num_phases);
  });

  it('routes multi-stage loras to early and final phases', () => {
    const config = buildBasicModePhaseConfig(false, 0.5, [
      {
        path: 'https://example.com/high.safetensors',
        lowNoisePath: 'https://example.com/low.safetensors',
        strength: 0.8,
        isMultiStage: true,
      },
    ]);

    const firstPhaseUrls = config.phases[0].loras.map((lora) => lora.url);
    const lastPhaseUrls = config.phases[config.phases.length - 1].loras.map((lora) => lora.url);

    expect(firstPhaseUrls).toContain('https://example.com/high.safetensors');
    expect(lastPhaseUrls).toContain('https://example.com/low.safetensors');
  });

  it('applies single-stage loras to all phases', () => {
    const config = buildBasicModePhaseConfig(false, 0.5, [
      {
        path: 'https://example.com/shared.safetensors',
        strength: 0.6,
      },
    ]);

    for (const phase of config.phases) {
      expect(phase.loras.some((lora) => lora.url === 'https://example.com/shared.safetensors')).toBe(true);
    }
  });
});
