// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedClipsCount,
  setCachedClipsCount,
} from './clipCache';

const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

describe('clipCache', () => {
  beforeEach(() => {
    localStorage.clear();
    normalizeAndPresentErrorMock.mockReset();
  });

  it('returns zero for missing project ids and missing cached values', () => {
    expect(getCachedClipsCount(null)).toBe(0);
    expect(getCachedClipsCount('project-1')).toBe(0);
  });

  it('rejects invalid cached values and reports the invalid payload', () => {
    localStorage.setItem('join-clips-count-project-1', '999');

    expect(getCachedClipsCount('project-1')).toBe(0);
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      new Error('Invalid join-clips cached count'),
      {
        context: 'JoinClipsCache.read.invalid',
        showToast: false,
        logData: { projectId: 'project-1', cached: '999' },
      },
    );
  });

  it('stores normalized positive counts and removes zero-or-negative counts', () => {
    setCachedClipsCount('project-1', 4.9);
    expect(localStorage.getItem('join-clips-count-project-1')).toBe('4');

    setCachedClipsCount('project-1', 0);
    expect(localStorage.getItem('join-clips-count-project-1')).toBeNull();
  });

  it('reports storage write failures without throwing', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => setCachedClipsCount('project-1', 2)).not.toThrow();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'quota' }),
      {
        context: 'JoinClipsCache.write.error',
        showToast: false,
        logData: { projectId: 'project-1', count: 2 },
      },
    );

    setItemSpy.mockRestore();
  });
});
