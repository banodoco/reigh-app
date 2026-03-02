import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

describe('reportNonFatalMobileError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reports a non-fatal mobile error once per key', async () => {
    const { reportNonFatalMobileError } = await import('./mobileErrorReporter');
    const error = new Error('camera denied');

    reportNonFatalMobileError('camera-permission', error);
    reportNonFatalMobileError('camera-permission', error);

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      {
        context: 'useMobile.camera-permission',
        showToast: false,
      },
    );
  });

  it('reports separate keys independently', async () => {
    const { reportNonFatalMobileError } = await import('./mobileErrorReporter');

    reportNonFatalMobileError('first-key', new Error('first'));
    reportNonFatalMobileError('second-key', new Error('second'));

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledTimes(2);
  });
});
