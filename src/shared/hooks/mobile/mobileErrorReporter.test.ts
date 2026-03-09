import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('../../lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) =>
    mocks.normalizeAndPresentError(...args),
}));

describe('mobileErrorReporter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('reports each non-fatal mobile error key only once', async () => {
    const { reportNonFatalMobileError } = await import('./mobileErrorReporter');

    reportNonFatalMobileError('touch-detect', new Error('first'));
    reportNonFatalMobileError('touch-detect', new Error('second'));
    reportNonFatalMobileError('orientation', new Error('third'));

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledTimes(2);
    expect(mocks.normalizeAndPresentError).toHaveBeenNthCalledWith(
      1,
      expect.any(Error),
      {
        context: 'useMobile.touch-detect',
        showToast: false,
      },
    );
    expect(mocks.normalizeAndPresentError).toHaveBeenNthCalledWith(
      2,
      expect.any(Error),
      {
        context: 'useMobile.orientation',
        showToast: false,
      },
    );
  });
});
