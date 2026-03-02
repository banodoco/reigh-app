import { describe, it, expect } from 'vitest';
import { LEGACY_STRUCTURE_PARAM_KEYS, stripLegacyStructureParams } from './legacyStructureParams';

describe('legacyStructureParams', () => {
  it('exports expected legacy keys and strips them from a payload object', () => {
    expect(LEGACY_STRUCTURE_PARAM_KEYS.length).toBeGreaterThan(0);

    const target: Record<string, unknown> = {
      structure_type: 'flow',
      structure_video_path: '/video.mp4',
      structure_guidance_frame_offset: 4,
      keep_me: 'yes',
    };

    stripLegacyStructureParams(target);

    expect(target.structure_type).toBeUndefined();
    expect(target.structure_video_path).toBeUndefined();
    expect(target.structure_guidance_frame_offset).toBeUndefined();
    expect(target.keep_me).toBe('yes');
  });
});
