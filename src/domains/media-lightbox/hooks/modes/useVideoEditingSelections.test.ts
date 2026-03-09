// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoEditingSelections } from './useVideoEditingSelections';

const state = vi.hoisted(() => ({
  nextId: 1,
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  generateUUID: () => `id-${state.nextId++}`,
}));

describe('useVideoEditingSelections', () => {
  beforeEach(() => {
    state.nextId = 1;
  });

  it('initializes selection from video duration and adds new selections with active id', async () => {
    const { result } = renderHook(() =>
      useVideoEditingSelections({
        mediaId: undefined,
        videoDuration: 100,
        defaultGapFrameCount: 12,
        contextFrameCount: 4,
      }),
    );

    await waitFor(() => {
      expect(result.current.selections[0].start).toBe(10);
      expect(result.current.selections[0].end).toBe(20);
    });

    act(() => {
      result.current.handleAddSelection();
    });

    expect(result.current.selections).toHaveLength(2);
    expect(result.current.selections[1]).toEqual(
      expect.objectContaining({
        start: 30,
        end: 40,
      }),
    );
    expect(result.current.activeSelectionId).toBe(result.current.selections[1].id);
  });

  it('resets selections when media changes', async () => {
    const { result, rerender } = renderHook(
      (props: { mediaId?: string }) =>
        useVideoEditingSelections({
          mediaId: props.mediaId,
          videoDuration: 100,
          defaultGapFrameCount: 12,
          contextFrameCount: 4,
        }),
      {
        initialProps: { mediaId: undefined },
      },
    );

    await waitFor(() => {
      expect(result.current.selections[0].end).toBe(20);
    });

    const originalFirstId = result.current.selections[0].id;
    act(() => {
      result.current.handleAddSelection();
    });
    expect(result.current.activeSelectionId).toBe(result.current.selections[1].id);

    rerender({ mediaId: 'media-2' });

    expect(result.current.selections).toHaveLength(1);
    expect(result.current.selections[0].id).not.toBe(originalFirstId);
    expect(result.current.activeSelectionId).toBeNull();
  });

  it('updates settings and converts selections to frame ranges with local overrides', async () => {
    const { result } = renderHook(() =>
      useVideoEditingSelections({
        mediaId: undefined,
        videoDuration: 100,
        defaultGapFrameCount: 12,
        contextFrameCount: 4,
      }),
    );

    await waitFor(() => {
      expect(result.current.selections[0].end).toBe(20);
    });

    const firstId = result.current.selections[0].id;
    act(() => {
      result.current.handleUpdateSelectionSettings(firstId, {
        gapFrameCount: 9,
        prompt: 'local prompt',
      });
    });

    const ranges = result.current.selectionsToFrameRanges(10, 5, 'global prompt');
    expect(ranges).toEqual([
      {
        start_frame: 100,
        end_frame: 200,
        start_time_seconds: 10,
        end_time_seconds: 20,
        frame_count: 100,
        gap_frame_count: 9,
        prompt: 'local prompt',
      },
    ]);
  });

  it('reports validation errors for overlapping portions', async () => {
    const { result } = renderHook(() =>
      useVideoEditingSelections({
        mediaId: undefined,
        videoDuration: 100,
        defaultGapFrameCount: 12,
        contextFrameCount: 4,
      }),
    );

    await waitFor(() => {
      expect(result.current.selections[0].end).toBe(20);
    });

    act(() => {
      result.current.handleAddSelection();
    });

    const secondId = result.current.selections[1].id;
    act(() => {
      result.current.handleUpdateSelection(secondId, 15, 25);
    });

    expect(result.current.validation.isValid).toBe(false);
    expect(result.current.validation.errors.some((error) => error.includes('Portions overlap'))).toBe(true);
  });
});
