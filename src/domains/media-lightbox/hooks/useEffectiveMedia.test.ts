import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEffectiveMedia } from './useEffectiveMedia';

vi.mock('@/shared/contexts/projectSelectionStore', () => ({
  getProjectSelectionFallbackId: () => 'astrid-intro',
}));

describe('useEffectiveMedia', () => {
  const baseProps = {
    isVideo: true,
    imageDimensions: { width: 1920, height: 1080 },
    projectAspectRatio: undefined,
  };

  it('keeps the incoming media URL while the active variant is unavailable', () => {
    const { result } = renderHook(() => useEffectiveMedia({
      ...baseProps,
      activeVariant: null,
      effectiveImageUrl: '/api/runtime/v1/objects/video-object',
    }));

    expect(result.current.effectiveVideoUrl).toBe('/api/runtime/v1/objects/video-object');
  });

  it('uses an available variant URL as an override', () => {
    const { result } = renderHook(() => useEffectiveMedia({
      ...baseProps,
      activeVariant: { location: 'sha256:variant-object' },
      effectiveImageUrl: '/api/runtime/v1/objects/video-object',
    }));

    expect(result.current.effectiveVideoUrl).toBe(
      '/api/astrid/v1/objects/sha256%3Avariant-object',
    );
  });
});
