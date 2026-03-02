import { describe, it, expect, vi } from 'vitest';

describe('viewportLockRuntime', () => {
  it('initializes singleton runtime once and reuses first service', async () => {
    vi.resetModules();
    const runtime = await import('./viewportLockRuntime');

    const serviceA = { lockLightboxViewport: vi.fn() };
    const serviceB = { lockLightboxViewport: vi.fn() };

    const first = runtime.initializeViewportLockRuntime(serviceA as never);
    const second = runtime.initializeViewportLockRuntime(serviceB as never);
    const resolved = runtime.getViewportLockRuntime();

    expect(first).toBe(serviceA);
    expect(second).toBe(serviceA);
    expect(resolved).toBe(serviceA);
  });

  it('lazily creates runtime service when not initialized', async () => {
    vi.resetModules();
    const createdService = { lockLightboxViewport: vi.fn() };
    const createViewportLockService = vi.fn(() => createdService);

    vi.doMock('@/shared/services/viewport/viewportLockService', () => ({
      createViewportLockService,
    }));

    const runtime = await import('./viewportLockRuntime');
    const resolved = runtime.getViewportLockRuntime();

    expect(resolved).toBe(createdService);
    expect(createViewportLockService).toHaveBeenCalledTimes(1);
  });
});
