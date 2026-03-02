import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
}));

vi.mock('./debugConfig', () => ({
  debugConfig: {
    isEnabled: mocks.isEnabled,
  },
}));

import {
  debugChannelEnabled,
  debugLog,
  debugWarn,
  disableDebugChannel,
  enableDebugChannel,
  resetDebugChannel,
} from './debugConsole';

describe('debugConsole', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
    resetDebugChannel('cache');
    resetDebugChannel('render');
    mocks.isEnabled.mockReturnValue(false);
  });

  it('respects debugConfig by default and supports per-channel overrides', () => {
    mocks.isEnabled.mockReturnValue(true);
    expect(debugChannelEnabled('cache')).toBe(true);

    disableDebugChannel('cache');
    expect(debugChannelEnabled('cache')).toBe(false);

    enableDebugChannel('cache');
    expect(debugChannelEnabled('cache')).toBe(true);

    resetDebugChannel('cache');
    expect(debugChannelEnabled('cache')).toBe(true);
  });

  it('logs only when channel is enabled or force flag is set', () => {
    debugLog('cache', 'suppressed');
    expect(logSpy).not.toHaveBeenCalled();

    enableDebugChannel('cache');
    debugLog('cache', 'enabled');
    expect(logSpy).toHaveBeenCalledWith('[cache] enabled');

    debugLog('cache', 'with-data', { ok: true });
    expect(logSpy).toHaveBeenCalledWith('[cache] with-data', { ok: true });

    disableDebugChannel('cache');
    debugLog('cache', 'forced', undefined, true);
    expect(logSpy).toHaveBeenCalledWith('[cache] forced');
  });

  it('warns with tagged messages when enabled or forced', () => {
    debugWarn('render', 'suppressed');
    expect(warnSpy).not.toHaveBeenCalled();

    enableDebugChannel('render');
    debugWarn('render', 'enabled');
    expect(warnSpy).toHaveBeenCalledWith('[render] enabled');

    debugWarn('render', 'with-data', { id: 1 });
    expect(warnSpy).toHaveBeenCalledWith('[render] with-data', { id: 1 });

    disableDebugChannel('render');
    debugWarn('render', 'forced', undefined, true);
    expect(warnSpy).toHaveBeenCalledWith('[render] forced');
  });
});
