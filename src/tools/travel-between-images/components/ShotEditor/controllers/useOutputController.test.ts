import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useOutputSelection: vi.fn(),
  useSegmentOutputsForShot: vi.fn(),
  useEnsureSelectedOutput: vi.fn(),
  useDemoteOrphanedVariants: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useOutputSelection: mocks.useOutputSelection,
}));

vi.mock('@/shared/hooks/segments', () => ({
  useSegmentOutputsForShot: mocks.useSegmentOutputsForShot,
}));

vi.mock('../hooks/video/useEnsureSelectedOutput', () => ({
  useEnsureSelectedOutput: mocks.useEnsureSelectedOutput,
}));

vi.mock('../../../hooks/workflow/useDemoteOrphanedVariants', () => ({
  useDemoteOrphanedVariants: mocks.useDemoteOrphanedVariants,
}));

import { useOutputController } from './useOutputController';

describe('useOutputController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDemoteOrphanedVariants.mockReturnValue({
      demoteOrphanedVariants: vi.fn(),
    });
    mocks.useSegmentOutputsForShot.mockReturnValue({
      segmentSlots: ['slot-1'],
      selectedParent: 'parent-1',
      parentGenerations: [{ id: 'gen-1' }],
      segmentProgress: { completed: 1 },
      isLoading: false,
    });
  });

  it('passes selected output wiring when output selection is ready', () => {
    const setSelectedOutputId = vi.fn();
    mocks.useOutputSelection.mockReturnValue({
      selectedOutputId: 'out-1',
      setSelectedOutputId,
      isReady: true,
    });

    const { result } = renderHook(() =>
      useOutputController({
        selectedProjectId: 'project-1',
        selectedShotId: 'shot-1',
        selectedShot: { id: 'shot-1' } as never,
        projectId: 'project-1',
        timelineImages: [{ id: 'img-last' }] as never,
      }),
    );

    expect(mocks.useSegmentOutputsForShot).toHaveBeenCalledWith(
      'shot-1',
      'project-1',
      undefined,
      'out-1',
      setSelectedOutputId,
      undefined,
      'img-last',
    );
    expect(mocks.useEnsureSelectedOutput).toHaveBeenCalledWith({
      outputSelectionReady: true,
      parentGenerations: [{ id: 'gen-1' }],
      selectedOutputId: 'out-1',
      setSelectedOutputId,
    });
    expect(result.current.outputSelectionReady).toBe(true);
    expect(result.current.joinSegmentSlots).toEqual(['slot-1']);
  });

  it('omits selected output wiring until output selection is ready', () => {
    const setSelectedOutputId = vi.fn();
    const demoteOrphanedVariants = vi.fn();
    mocks.useOutputSelection.mockReturnValue({
      selectedOutputId: 'out-2',
      setSelectedOutputId,
      isReady: false,
    });
    mocks.useDemoteOrphanedVariants.mockReturnValue({ demoteOrphanedVariants });

    const { result } = renderHook(() =>
      useOutputController({
        selectedProjectId: 'project-2',
        selectedShotId: 'shot-2',
        selectedShot: null,
        projectId: 'project-2',
        timelineImages: [],
      }),
    );

    expect(mocks.useSegmentOutputsForShot).toHaveBeenCalledWith(
      'shot-2',
      'project-2',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(result.current.demoteOrphanedVariants).toBe(demoteOrphanedVariants);
    expect(result.current.outputSelectionReady).toBe(false);
  });
});
