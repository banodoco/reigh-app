import { useMutation } from '@tanstack/react-query';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  getPrimaryTaskIdForGeneration as getPrimaryTaskMappingForGeneration,
  type GenerationTaskMapping,
} from '@/shared/lib/generationTaskRepository';

function getPrimaryTaskMapping(generationId: string): Promise<GenerationTaskMapping> {
  return getPrimaryTaskMappingForGeneration(generationId);
}

/**
 * Canonical on-demand generation -> task mapping resolver.
 * Preserves repository status semantics (`ok`, `not_loaded`, `missing_generation`, `scope_mismatch`,
 * `invalid_tasks_shape`, `query_failed`) so callers can branch explicitly.
 */
export function useResolveGenerationTaskMapping() {
  return useMutation<GenerationTaskMapping, Error, string>({
    mutationFn: getPrimaryTaskMapping,
    onError: (error: Error) => {
      normalizeAndPresentError(error, { context: 'GenerationTaskMapping', showToast: false });
    },
  });
}
