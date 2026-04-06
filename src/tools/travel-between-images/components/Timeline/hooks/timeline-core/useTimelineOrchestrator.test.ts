import { describe, expect, it, vi } from 'vitest';

import {
  handleTimelineStructureVideoSelect,
  runDuplicateInterceptor,
  runGenerationDropInterceptor,
} from './useTimelineOrchestratorActions';

describe('useTimelineOrchestrator helpers', () => {
  it('wraps generation drops with pending-frame bookkeeping and cleanup', async () => {
    const setPendingDropFrame = vi.fn();
    const setIsInternalDropProcessing = vi.fn();
    const onGenerationDrop = vi.fn().mockResolvedValue(undefined);

    await runGenerationDropInterceptor({
      generationId: 'gen-1',
      imageUrl: 'https://image.test/frame.png',
      thumbUrl: 'https://image.test/thumb.png',
      targetFrame: 12,
      onGenerationDrop,
      setPendingDropFrame,
      setIsInternalDropProcessing,
    });

    expect(setPendingDropFrame).toHaveBeenNthCalledWith(1, 12);
    expect(setIsInternalDropProcessing).toHaveBeenNthCalledWith(1, true);
    expect(onGenerationDrop).toHaveBeenCalledWith(
      'gen-1',
      'https://image.test/frame.png',
      'https://image.test/thumb.png',
      12,
    );
    expect(setIsInternalDropProcessing).toHaveBeenLastCalledWith(false);
    expect(setPendingDropFrame).toHaveBeenLastCalledWith(null);
  });

  it('forwards the source frame to pending state and lets SQL resolve the final placement', () => {
    const setPendingDuplicateFrame = vi.fn();
    const onImageDuplicate = vi.fn();

    runDuplicateInterceptor({
      imageId: 'img-1',
      timelineFrame: 1,
      images: [
        { id: 'img-1', timeline_frame: 1 },
        { id: 'img-2', timeline_frame: 9 },
      ] as never,
      onImageDuplicate,
      setPendingDuplicateFrame,
    });

    expect(setPendingDuplicateFrame).toHaveBeenCalledWith(1);
    expect(onImageDuplicate).toHaveBeenCalledWith('img-1', 1, 9);
  });

  it('routes structure-video resource selection through the add-video path when timeline videos exist', () => {
    const onAddStructureVideo = vi.fn();
    const onUpdateStructureVideo = vi.fn();
    const onPrimaryStructureVideoInputChange = vi.fn();
    const setShowVideoBrowser = vi.fn();

    handleTimelineStructureVideoSelect({
      resource: {
        id: 'resource-1',
        metadata: {
          videoUrl: 'https://video.test/structure.mp4',
          videoMetadata: { total_frames: 40 },
        },
      } as never,
      structureVideos: [
        {
          path: 'old.mp4',
          start_frame: 0,
          end_frame: 20,
          treatment: 'adjust',
        },
      ] as never,
      onAddStructureVideo,
      onUpdateStructureVideo,
      onPrimaryStructureVideoInputChange,
      fullMax: 81,
      setShowVideoBrowser,
    });

    expect(onUpdateStructureVideo).not.toHaveBeenCalled();
    expect(onAddStructureVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'https://video.test/structure.mp4',
        start_frame: 20,
        end_frame: 60,
        resource_id: 'resource-1',
      }),
    );
    expect(onPrimaryStructureVideoInputChange).not.toHaveBeenCalled();
    expect(setShowVideoBrowser).toHaveBeenCalledWith(false);
  });
});
