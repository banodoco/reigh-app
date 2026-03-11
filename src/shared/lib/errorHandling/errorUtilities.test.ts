import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  categorizeError: vi.fn(),
  logAppError: vi.fn(),
  getErrorTitle: vi.fn(),
  getErrorDescription: vi.fn(),
  emitErrorNotification: vi.fn(),
}));

vi.mock('./errors', async () => {
  const actual = await vi.importActual<typeof import('./errors')>('./errors');
  return {
    ...actual,
    categorizeError: (...args: unknown[]) => mocks.categorizeError(...args),
  };
});

vi.mock('@/shared/lib/errorHandling/errorPresentation', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/errorHandling/errorPresentation')>(
    '@/shared/lib/errorHandling/errorPresentation',
  );
  return {
    ...actual,
    logAppError: (...args: unknown[]) => mocks.logAppError(...args),
    getErrorTitle: (...args: unknown[]) => mocks.getErrorTitle(...args),
    getErrorDescription: (...args: unknown[]) => mocks.getErrorDescription(...args),
  };
});

vi.mock('@/shared/lib/errorHandling/errorNotifier', () => ({
  emitErrorNotification: (...args: unknown[]) => mocks.emitErrorNotification(...args),
}));

import { normalizeAppError } from './errorNormalization';
import { normalizeAndLogError } from './normalizeAndLogError';
import { notifyError } from './notifyError';
import { reportAndRethrow, reportError } from './coreReporter';
import {
  installRuntimeErrorPresenter,
  presentRuntimeError,
} from './runtimeErrorPresenter';

describe('error handling utility modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes app errors with merged context and log data', () => {
    const appError = { message: 'normalized' } as never;
    mocks.categorizeError.mockReturnValue(appError);

    const result = normalizeAppError(new Error('boom'), {
      context: 'saveProject',
      logData: { projectId: 'project-1' },
    });

    expect(mocks.categorizeError).toHaveBeenCalledWith(new Error('boom'), {
      context: 'saveProject',
      projectId: 'project-1',
    });
    expect(result).toBe(appError);
  });

  it('normalizes and logs errors before reporting them', () => {
    const appError = { message: 'normalized' } as never;
    mocks.categorizeError.mockReturnValue(appError);

    const normalized = normalizeAndLogError(new Error('boom'), {
      context: 'fetchTasks',
      logData: { projectId: 'project-1' },
    });
    const onError = vi.fn();
    const reported = reportError(new Error('boom'), {
      context: 'fetchTasks',
      logData: { projectId: 'project-1' },
      onError,
    });

    expect(mocks.logAppError).toHaveBeenNthCalledWith(1, 'fetchTasks', appError);
    expect(mocks.logAppError).toHaveBeenNthCalledWith(2, 'fetchTasks', appError);
    expect(normalized).toBe(appError);
    expect(reported).toBe(appError);
    expect(onError).toHaveBeenCalledWith(appError);
  });

  it('rethrows the reported app error', () => {
    const appError = { message: 'normalized' } as never;
    mocks.categorizeError.mockReturnValue(appError);

    let thrown: unknown;
    try {
      reportAndRethrow(new Error('boom'), {
        context: 'saveProject',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(appError);
  });

  it('notifies with derived title/description and uses the installed runtime presenter', () => {
    const appError = { message: 'normalized' } as never;
    mocks.getErrorTitle.mockReturnValue('Toast title');
    mocks.getErrorDescription.mockReturnValue('Toast description');
    mocks.emitErrorNotification.mockReturnValue(true);

    expect(presentRuntimeError(appError)).toBe(false);

    const presenter = vi.fn().mockReturnValue(true);
    installRuntimeErrorPresenter(presenter);

    expect(notifyError(appError, 'Override title')).toBe(true);
    expect(mocks.emitErrorNotification).toHaveBeenCalledWith({
      appError,
      title: 'Toast title',
      description: 'Toast description',
    });
    expect(presentRuntimeError(appError, 'Runtime title')).toBe(true);
    expect(presenter).toHaveBeenCalledWith(appError, 'Runtime title');
  });
});
