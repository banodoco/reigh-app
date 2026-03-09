import { describe, expect, it } from 'vitest';
import {
  LEGACY_STRUCTURE_PARAM_KEYS,
  stripDuplicateStructureDetailParams,
  stripLegacyStructureParams,
} from './legacyStructureParams';

describe('legacyStructureParams', () => {
  it('exports expected legacy keys and strips them from a payload object', () => {
    expect(LEGACY_STRUCTURE_PARAM_KEYS.length).toBeGreaterThan(0);

    const target: Record<string, unknown> = {
      structure_type: 'flow',
      structure_video_path: '/video.mp4',
      structure_guidance_frame_offset: 4,
      structure_videos: [{ path: '/canonical.mp4' }],
      keep_me: 'yes',
    };

    stripLegacyStructureParams(target);

    expect(target.structure_type).toBeUndefined();
    expect(target.structure_video_path).toBeUndefined();
    expect(target.structure_guidance_frame_offset).toBeUndefined();
    expect(target.structure_videos).toEqual([{ path: '/canonical.mp4' }]);
    expect(target.keep_me).toBe('yes');
  });

  it('strips nested canonical structure duplicates without touching other fields', () => {
    const target: Record<string, unknown> = {
      structure_videos: [{ path: '/canonical.mp4' }],
      keep_me: 'yes',
    };

    stripDuplicateStructureDetailParams(target);

    expect(target.structure_videos).toBeUndefined();
    expect(target.keep_me).toBe('yes');
  });
});
