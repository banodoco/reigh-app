import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@/shared/hooks/settings/useAutoSaveSettings', () => ({
  useAutoSaveSettings: vi.fn(),
}));

import { convertToHiresFixApiParams } from './useGenerationEditSettings';
import type { EditAdvancedSettings } from './editSettingsTypes';

const baseSettings: EditAdvancedSettings = {
  enabled: false,
  num_inference_steps: 14,
  resolution_scale: 1.5,
  base_steps: 9,
  hires_scale: 1.2,
  hires_steps: 10,
  hires_denoise: 0.45,
  lightning_lora_strength_phase_1: 0.8,
  lightning_lora_strength_phase_2: 0.6,
};

describe('convertToHiresFixApiParams', () => {
  it('returns undefined when settings are missing', () => {
    expect(convertToHiresFixApiParams(undefined)).toBeUndefined();
  });

  it('returns single-pass params when two-pass mode is disabled', () => {
    expect(convertToHiresFixApiParams(baseSettings)).toEqual({
      num_inference_steps: 14,
    });
  });

  it('returns two-pass hires params when enabled', () => {
    expect(convertToHiresFixApiParams({
      ...baseSettings,
      enabled: true,
    })).toEqual({
      num_inference_steps: 9,
      hires_scale: 1.2,
      hires_steps: 10,
      hires_denoise: 0.45,
      lightning_lora_strength_phase_1: 0.8,
      lightning_lora_strength_phase_2: 0.6,
    });
  });
});
