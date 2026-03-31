import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSegmentSlotIndexMap,
  buildTrailingPairData,
  useSegmentSlotPresentationAdapter,
} from './useSegmentSlotPresentationAdapter';

vi.mock('@/shared/lib/settingsMigration', () => ({
  readSegmentOverrides: () => ({
    prompt: 'override prompt',
    negativePrompt: 'override negative',
  }),
}));

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (url: string) => `display:${url}`,
}));

describe('useSegmentSlotPresentationAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds slot index map and trailing pair metadata from timeline images', () => {
    const segmentSlots = [
      { type: 'child', index: 1, child: { id: 'video-1', location: 'v1.mp4', thumbUrl: 'v1-thumb.jpg' } },
    ] as never[];
    const pairDataByIndex = new Map([[0, { index: 0 }]]);

    const trailing = buildTrailingPairData({
      pairDataByIndex,
      segmentSlots: segmentSlots as never,
      shotGenerations: [
        {
          id: 'gen-1',
          generation_id: 'gen-1',
          timeline_frame: 5,
          type: 'image',
          imageUrl: 'img-1.png',
          thumbUrl: 'img-1-thumb.png',
          metadata: { end_frame: 20 },
        },
      ] as never,
    });

    expect(trailing).toEqual(
      expect.objectContaining({
        index: 1,
        startFrame: 5,
        endFrame: 20,
        frames: 15,
      }),
    );
    const map = buildSegmentSlotIndexMap(segmentSlots as never);
    expect(map.get(1)?.type).toBe('child');
  });

  it('builds presentation payload and navigates through transition when video mode changes', () => {
    const pair0 = {
      index: 0,
      frames: 10,
      startFrame: 0,
      endFrame: 10,
      startImage: { id: 'gen-1' },
      endImage: null,
    };
    const pair1 = {
      index: 1,
      frames: 8,
      startFrame: 10,
      endFrame: 18,
      startImage: { id: 'gen-2' },
      endImage: null,
    };
    const pair2 = {
      index: 2,
      frames: 8,
      startFrame: 18,
      endFrame: 26,
      startImage: { id: 'gen-3' },
      endImage: null,
    };

    const setSegmentSlotLightboxIndex = vi.fn();
    const navigateWithTransition = vi.fn((cb: () => void) => cb());
    const { result } = renderHook(() =>
      useSegmentSlotPresentationAdapter({
        props: {
          selectedShotId: 'shot-1',
          projectId: 'proj-1',
          effectiveGenerationMode: 'timeline',
          batchVideoFrames: 24,
          shotGenerations: [
            { id: 'gen-1', metadata: { enhanced_prompt: 'enhanced 1' } },
            { id: 'gen-2', metadata: { enhanced_prompt: 'enhanced 2' } },
          ] as never,
          segmentSlots: [] as never,
          selectedParentId: null,
          defaultPrompt: 'default prompt',
          defaultNegativePrompt: 'default negative',
          resolvedProjectResolution: '1280x720',
          structureVideos: [
            {
              path: 'structure-1.mp4',
              start_frame: 0,
              end_frame: 30,
              structure_type: 'depth',
              motion_strength: 1.4,
              treatment: 'adjust',
              uni3c_end_percent: 0.15,
              metadata: { total_frames: 60, frame_rate: 24 },
            },
          ] as never,
          maxFrameLimit: 90,
          loadPositions: vi.fn(async () => {}),
          navigateWithTransition,
          addOptimisticPending: vi.fn(),
        },
        state: {
          segmentSlotLightboxIndex: 0,
          setSegmentSlotLightboxIndex,
          activePairData: pair0 as never,
          pendingImageToOpen: null,
          setPendingImageToOpen: vi.fn(),
          pendingImageVariantId: null,
          setPendingImageVariantId: vi.fn(),
        },
        pairDataByIndex: new Map([
          [0, pair0 as never],
          [1, pair1 as never],
          [2, pair2 as never],
        ]),
        slotByIndex: new Map([
          [0, { type: 'child', index: 0, child: { id: 'child-0', location: 'v0.mp4', thumbUrl: 'thumb0.jpg' } }],
          [1, { type: 'child', index: 1, child: { id: 'child-1', location: 'v1.mp4', thumbUrl: 'thumb1.jpg' } }],
          [2, { type: 'placeholder', index: 2 }],
        ]) as never,
        trailingPairData: null,
        updatePairFrameCount: vi.fn(async () => ({ finalFrameCount: 12 })),
        frameCountDebounceRef: { current: null },
      }),
    );

    expect(result.current?.pairPrompt).toBe('override prompt');
    expect(result.current?.pairNegativePrompt).toBe('override negative');
    expect(result.current?.enhancedPrompt).toBe('enhanced 1');
    expect(result.current?.adjacentVideoThumbnails?.current.thumbUrl).toBe('display:thumb0.jpg');

    act(() => {
      result.current?.onNavigateToPair(2);
    });

    expect(navigateWithTransition).toHaveBeenCalledTimes(1);
    expect(setSegmentSlotLightboxIndex).toHaveBeenCalledWith(2);
  });

  it('debounces frame updates and resolves overlapping structure videos in timeline mode', () => {
    vi.useFakeTimers();
    const updatePairFrameCount = vi.fn(async () => ({ finalFrameCount: 33 }));
    const onSetStructureVideos = vi.fn();
    const { result } = renderHook(() =>
      useSegmentSlotPresentationAdapter({
        props: {
          selectedShotId: 'shot-1',
          projectId: 'proj-1',
          effectiveGenerationMode: 'timeline',
          batchVideoFrames: 24,
          shotGenerations: [{ id: 'gen-1', metadata: {} }] as never,
          segmentSlots: [] as never,
          selectedParentId: null,
          defaultPrompt: '',
          defaultNegativePrompt: '',
          structureVideos: [
            { path: 'existing.mp4', start_frame: 0, end_frame: 100 },
          ] as never,
          onSetStructureVideos,
          maxFrameLimit: 120,
          loadPositions: vi.fn(async () => {}),
          navigateWithTransition: (cb: () => void) => cb(),
          addOptimisticPending: vi.fn(),
        },
        state: {
          segmentSlotLightboxIndex: 0,
          setSegmentSlotLightboxIndex: vi.fn(),
          activePairData: {
            index: 0,
            frames: 10,
            startFrame: 0,
            endFrame: 10,
            startImage: { id: 'gen-1' },
            endImage: null,
          } as never,
          pendingImageToOpen: null,
          setPendingImageToOpen: vi.fn(),
          pendingImageVariantId: null,
          setPendingImageVariantId: vi.fn(),
        },
        pairDataByIndex: new Map([[0, { index: 0 } as never]]),
        slotByIndex: new Map([[0, { type: 'child', index: 0, child: { id: 'child-0', location: 'v0.mp4' } }]]) as never,
        trailingPairData: null,
        updatePairFrameCount,
        frameCountDebounceRef: { current: null },
      }),
    );

    act(() => {
      result.current?.onFrameCountChange('pair-1', 33);
      vi.advanceTimersByTime(149);
    });
    expect(updatePairFrameCount).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(updatePairFrameCount).toHaveBeenCalledWith('pair-1', 33);

    act(() => {
      result.current?.onAddSegmentStructureVideo({
        path: 'new.mp4',
        start_frame: 20,
        end_frame: 40,
      } as never);
    });

    expect(onSetStructureVideos).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'existing.mp4', start_frame: 0, end_frame: 20 }),
      expect.objectContaining({ path: 'existing.mp4', start_frame: 40, end_frame: 100 }),
      expect.objectContaining({ path: 'new.mp4', start_frame: 20, end_frame: 40 }),
    ]);
    vi.useRealTimers();
  });
});
