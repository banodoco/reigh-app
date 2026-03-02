import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaGalleryInteractionController } from './useMediaGalleryInteractionController';

const useMediaGalleryHandlersSpy = vi.fn();
const useMobileInteractionsSpy = vi.fn();

vi.mock('./useMediaGalleryHandlers', () => ({
  useMediaGalleryHandlers: (args: unknown) => useMediaGalleryHandlersSpy(args),
}));

vi.mock('./useMobileInteractions', () => ({
  useMobileInteractions: (args: unknown) => useMobileInteractionsSpy(args),
}));

describe('useMediaGalleryInteractionController', () => {
  it('returns composed gallery and mobile handler groups', () => {
    const galleryHandlers = { onClick: vi.fn() };
    const mobileInteractions = { onLongPress: vi.fn() };
    useMediaGalleryHandlersSpy.mockReturnValue(galleryHandlers);
    useMobileInteractionsSpy.mockReturnValue(mobileInteractions);

    const handlersInput = { foo: 'bar' };
    const mobileInput = { isMobile: true };

    const { result } = renderHook(() =>
      useMediaGalleryInteractionController({
        handlers: handlersInput as never,
        mobile: mobileInput as never,
      }),
    );

    expect(useMediaGalleryHandlersSpy).toHaveBeenCalledWith(handlersInput);
    expect(useMobileInteractionsSpy).toHaveBeenCalledWith(mobileInput);
    expect(result.current).toEqual({
      galleryHandlers,
      mobileInteractions,
    });
  });
});
