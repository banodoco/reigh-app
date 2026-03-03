import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoLightboxActions } from './useVideoLightboxActions';
import { handleLightboxDownload, invokeLightboxDelete } from '../utils';

vi.mock('../utils', () => ({
  handleLightboxDownload: vi.fn(async () => undefined),
  invokeLightboxDelete: vi.fn(async () => undefined),
}));

describe('useVideoLightboxActions', () => {
  it('invokes shared download and delete handlers with lightbox state', async () => {
    const onDelete = vi.fn(async () => undefined);
    const onApplySettings = vi.fn();
    const onNavigateToShot = vi.fn();
    const onClose = vi.fn();

    const { result } = renderHook(() =>
      useVideoLightboxActions({
        props: {
          media: {
            id: 'media-1',
            metadata: { prompt: 'test' },
          },
          actions: {
            onDelete,
            onApplySettings,
          },
          shotWorkflow: {
            onNavigateToShot,
          },
          onClose,
        } as never,
        env: {
          setIsDownloading: vi.fn(),
        } as never,
        sharedState: {
          intendedActiveVariantIdRef: { current: 'variant-1' },
          variants: { list: [] },
          effectiveMedia: { videoUrl: 'https://example.com/video.mp4' },
        } as never,
      }),
    );

    await act(async () => {
      await result.current.handleDownload();
      await result.current.handleDelete();
    });

    act(() => {
      result.current.handleApplySettings();
      result.current.handleNavigateToShotFromSelector({ id: 'shot-1', name: 'Shot 1' });
    });

    expect(handleLightboxDownload).toHaveBeenCalled();
    expect(invokeLightboxDelete).toHaveBeenCalledWith(onDelete, 'media-1', 'VideoLightbox.delete');
    expect(onApplySettings).toHaveBeenCalledWith({ prompt: 'test' });
    expect(onClose).toHaveBeenCalled();
    expect(onNavigateToShot).toHaveBeenCalledWith({
      id: 'shot-1',
      name: 'Shot 1',
      images: [],
      position: 0,
    });
  });
});
