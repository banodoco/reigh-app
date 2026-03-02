import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/media/mediaUrl', () => ({
  getDisplayUrl: (url: string) => `display:${url}`,
}));

import { useAppDndOverlay } from './useAppDndOverlay';

describe('useAppDndOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an image preview for image drag payloads', () => {
    const { result } = renderHook(() => useAppDndOverlay());

    act(() => {
      result.current.handleDragStart({
        active: { data: { current: { imageUrl: 'https://cdn.example.com/image.png' } } },
      } as never);
    });

    const overlay = result.current.overlayContent as React.ReactElement;
    expect(React.isValidElement(overlay)).toBe(true);
    const preview = overlay.props.children as React.ReactElement;
    expect(preview.type).toBe('img');
    expect(preview.props.src).toBe('display:https://cdn.example.com/image.png');
  });

  it('renders a video preview for video drag payloads', () => {
    const { result } = renderHook(() => useAppDndOverlay());

    act(() => {
      result.current.handleDragStart({
        active: { data: { current: { imageUrl: 'https://cdn.example.com/video.mp4' } } },
      } as never);
    });

    const overlay = result.current.overlayContent as React.ReactElement;
    const preview = overlay.props.children as React.ReactElement;
    expect(preview.type).toBe('video');
    expect(preview.props.src).toBe('display:https://cdn.example.com/video.mp4');
  });

  it('finalizes drop animation then clears the overlay', async () => {
    const { result } = renderHook(() => useAppDndOverlay());

    act(() => {
      result.current.handleDragStart({
        active: { data: { current: { imageUrl: 'https://cdn.example.com/drag.png' } } },
      } as never);
      result.current.finalizeDropAnimation();
    });

    expect(result.current.overlayContent).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.overlayContent).toBeNull();
  });
});
