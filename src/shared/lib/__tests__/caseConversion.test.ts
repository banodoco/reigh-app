import { describe, it, expect } from 'vitest';
import { camelToSnakeKeys } from '../caseConversion';

describe('camelToSnakeKeys', () => {
  it('converts simple camelCase keys', () => {
    expect(camelToSnakeKeys({ numInferenceSteps: 6, guidanceScale: 3.0 }))
      .toEqual({ num_inference_steps: 6, guidance_scale: 3.0 });
  });

  it('handles single-word keys (no conversion needed)', () => {
    expect(camelToSnakeKeys({ prompt: 'a cat', seed: 42 }))
      .toEqual({ prompt: 'a cat', seed: 42 });
  });

  it('preserves values (no recursive conversion)', () => {
    const nested = { innerKey: 'value' };
    const result = camelToSnakeKeys({ outerKey: nested });
    expect(result).toEqual({ outer_key: nested });
    // Value is the same reference (not deep-converted)
    expect((result as Record<string, unknown>).outer_key).toBe(nested);
  });

  it('handles empty objects', () => {
    expect(camelToSnakeKeys({})).toEqual({});
  });

  it('handles consecutive capitals', () => {
    expect(camelToSnakeKeys({ enableXML: true }))
      .toEqual({ enable_x_m_l: true });
  });

  it('handles keys starting with uppercase', () => {
    expect(camelToSnakeKeys({ MyKey: 'value' }))
      .toEqual({ _my_key: 'value' });
  });

  it('preserves already snake_case keys', () => {
    expect(camelToSnakeKeys({ already_snake: 1 }))
      .toEqual({ already_snake: 1 });
  });

  it('handles boolean and null values', () => {
    expect(camelToSnakeKeys({ isEnabled: true, nullValue: null }))
      .toEqual({ is_enabled: true, null_value: null });
  });
});
