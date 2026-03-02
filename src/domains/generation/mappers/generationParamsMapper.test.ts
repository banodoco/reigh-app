import { describe, expect, it } from 'vitest';
import {
  toGenerationParams,
  toPersistedGenerationParams,
} from '@/domains/generation/mappers/generationParamsMapper';

describe('generationParamsMapper payload validation', () => {
  it('sanitizes known orchestratorDetails fields with invalid types', () => {
    const result = toGenerationParams({
      orchestrator_details: {
        prompt: 'valid prompt',
        seed_base: 'invalid-number',
        additional_loras: {
          validLora: 0.8,
          invalidLora: 'bad',
        },
        motion_mode: 'invalid-mode',
        selected_phase_preset_id: 10,
        passthrough: true,
      },
    });

    expect(result.orchestratorDetails).toEqual({
      prompt: 'valid prompt',
      additional_loras: {
        validLora: 0.8,
      },
      passthrough: true,
    });
  });

  it('sanitizes known extra fields while preserving unknown fields', () => {
    const result = toPersistedGenerationParams({
      extra: {
        source: 'gallery',
        file_size: 'bad',
        keep: 123,
      },
    });

    expect(result.extra).toEqual({
      source: 'gallery',
      keep: 123,
    });
  });

  it('drops non-object orchestrator payloads', () => {
    const result = toGenerationParams({
      orchestratorDetails: 'invalid',
    });

    expect(result.orchestratorDetails).toBeUndefined();
  });

  it('prefers persisted canonical keys over legacy domain aliases when normalizing', () => {
    const result = toGenerationParams({
      base_prompt: 'persisted canonical',
      basePrompt: 'legacy alias',
      original_params: { canonical: true },
      originalParams: { alias: true },
    });

    expect(result.basePrompt).toBe('persisted canonical');
    expect(result.originalParams).toEqual({ canonical: true });
  });

  it('prefers domain canonical keys over legacy persisted aliases when persisting', () => {
    const result = toPersistedGenerationParams({
      basePrompt: 'domain canonical',
      base_prompt: 'legacy alias',
      originalParams: { canonical: true },
      original_params: { alias: true },
    });

    expect(result.base_prompt).toBe('domain canonical');
    expect(result.original_params).toEqual({ canonical: true });
  });
});
