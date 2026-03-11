import { describe, expect, it, vi } from 'vitest';

const signalPastRemovalTargetUsageMock = vi.fn();

vi.mock('@/shared/lib/governance/deprecationEnforcement', () => ({
  signalPastRemovalTargetUsage: (...args: unknown[]) => signalPastRemovalTargetUsageMock(...args),
}));

import {
  collectTravelStructureLegacyUsage,
  enforceTravelStructureLegacyPolicy,
  migrateLegacyStructureVideos,
} from './legacyStructureVideo';

describe('legacyStructureVideo policy', () => {
  it('detects top-level and structure-video legacy field usage', () => {
    const usage = collectTravelStructureLegacyUsage({
      structure_video_path: 'https://example.com/guide.mp4',
      structure_videos: [
        {
          path: 'https://example.com/guide.mp4',
          start_frame: 0,
          end_frame: 81,
          motion_strength: 1.2,
          structure_type: 'flow',
        },
      ],
    });

    expect(usage.topLevelFields).toContain('structure_video_path');
    expect(usage.structureVideoFields).toContain('motion_strength');
    expect(usage.structureVideoFields).toContain('structure_type');
  });

  it('only signals enforcement when legacy fields are present', () => {
    signalPastRemovalTargetUsageMock.mockReset();
    const noLegacy = collectTravelStructureLegacyUsage({
      structure_videos: [{ path: 'a', start_frame: 0, end_frame: 10 }],
    });

    expect(enforceTravelStructureLegacyPolicy(noLegacy)).toBe(false);
    expect(signalPastRemovalTargetUsageMock).not.toHaveBeenCalled();

    const withLegacy = collectTravelStructureLegacyUsage({
      structure_video_type: 'flow',
    });

    enforceTravelStructureLegacyPolicy(withLegacy, { context: 'test' });
    expect(signalPastRemovalTargetUsageMock).toHaveBeenCalledTimes(1);
  });

  it('preserves structure_type in existing structure_videos entries', () => {
    const migrated = migrateLegacyStructureVideos(
      {
        structure_videos: [
          {
            path: 'https://example.com/guide.mp4',
            start_frame: 0,
            end_frame: 81,
            structure_type: 'flow',
            motion_strength: 1.4,
          },
        ],
      },
      {
        defaultEndFrame: 81,
        defaultVideoTreatment: 'adjust',
        defaultMotionStrength: 1.2,
        defaultStructureType: 'uni3c',
        defaultUni3cEndPercent: 0.1,
      },
    );

    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.structure_type).toBe('flow');
    expect(migrated[0]?.motion_strength).toBe(1.4);
  });

  it('preserves legacy single-field structure_video_type when migrating', () => {
    const migrated = migrateLegacyStructureVideos(
      {
        structure_video_path: 'https://example.com/legacy.mp4',
        structure_video_type: 'depth',
      },
      {
        defaultEndFrame: 81,
        defaultVideoTreatment: 'adjust',
        defaultMotionStrength: 1.2,
        defaultStructureType: 'uni3c',
        defaultUni3cEndPercent: 0.1,
      },
    );

    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.path).toBe('https://example.com/legacy.mp4');
    expect(migrated[0]?.structure_type).toBe('depth');
  });

  it('reads camelCase UI aliases when migrating structure video arrays', () => {
    const migrated = migrateLegacyStructureVideos(
      {
        structure_videos: [
          {
            path: 'https://example.com/guide.mp4',
            startFrame: 5,
            endFrame: 42,
            motionStrength: 0.7,
            structureType: 'canny',
            cannyIntensity: 0.3,
            sourceStartFrame: 2,
            sourceEndFrame: 12,
            resourceId: 'resource-1',
          },
        ],
      },
      {
        defaultEndFrame: 81,
        defaultVideoTreatment: 'adjust',
        defaultMotionStrength: 1.2,
        defaultStructureType: 'uni3c',
        defaultUni3cEndPercent: 0.1,
      },
    );

    expect(migrated[0]).toEqual(expect.objectContaining({
      path: 'https://example.com/guide.mp4',
      start_frame: 5,
      end_frame: 42,
      motion_strength: 0.7,
      structure_type: 'canny',
      canny_intensity: 0.3,
      source_start_frame: 2,
      source_end_frame: 12,
      resource_id: 'resource-1',
    }));
  });

  it('reads nested legacy structureVideo objects through the same adapter', () => {
    const migrated = migrateLegacyStructureVideos(
      {
        path: 'https://example.com/nested.mp4',
        startFrame: 7,
        endFrame: 22,
        treatment: 'clip',
        motionStrength: 0.9,
        structureType: 'uni3c',
        uni3cStartPercent: 0.2,
        uni3cEndPercent: 0.6,
      },
      {
        defaultEndFrame: 81,
        defaultVideoTreatment: 'adjust',
        defaultMotionStrength: 1.2,
        defaultStructureType: 'flow',
        defaultUni3cEndPercent: 0.1,
      },
    );

    expect(migrated[0]).toEqual(expect.objectContaining({
      path: 'https://example.com/nested.mp4',
      start_frame: 7,
      end_frame: 22,
      treatment: 'clip',
      motion_strength: 0.9,
      structure_type: 'uni3c',
      uni3c_start_percent: 0.2,
      uni3c_end_percent: 0.6,
    }));
  });
});
