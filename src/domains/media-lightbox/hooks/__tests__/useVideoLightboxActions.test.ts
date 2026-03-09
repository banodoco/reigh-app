import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoLightboxActions } from '../useVideoLightboxActions';

const mocks = vi.hoisted(() => ({
  handleLightboxDownload: vi.fn(),
  invokeLightboxDelete: vi.fn(),
}));

vi.mock('../../utils/lightboxDownload', () => ({
  handleLightboxDownload: (...args: unknown[]) => mocks.handleLightboxDownload(...args),
}));

vi.mock('../../utils/lightboxDelete', () => ({
  invokeLightboxDelete: (...args: unknown[]) => mocks.invokeLightboxDelete(...args),
}));

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    props: {
      media: {
        id: 'media-1',
        metadata: { prompt: 'hello' },
      },
      actions: {
        onDelete: vi.fn().mockResolvedValue(undefined),
        onApplySettings: vi.fn(),
      },
      shotWorkflow: {
        onNavigateToShot: vi.fn(),
      },
      onClose: vi.fn(),
    },
    env: {
      setIsDownloading: vi.fn(),
    },
    sharedState: {
      intendedActiveVariantIdRef: { current: 'variant-1' },
      variants: { list: [{ id: 'variant-1' }] },
      effectiveMedia: { videoUrl: 'https://video.example/v1.mp4' },
    },
    ...overrides,
  } as never;
}

describe('useVideoLightboxActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleLightboxDownload.mockResolvedValue(undefined);
    mocks.invokeLightboxDelete.mockResolvedValue(undefined);
  });

  it('downloads/deletes media and applies settings with expected payloads', async () => {
    const input = createInput();
    const { result } = renderHook(() => useVideoLightboxActions(input));

    await act(async () => {
      await result.current.handleDownload();
      await result.current.handleDelete();
    });
    act(() => {
      result.current.handleApplySettings();
    });

    expect(mocks.handleLightboxDownload).toHaveBeenCalledWith({
      intendedVariantId: 'variant-1',
      variants: [{ id: 'variant-1' }],
      fallbackUrl: 'https://video.example/v1.mp4',
      media: input.props.media,
      isVideo: true,
      setIsDownloading: input.env.setIsDownloading,
    });

    expect(mocks.invokeLightboxDelete).toHaveBeenCalledWith(
      input.props.actions.onDelete,
      'media-1',
      'VideoLightbox.delete',
    );
    expect(input.props.actions.onApplySettings).toHaveBeenCalledWith({ prompt: 'hello' });
  });

  it('no-ops without required handlers and routes shot selector navigation', async () => {
    const onNavigateToShot = vi.fn();
    const input = createInput({
      props: {
        media: null,
        actions: {},
        shotWorkflow: { onNavigateToShot },
        onClose: vi.fn(),
      },
    });

    const { result } = renderHook(() => useVideoLightboxActions(input));

    await act(async () => {
      await result.current.handleDownload();
      await result.current.handleDelete();
    });
    act(() => {
      result.current.handleApplySettings();
      result.current.handleNavigateToShotFromSelector({ id: 'shot-1', name: 'Shot 1' });
    });

    expect(mocks.handleLightboxDownload).not.toHaveBeenCalled();
    expect(mocks.invokeLightboxDelete).not.toHaveBeenCalled();
    expect(input.props.onClose).toHaveBeenCalledTimes(1);
    expect(onNavigateToShot).toHaveBeenCalledWith({
      id: 'shot-1',
      name: 'Shot 1',
      images: [],
      position: 0,
    });
  });
});
