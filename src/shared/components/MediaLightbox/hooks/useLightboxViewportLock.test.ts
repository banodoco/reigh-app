import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLightboxViewportLock } from './useLightboxViewportLock';

const lockLightboxViewportMock = vi.fn();
const getViewportLockRuntimeMock = vi.fn();
const acquireLightboxOpenStateMock = vi.fn();

vi.mock('@/shared/runtime/viewportLockRuntime', () => ({
  getViewportLockRuntime: () => getViewportLockRuntimeMock(),
}));

vi.mock('@/features/lightbox/state/lightboxOpenState', () => ({
  acquireLightboxOpenState: () => acquireLightboxOpenStateMock(),
}));

describe('useLightboxViewportLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewportLockRuntimeMock.mockReturnValue({
      lockLightboxViewport: lockLightboxViewportMock,
    });
    lockLightboxViewportMock.mockReturnValue(vi.fn());
    acquireLightboxOpenStateMock.mockReturnValue(vi.fn());
  });

  it('acquires lightbox state and viewport lock when not modal, then releases on cleanup', () => {
    const releaseLightboxOpen = vi.fn();
    const unlockViewport = vi.fn();
    acquireLightboxOpenStateMock.mockReturnValue(releaseLightboxOpen);
    lockLightboxViewportMock.mockReturnValue(unlockViewport);

    const { unmount } = renderHook(() =>
      useLightboxViewportLock({ isActuallyModal: false }),
    );

    expect(acquireLightboxOpenStateMock).toHaveBeenCalledTimes(1);
    expect(lockLightboxViewportMock).toHaveBeenCalledTimes(1);

    act(() => {
      unmount();
    });

    expect(unlockViewport).toHaveBeenCalledTimes(1);
    expect(releaseLightboxOpen).toHaveBeenCalledTimes(1);
  });

  it('does not lock viewport when component is actually modal', () => {
    renderHook(() => useLightboxViewportLock({ isActuallyModal: true }));

    expect(acquireLightboxOpenStateMock).not.toHaveBeenCalled();
    expect(lockLightboxViewportMock).not.toHaveBeenCalled();
  });
});
