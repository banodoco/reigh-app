import { describe, it, expect } from 'vitest';
import { BUILTIN_I2V_PRESET, BUILTIN_VACE_PRESET, SEGMENT_I2V_FEATURED_PRESET_IDS, SEGMENT_VACE_FEATURED_PRESET_IDS, getDefaultableField } from '../SegmentSettingsForm/segmentSettingsUtils';

describe('segmentSettingsUtils', () => {
  it('exports expected members', () => {
    expect(BUILTIN_I2V_PRESET).toBeDefined();
    expect(BUILTIN_VACE_PRESET).toBeDefined();
    expect(SEGMENT_I2V_FEATURED_PRESET_IDS).toBeDefined();
    expect(SEGMENT_VACE_FEATURED_PRESET_IDS).toBeDefined();
    expect(getDefaultableField).toBeDefined();
  });
});
