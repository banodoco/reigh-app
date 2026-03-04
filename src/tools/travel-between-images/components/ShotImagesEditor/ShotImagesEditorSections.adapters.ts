import {
  type OperationResult,
  toOperationResultError,
} from '@/shared/lib/operationResult';

export function adaptShotSelectionOperation(
  operation: (
    targetShotId: string,
    generationId: string,
  ) => Promise<OperationResult<{ added: boolean }>>,
) {
  return async (targetShotId: string, generationId: string): Promise<boolean> => {
    const result = await operation(targetShotId, generationId);
    if (!result.ok) {
      throw toOperationResultError(result);
    }
    return result.value.added;
  };
}

export function adaptShotCreationOperation(
  operation: (shotName: string) => Promise<OperationResult<{ shotId: string; shotName: string }>>,
) {
  return async (shotName: string): Promise<{ shotId: string; shotName: string }> => {
    const result = await operation(shotName);
    if (!result.ok) {
      throw toOperationResultError(result);
    }
    return result.value;
  };
}
