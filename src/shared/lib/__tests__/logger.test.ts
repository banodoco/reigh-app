import {
  describe,
  it,
  expect,
  vi
} from 'vitest';

// We need to control environment flags before importing the module.
// The logger module reads env flags at import time and during function calls.

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  location: { pathname: '/test' },
});

vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
});

vi.stubGlobal('navigator', {
  userAgent: 'test-agent',
});

// Mock the dynamic supabase import used by flushLogs
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock debugConfig used by reactProfilerOnRender
vi.mock('./debugConfig', () => ({
  debugConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
  },
}));

describe('logger', () => {
  // Since the module has side effects on import and uses getEnvFlag at runtime,
  // we test the exported functions by importing them after setup.

  describe('log function', () => {
    it('is a function', async () => {
      const { log } = await import('../logger');
      expect(typeof log).toBe('function');
    });

    it('does not throw when called', async () => {
      const { log } = await import('../logger');
      expect(() => log('TestTag', 'test message', { extra: 'data' })).not.toThrow();
    });

    it('accepts various argument types', async () => {
      const { log } = await import('../logger');
      expect(() => log('Tag', 'string', 42, true, null, undefined, { obj: 1 })).not.toThrow();
    });
  });

  describe('reactProfilerOnRender', () => {
    it('is a function', async () => {
      const { reactProfilerOnRender } = await import('../logger');
      expect(typeof reactProfilerOnRender).toBe('function');
    });

    it('does not throw when called with profiler args', async () => {
      const { reactProfilerOnRender } = await import('../logger');
      expect(() =>
        reactProfilerOnRender(
          'ComponentId',
          'mount',
          12.5,
          25.0,
          100.0,
          112.5,
          new Set()
        )
      ).not.toThrow();
    });

    it('handles missing/undefined arguments gracefully', async () => {
      const { reactProfilerOnRender } = await import('../logger');
      expect(() => reactProfilerOnRender()).not.toThrow();
      expect(() => reactProfilerOnRender('id', undefined, undefined)).not.toThrow();
    });
  });
});
