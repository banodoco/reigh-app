// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  uploadVideoToStorage: vi.fn(),
  extractVideoMetadata: vi.fn(),
  mutateAsync: vi.fn(),
  getUser: vi.fn(),
  useUserUIState: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/lib/media/videoUploader', () => ({
  uploadVideoToStorage: (...args: unknown[]) => mocks.uploadVideoToStorage(...args),
  extractVideoMetadata: (...args: unknown[]) => mocks.extractVideoMetadata(...args),
}));

vi.mock('@/shared/hooks/useResources', () => ({
  useCreateResource: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: (...args: unknown[]) => mocks.useUserUIState(...args),
}));

import { useBatchGuidanceVideoController } from './useBatchGuidanceVideoController';

describe('useBatchGuidanceVideoController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useUserUIState.mockReturnValue({
      value: { resourcesPublic: true, generationsPublic: false },
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'user@example.com' } },
    });
    mocks.extractVideoMetadata.mockResolvedValue({ total_frames: 10, frame_rate: 24 });
    mocks.uploadVideoToStorage.mockResolvedValue('https://cdn.example.com/video.mp4');
    mocks.mutateAsync.mockResolvedValue({ id: 'resource-1' });
  });

  it('derives timeline/video coverage descriptions and blocks drag state in read-only mode', () => {
    const { result } = renderHook(() => useBatchGuidanceVideoController({
      shotId: 'shot-1',
      videoUrl: 'https://cdn.example.com/input.mp4',
      videoMetadata: { total_frames: 7, frame_rate: 24 } as never,
      treatment: 'adjust',
      timelineFramePositions: [10, 12, 14],
      onVideoUploaded: vi.fn(),
      readOnly: true,
    }));

    expect(result.current.minFrame).toBe(10);
    expect(result.current.maxFrame).toBe(14);
    expect(result.current.timelineFrames).toBe(5);
    expect(result.current.videoCoversFrames).toBe(5);
    expect(result.current.adjustModeDescription).toContain("drop 2 frames");

    act(() => {
      result.current.handleDragEnter({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as never);
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('rejects invalid files and forwards resource selection/removal callbacks', async () => {
    const onVideoUploaded = vi.fn();
    const { result } = renderHook(() => useBatchGuidanceVideoController({
      shotId: 'shot-1',
      videoUrl: null,
      videoMetadata: { total_frames: 5, frame_rate: 24 } as never,
      treatment: 'clip',
      timelineFramePositions: [0, 1, 2],
      onVideoUploaded,
      readOnly: false,
    }));

    await act(async () => {
      await result.current.handleFileSelect({
        target: {
          files: [new File(['x'], 'x.txt', { type: 'text/plain' })],
        },
      } as never);
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      'Invalid file type. Please upload an MP4, WebM, or MOV file.',
    );

    act(() => {
      result.current.setShowBrowser(true);
      result.current.handleResourceSelect({
        id: 'resource-2',
        metadata: {
          videoUrl: 'https://cdn.example.com/from-resource.mp4',
          videoMetadata: { total_frames: 12, frame_rate: 30 },
        },
      } as never);
      result.current.handleRemoveVideo();
    });

    expect(onVideoUploaded).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example.com/from-resource.mp4',
      { total_frames: 12, frame_rate: 30 },
      'resource-2',
    );
    expect(onVideoUploaded).toHaveBeenNthCalledWith(2, null, null, undefined);
    expect(result.current.showBrowser).toBe(false);
  });
});
