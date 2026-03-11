import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationFailure, operationSuccess } from '@/shared/lib/operationResult';
import { persistOptimisticReferenceSelection } from './persistOptimisticReferenceSelection';

const runOptimisticCacheUpdateMock = vi.fn();
const persistReferenceSelectionMock = vi.fn();

vi.mock('./optimisticCacheUpdate', () => ({
  runOptimisticCacheUpdate: (...args: unknown[]) => runOptimisticCacheUpdateMock(...args),
}));

vi.mock('./referenceDomainService', () => ({
  persistReferenceSelection: (...args: unknown[]) => persistReferenceSelectionMock(...args),
}));

describe('persistOptimisticReferenceSelection', () => {
  beforeEach(() => {
    runOptimisticCacheUpdateMock.mockReset();
    persistReferenceSelectionMock.mockReset();
  });

  it('returns the persistence success result after the optimistic update succeeds', async () => {
    const success = operationSuccess(undefined, { policy: 'best_effort' });
    runOptimisticCacheUpdateMock.mockReturnValue(success);
    persistReferenceSelectionMock.mockResolvedValue(success);

    const result = await persistOptimisticReferenceSelection({
      queryClient: {} as never,
      selectedProjectId: 'project-1',
      optimisticContext: 'useReferenceUpload.handleStyleReferenceUpload.optimisticUpdate',
      applyOptimisticUpdate: vi.fn(),
      updateProjectImageSettings: vi.fn(),
    });

    expect(result).toEqual(success);
    expect(persistReferenceSelectionMock).toHaveBeenCalledTimes(1);
  });

  it('returns the optimistic failure result without rewrapping it', async () => {
    const failure = operationFailure(new Error('cache write failed'), {
      message: 'Failed to update cached reference selection',
      errorCode: 'reference_optimistic_cache_update_failed',
      policy: 'degrade',
      recoverable: true,
    });
    runOptimisticCacheUpdateMock.mockReturnValue(failure);

    const result = await persistOptimisticReferenceSelection({
      queryClient: {} as never,
      selectedProjectId: 'project-1',
      optimisticContext: 'useReferenceUpload.handleStyleReferenceUpload.optimisticUpdate',
      applyOptimisticUpdate: vi.fn(),
      updateProjectImageSettings: vi.fn(),
    });

    expect(result).toBe(failure);
    expect(persistReferenceSelectionMock).not.toHaveBeenCalled();
  });

  it('returns the persistence failure result without rewrapping it', async () => {
    const optimisticSuccess = operationSuccess(undefined, { policy: 'best_effort' });
    const persistFailure = operationFailure(new Error('write failed'), {
      message: 'Failed to persist selected reference settings',
      errorCode: 'reference_selection_persist_failed',
      policy: 'degrade',
      recoverable: true,
    });
    runOptimisticCacheUpdateMock.mockReturnValue(optimisticSuccess);
    persistReferenceSelectionMock.mockResolvedValue(persistFailure);

    const result = await persistOptimisticReferenceSelection({
      queryClient: {} as never,
      selectedProjectId: 'project-1',
      optimisticContext: 'useReferenceUpload.handleStyleReferenceUpload.optimisticUpdate',
      applyOptimisticUpdate: vi.fn(),
      updateProjectImageSettings: vi.fn(),
    });

    expect(result).toBe(persistFailure);
  });
});
