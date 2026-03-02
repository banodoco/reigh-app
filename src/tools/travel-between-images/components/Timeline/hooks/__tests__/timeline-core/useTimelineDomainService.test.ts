import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useTimelineCore: vi.fn(),
  useTimelinePositionUtils: vi.fn(),
  usePositionManagement: vi.fn(),
  filterTimelineEligiblePositionedImages: vi.fn(),
}));

vi.mock('@/shared/hooks/useTimelineCore', () => ({
  useTimelineCore: mocks.useTimelineCore,
}));

vi.mock('../../../../../hooks/timeline/useTimelinePositionUtils', () => ({
  useTimelinePositionUtils: mocks.useTimelinePositionUtils,
}));

vi.mock('../../usePositionManagement', () => ({
  usePositionManagement: mocks.usePositionManagement,
}));

vi.mock('@/shared/lib/timelineEligibility', () => ({
  filterTimelineEligiblePositionedImages: mocks.filterTimelineEligiblePositionedImages,
}));

import { useTimelineDomainService } from '../../timeline-core/useTimelineDomainService';

describe('useTimelineDomainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTimelineCore.mockReturnValue({
      positionedItems: [
        { id: 'b', timeline_frame: 20 },
        { id: 'a', timeline_frame: 10 },
      ],
      pairPrompts: { 0: { prompt: 'core', negativePrompt: '' } },
      refetch: vi.fn(),
    });
    mocks.useTimelinePositionUtils.mockReturnValue({
      loadPositions: vi.fn(),
      pairPrompts: { 1: { prompt: 'utils', negativePrompt: '' } },
    });
    mocks.usePositionManagement.mockReturnValue({
      displayPositions: new Map([['a', 10]]),
      setFramePositions: vi.fn(),
    });
    mocks.filterTimelineEligiblePositionedImages.mockImplementation((items: unknown[]) => items);
  });

  it('uses timeline core data when propAllGenerations is not provided', async () => {
    const { result } = renderHook(() =>
      useTimelineDomainService({
        shotId: 'shot-1',
        projectId: 'project-1',
        frameSpacing: 4,
        isDragInProgress: false,
        readOnly: false,
      }),
    );

    expect(mocks.useTimelineCore).toHaveBeenCalledWith('shot-1');
    expect(mocks.useTimelinePositionUtils).toHaveBeenCalledWith({
      shotId: null,
      generations: [],
      projectId: 'project-1',
    });
    expect(result.current.images.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.current.actualPairPrompts).toEqual({ 0: { prompt: 'core', negativePrompt: '' } });
    expect(result.current.readOnlyGenerations).toBeUndefined();

    await result.current.loadPositions();
    const core = mocks.useTimelineCore.mock.results[0].value as { refetch: () => void };
    expect(core.refetch).toHaveBeenCalledTimes(1);
  });

  it('uses prop-driven generations and utils position loader in read-only mode', async () => {
    const loadPositions = vi.fn();
    mocks.useTimelinePositionUtils.mockReturnValue({
      loadPositions,
      pairPrompts: { 1: { prompt: 'utils', negativePrompt: 'none' } },
    });

    const propAllGenerations = [
      { id: 'x', timeline_frame: 8 },
      { id: 'y', timeline_frame: 5 },
    ];
    const propShotGenerations = [{ id: 'shot-gen', timeline_frame: 3 }];

    const { result } = renderHook(() =>
      useTimelineDomainService({
        shotId: 'shot-2',
        projectId: 'project-2',
        frameSpacing: 6,
        isDragInProgress: true,
        propAllGenerations: propAllGenerations as never,
        propShotGenerations: propShotGenerations as never,
        propImages: [...propAllGenerations] as never,
        readOnly: true,
      }),
    );

    expect(mocks.useTimelineCore).toHaveBeenCalledWith(null);
    expect(mocks.useTimelinePositionUtils).toHaveBeenCalledWith({
      shotId: 'shot-2',
      generations: propAllGenerations,
      projectId: 'project-2',
    });
    expect(result.current.shotGenerations).toEqual(propShotGenerations);
    expect(result.current.images.map((item) => item.id)).toEqual(['y', 'x']);
    expect(result.current.readOnlyGenerations).toEqual(propAllGenerations);
    expect(result.current.actualPairPrompts).toEqual({
      1: { prompt: 'utils', negativePrompt: 'none' },
    });

    await result.current.loadPositions({ reason: 'test' });
    expect(loadPositions).toHaveBeenCalledWith({ reason: 'test' });
  });
});
