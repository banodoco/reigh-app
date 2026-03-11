import { describe, expect, it } from 'vitest';
import { resolveTravelStructureState } from '../structureState';

const defaultOptions = {
  defaultEndFrame: 81,
  defaultVideoTreatment: 'adjust' as const,
  defaultMotionStrength: 1.2,
  defaultStructureType: 'uni3c' as const,
  defaultUni3cEndPercent: 0.1,
};

describe('resolveTravelStructureState', () => {
  it('normalizes nested legacy structureVideo settings into canonical videos and guidance', () => {
    const state = resolveTravelStructureState({
      structureVideo: {
        path: '/legacy.mp4',
        startFrame: 10,
        endFrame: 33,
        treatment: 'clip',
        motionStrength: 0.8,
        structureType: 'depth',
        metadata: { total_frames: 90 },
        resourceId: 'resource-1',
      },
    }, defaultOptions);

    expect(state.structureVideos).toEqual([
      expect.objectContaining({
        path: '/legacy.mp4',
        start_frame: 10,
        end_frame: 33,
        treatment: 'clip',
        metadata: { total_frames: 90 },
        resource_id: 'resource-1',
      }),
    ]);
    expect(state.structureGuidance).toEqual(expect.objectContaining({
      target: 'vace',
      preprocessing: 'depth',
      strength: 0.8,
    }));
  });

  it('prefers canonical guidance videos while preserving raw metadata sidecars', () => {
    const state = resolveTravelStructureState({
      structureVideos: [{
        path: '/guide.mp4',
        startFrame: 0,
        endFrame: 55,
        metadata: { duration_seconds: 3 },
        resourceId: 'resource-2',
      }],
      structureGuidance: {
        target: 'uni3c',
        strength: 1.1,
        step_window: [0.2, 0.7],
        videos: [{
          path: '/guide.mp4',
          start_frame: 4,
          end_frame: 60,
          treatment: 'clip',
        }],
      },
    }, defaultOptions);

    expect(state.structureVideos).toEqual([
      expect.objectContaining({
        path: '/guide.mp4',
        start_frame: 4,
        end_frame: 60,
        treatment: 'clip',
        metadata: { duration_seconds: 3 },
        resource_id: 'resource-2',
      }),
    ]);
    expect(state.structureGuidance).toEqual(expect.objectContaining({
      target: 'uni3c',
      strength: 1.1,
      step_window: [0.2, 0.7],
    }));
  });
});
