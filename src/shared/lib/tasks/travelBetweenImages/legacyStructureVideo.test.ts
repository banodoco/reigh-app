import { describe, expect, it, vi } from 'vitest';

const signalPastRemovalTargetUsageMock = vi.fn();

vi.mock('@/shared/lib/governance/deprecationEnforcement', () => ({
  signalPastRemovalTargetUsage: (...args: unknown[]) => signalPastRemovalTargetUsageMock(...args),
}));

import {
  collectTravelStructureLegacyUsage,
  enforceTravelStructureLegacyPolicy,
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
});
