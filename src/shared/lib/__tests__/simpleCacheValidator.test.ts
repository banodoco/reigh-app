import { describe, it, expect, vi } from 'vitest';

// Mock errorHandler
vi.mock('@/shared/lib/errorHandler', () => ({
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
    expect(typeof (window as any).validateImageCache).toBe('function');
    expect(typeof (window as any).startCacheWatch).toBe('function');
    expect(typeof (window as any).showCacheStats).toBe('function');
    expect(typeof (window as any).showCacheHelp).toBe('function');
  });

  it('validateImageCache runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as any).validateImageCache()).not.toThrow();

    consoleSpy.mockRestore();
    consoleEndSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('showCacheStats runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as any).showCacheStats()).not.toThrow();

    consoleLogSpy.mockRestore();
  });

  it('showCacheHelp runs without throwing', async () => {
    await import('../simpleCacheValidator');
    const consoleSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    const consoleEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => (window as any).showCacheHelp()).not.toThrow();

    consoleSpy.mockRestore();
    consoleEndSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('startCacheWatch registers stopCacheWatch', async () => {
    await import('../simpleCacheValidator');
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    (window as any).startCacheWatch();

    expect(typeof (window as any).stopCacheWatch).toBe('function');

    // Clean up the interval
    (window as any).stopCacheWatch();

    consoleLogSpy.mockRestore();
  });
});
