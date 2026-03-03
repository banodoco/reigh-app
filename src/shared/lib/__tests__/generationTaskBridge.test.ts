import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetPrimaryTaskIdForGeneration,
  mockHandleError,
} = vi.hoisted(() => {
  const mockGetPrimaryTaskIdForGeneration = vi.fn();
  const mockHandleError = vi.fn();
  return {
    mockGetPrimaryTaskIdForGeneration,
    mockHandleError,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((options: unknown) => options),
}));

vi.mock('@/shared/lib/generationTaskRepository', () => ({
  getPrimaryTaskIdForGeneration: (...args: unknown[]) => mockGetPrimaryTaskIdForGeneration(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

import { useGetPrimaryTaskIdForGeneration } from '../../hooks/tasks/usePrimaryTaskMapping';

describe('generationTaskBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves repository status semantics from the mutation function', async () => {
    mockGetPrimaryTaskIdForGeneration.mockResolvedValue({
      generationId: 'gen-1',
      taskId: null,
      status: 'scope_mismatch',
    });

    const mutation = useGetPrimaryTaskIdForGeneration() as {
      mutationFn: (id: string) => Promise<{
        generationId: string;
        taskId: string | null;
        status: string;
      }>;
    };

    await expect(mutation.mutationFn('gen-1')).resolves.toEqual({
      generationId: 'gen-1',
      taskId: null,
      status: 'scope_mismatch',
    });
    expect(mockGetPrimaryTaskIdForGeneration).toHaveBeenCalledWith('gen-1');
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('routes unexpected mutation errors through the shared error handler', () => {
    const mutation = useGetPrimaryTaskIdForGeneration() as {
      onError: (error: Error) => void;
    };

    const error = new Error('test');
    mutation.onError(error);

    expect(mockHandleError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: 'GenerationTaskBridge', showToast: false }),
    );
    expect(mockGetPrimaryTaskIdForGeneration).not.toHaveBeenCalled();
  });
});
