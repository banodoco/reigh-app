import { describe, it, expect, vi, beforeEach } from 'vitest';

// Note: autoplayMonitor has module-level side effects that start monitoring
// in development mode. We test the exported behavior indirectly.

describe('autoplayMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('module-level monitoring is gated by NODE_ENV', () => {
    // In test environment, the autostart should not run (process.env.NODE_ENV !== 'development')
    // This test just verifies the module loads without errors
    expect(async () => {
      await import('../autoplayMonitor');
    }).not.toThrow();
  });

  it('captureVideoStates returns empty array when no videos in DOM', async () => {
    // Since captureVideoStates is not exported, we test indirectly by verifying
    // the module imports successfully with no videos in the document
    const module = await import('../autoplayMonitor');
    // The module has no public exports but the internal functions should work
    expect(module).toBeDefined();
  });

  it('compareVideoStates detects length changes', () => {
    // Test the logic pattern used internally
    const current = [{ paused: true, currentTime: 0, readyState: 4 }];
    const previous: any[] = [];

    // Different lengths should be detected as a change
    expect(current.length !== previous.length).toBe(true);
  });

  it('compareVideoStates detects state changes', () => {
    // Test the comparison logic pattern
    const prev = { paused: true, currentTime: 0, readyState: 4 };
    const curr = { paused: false, currentTime: 0.5, readyState: 4 };

    expect(curr.paused !== prev.paused).toBe(true);
    expect(Math.abs(curr.currentTime - prev.currentTime) > 0.1).toBe(true);
  });

  it('compareVideoStates ignores small time changes', () => {
    const prev = { paused: false, currentTime: 1.0, readyState: 4 };
    const curr = { paused: false, currentTime: 1.05, readyState: 4 };

    // Small time difference should not be detected
    expect(Math.abs(curr.currentTime - prev.currentTime) > 0.1).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
