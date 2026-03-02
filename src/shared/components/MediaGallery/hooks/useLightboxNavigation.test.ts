import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLightboxNavigation } from './useLightboxNavigation';
import type { GeneratedImageWithMetadata } from '../types';

function makeImage(id: string): GeneratedImageWithMetadata {
  return {
    id,
    url: `https://cdn.example.com/${id}.png`,
    metadata: {},
    createdAt: '2025-01-01T00:00:00Z',
  } as GeneratedImageWithMetadata;
}

describe('useLightboxNavigation', () => {
  it('navigates within a local (non-server) image list', () => {
    const images = [makeImage('img-1'), makeImage('img-2'), makeImage('img-3')];
    const handleOpenLightbox = vi.fn();
    const onServerPageChange = vi.fn();
    const setPendingLightboxTarget = vi.fn();

    const { result } = renderHook(() =>
      useLightboxNavigation({
        activeLightboxMedia: images[1],
        filteredImages: images,
        isServerPagination: false,
        serverPage: 1,
        totalPages: 3,
        onServerPageChange,
        handleOpenLightbox,
        setPendingLightboxTarget,
      }),
    );

    act(() => {
      result.current.handleNextImage();
      result.current.handlePreviousImage();
      result.current.handleSetActiveLightboxIndex(0);
      result.current.handleSetActiveLightboxIndex(99);
    });

    expect(handleOpenLightbox).toHaveBeenNthCalledWith(1, images[2]);
    expect(handleOpenLightbox).toHaveBeenNthCalledWith(2, images[0]);
    expect(handleOpenLightbox).toHaveBeenNthCalledWith(3, images[0]);
    expect(onServerPageChange).not.toHaveBeenCalled();
    expect(setPendingLightboxTarget).not.toHaveBeenCalled();
  });

  it('sets pending target and changes page when crossing server page boundaries', () => {
    const images = [makeImage('img-1'), makeImage('img-2')];
    const handleOpenLightbox = vi.fn();
    const onServerPageChange = vi.fn();
    const setPendingLightboxTarget = vi.fn();

    const { result, rerender } = renderHook(
      ({ activeLightboxMedia, serverPage }) =>
        useLightboxNavigation({
          activeLightboxMedia,
          filteredImages: images,
          isServerPagination: true,
          serverPage,
          totalPages: 5,
          onServerPageChange,
          handleOpenLightbox,
          setPendingLightboxTarget,
        }),
      {
        initialProps: {
          activeLightboxMedia: images[1],
          serverPage: 2,
        },
      },
    );

    act(() => {
      result.current.handleNextImage();
    });

    expect(setPendingLightboxTarget).toHaveBeenCalledWith('first');
    expect(onServerPageChange).toHaveBeenCalledWith(3);
    expect(result.current.pendingTargetSetTimeRef.current).toEqual(expect.any(Number));

    rerender({ activeLightboxMedia: images[0], serverPage: 2 });

    act(() => {
      result.current.handlePreviousImage();
    });

    expect(setPendingLightboxTarget).toHaveBeenCalledWith('last');
    expect(onServerPageChange).toHaveBeenCalledWith(1);
  });

  it('is a no-op when no active media is set', () => {
    const handleOpenLightbox = vi.fn();
    const onServerPageChange = vi.fn();
    const setPendingLightboxTarget = vi.fn();

    const { result } = renderHook(() =>
      useLightboxNavigation({
        activeLightboxMedia: null,
        filteredImages: [makeImage('img-1')],
        isServerPagination: true,
        serverPage: 1,
        totalPages: 2,
        onServerPageChange,
        handleOpenLightbox,
        setPendingLightboxTarget,
      }),
    );

    act(() => {
      result.current.handleNextImage();
      result.current.handlePreviousImage();
    });

    expect(handleOpenLightbox).not.toHaveBeenCalled();
    expect(onServerPageChange).not.toHaveBeenCalled();
    expect(setPendingLightboxTarget).not.toHaveBeenCalled();
  });
});
