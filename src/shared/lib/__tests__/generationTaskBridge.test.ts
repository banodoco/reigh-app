import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetPrimaryTaskMappingForGeneration,
  mockHandleError,
} = vi.hoisted(() => {
  const mockGetPrimaryTaskMappingForGeneration = vi.fn();
  const mockHandleError = vi.fn();
  return {
    mockGetPrimaryTaskMappingForGeneration,
    mockHandleError,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((options: unknown) => options),
}));

vi.mock('@/shared/lib/generationTaskRepository', () => ({
  getPrimaryTaskIdForGeneration: (...args: unknown[]) => mockGetPrimaryTaskMappingForGeneration(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

import { useResolveGenerationTaskMapping } from '@/domains/generation/hooks/tasks/usePrimaryTaskMapping';

describe('generationTaskMapping resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves repository status semantics from the mutation function', async () => {
    mockGetPrimaryTaskMappingForGeneration.mockResolvedValue({
      generationId: 'gen-1',
      taskId: null,
      status: 'scope_mismatch',
    });

    const mutation = useResolveGenerationTaskMapping() as {
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
    expect(mockGetPrimaryTaskMappingForGeneration).toHaveBeenCalledWith('gen-1');
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('routes unexpected mutation errors through the shared error handler', () => {
    const mutation = useResolveGenerationTaskMapping() as {
      onError: (error: Error) => void;
    };

    const error = new Error('test');
    mutation.onError(error);

    expect(mockHandleError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: 'GenerationTaskMapping', showToast: false }),
    );
    expect(mockGetPrimaryTaskMappingForGeneration).not.toHaveBeenCalled();
  });
});
