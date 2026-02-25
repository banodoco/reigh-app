import { describe, expect, it } from 'vitest';
import {
  normalizeStructureGuidance,
  pickFirstStructureGuidance,
} from '../structureGuidance';

describe('structureGuidance', () => {
  it('passes through existing structure guidance object unchanged', () => {
    const guidance = {
      target: 'vace',
      videos: [{ path: 'a.mp4', start_frame: 0, end_frame: null, treatment: 'adjust' }],
      preprocessing: 'flow',
    };

    expect(normalizeStructureGuidance({
      structureGuidance: guidance,
    })).toBe(guidance);
  });

  it('builds guidance from structure videos with defaults and path filtering', () => {
    const normalized = normalizeStructureGuidance({
      structureVideos: [
        {
          path: 'video.mp4',
          structure_type: 'depth',
        },
        {
          // ignored: missing path
          structure_type: 'flow',
        },
      ],
      defaultVideoTreatment: 'adjust',
    });

    expect(normalized).toEqual({
      target: 'vace',
      videos: [
        {
          path: 'video.mp4',
          start_frame: 0,
          end_frame: null,
          treatment: 'adjust',
        },
      ],
      strength: 1,
      preprocessing: 'depth',
    });
  });

  it('builds uni3c guidance from singular structure video fields with defaults', () => {
    const normalized = normalizeStructureGuidance({
      structureVideoPath: 'video.mp4',
      useUni3c: true,
      defaultUni3cEndPercent: 0.1,
    });

    expect(normalized).toEqual({
      target: 'uni3c',
      videos: [
        {
          path: 'video.mp4',
          start_frame: 0,
          end_frame: null,
          treatment: 'adjust',
        },
      ],
      strength: 1,
      step_window: [0, 0.1],
      frame_policy: 'fit',
      zero_empty_frames: true,
    });
  });

  it('picks first non-array object guidance candidate', () => {
    expect(pickFirstStructureGuidance(
      undefined,
      ['not-an-object'],
      { target: 'vace' },
      { target: 'ignored' },
    )).toEqual({ target: 'vace' });
  });
});
