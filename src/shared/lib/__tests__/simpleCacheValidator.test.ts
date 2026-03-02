import { describe, it, expect, vi } from 'vitest';

// Mock errorHandler
vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

// simpleCacheValidator registers globals on import when import.meta.env.DEV is true.
// In vitest, DEV is true so the globals should be registered.
// However, the module uses side-effects on import, so we need dynamic import
// after cleaning up any previous state.

describe('simpleCacheValidator', () => {
  it('registers global functions in dev mode', async () => {
    // The module may have already been imported; let's just check directly
    await import('../simpleCacheValidator');

    // In vitest (DEV=true), these should be registered
    expect(typeof (window as unknown).validateImageCache).toBe('function');
    expect(typeof (window as unknown).startCacheWatch).toBe('function');
    expect(typeof (window as unknown).showCacheStats).toBe('function');
    expect(typeof (window as unknown).showCacheHelp).toBe('function');
    expect((window as unknown).validateImageCache).toBeDefined();
  });

  it('validateImageCache runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as unknown).validateImageCache()).not.toThrow();

    consoleSpy.mockRestore();
    consoleEndSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('showCacheStats runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as unknown).showCacheStats()).not.toThrow();

    consoleLogSpy.mockRestore();
  });

  it('showCacheHelp runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as unknown).showCacheHelp()).not.toThrow();

    consoleSpy.mockRestore();
    consoleEndSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('startCacheWatch registers stopCacheWatch', async () => {
    await import('../simpleCacheValidator');
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    (window as unknown).startCacheWatch();

    expect(typeof (window as unknown).stopCacheWatch).toBe('function');

    // Clean up the interval
    (window as unknown).stopCacheWatch();

    consoleLogSpy.mockRestore();
  });
});
