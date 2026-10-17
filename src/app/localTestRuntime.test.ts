import { afterEach, describe, expect, it } from 'vitest';
import {
  initializeLocalTestRuntime,
  isLocalTestMode,
  publishLocalTestExtensionDiagnostics,
} from './localTestRuntime';

describe('local test runtime', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    delete window.__ASTRID_APP_LOCAL_TEST__;
  });

  it('requires both DEV and the exact localTest=1 query value', () => {
    expect(isLocalTestMode({ DEV: true }, '?localTest=1')).toBe(true);
    expect(isLocalTestMode({ DEV: true }, '?localTest=0')).toBe(false);
    expect(isLocalTestMode({ DEV: false }, '?localTest=1')).toBe(false);
  });

  it('publishes stable loader and runtime diagnostic channels', () => {
    window.history.replaceState({}, '', '/tools/video-editor?localTest=1');
    initializeLocalTestRuntime();
    publishLocalTestExtensionDiagnostics('runtime', [{
      extensionId: 'haus.astrid.zed',
      source: 'extension',
      severity: 'error',
      code: 'runtime/z',
      message: 'Zed failed',
    }, {
      extensionId: 'haus.astrid.alpha',
      source: 'extension',
      severity: 'warning',
      code: 'runtime/a',
      message: 'Alpha warned',
    }]);

    expect(window.__ASTRID_APP_LOCAL_TEST__).toMatchObject({
      enabled: true,
      diagnostics: {
        loader: [],
        runtime: [
          { extensionId: 'haus.astrid.alpha', code: 'runtime/a' },
          { extensionId: 'haus.astrid.zed', code: 'runtime/z' },
        ],
      },
    });
  });
});
