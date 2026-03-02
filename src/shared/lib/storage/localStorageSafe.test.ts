import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readLocalStorageItem,
  removeLocalStorageItem,
  writeLocalStorageItem,
} from './localStorageSafe';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

describe('localStorageSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('reads and writes localStorage values successfully', () => {
    writeLocalStorageItem('safe-key', 'value-1', {
      context: 'localStorageSafe.write',
      fallback: undefined,
    });

    const value = readLocalStorageItem('safe-key', {
      context: 'localStorageSafe.read',
      fallback: null,
    });

    expect(value).toBe('value-1');
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('returns fallback and reports read failures', () => {
    const error = new Error('read failed');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw error;
    });

    const value = readLocalStorageItem('read-key', {
      context: 'localStorageSafe.read.error',
      fallback: 'fallback-value',
    });

    expect(value).toBe('fallback-value');
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'localStorageSafe.read.error',
        showToast: false,
        logData: { key: 'read-key' },
      }),
    );
  });

  it('reports write failures without throwing', () => {
    const error = new Error('write failed');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw error;
    });

    expect(() => {
      writeLocalStorageItem('write-key', 'write-value', {
        context: 'localStorageSafe.write.error',
        fallback: undefined,
      });
    }).not.toThrow();

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'localStorageSafe.write.error',
        showToast: false,
        logData: { key: 'write-key', valueLength: 'write-value'.length },
      }),
    );
  });

  it('reports remove failures without throwing', () => {
    const error = new Error('remove failed');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw error;
    });

    expect(() => {
      removeLocalStorageItem('remove-key', {
        context: 'localStorageSafe.remove.error',
        fallback: undefined,
      });
    }).not.toThrow();

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'localStorageSafe.remove.error',
        showToast: false,
        logData: { key: 'remove-key' },
      }),
    );
  });
});
