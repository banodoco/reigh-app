import type { BaseTaskParams } from '../../taskCreation';
import {
  assignMappedPayloadFields,
  type PayloadFieldMapping,
} from '../../taskCreation/payloadMapping';

type PayloadSegment = Record<string, unknown> | null | undefined;

interface ComposeTaskParamsInput<TSource extends object> {
  source: TSource;
  baseParams?: Record<string, unknown>;
  segments?: readonly PayloadSegment[];
  mappedFields?: readonly PayloadFieldMapping<TSource>[];
}

interface ComposeTaskRequestInput<TSource extends { project_id: string }> {
  source: TSource;
  taskType: string;
  params: Record<string, unknown>;
}

/**
 * Shared task-payload composition primitive used across task families.
 */
export function composeTaskParams<TSource extends object>(
  input: ComposeTaskParamsInput<TSource>,
): Record<string, unknown> {
  const composed: Record<string, unknown> = {
    ...(input.baseParams ?? {}),
  };

  for (const segment of input.segments ?? []) {
    if (segment && typeof segment === 'object') {
      Object.assign(composed, segment);
    }
  }

  if (input.mappedFields && input.mappedFields.length > 0) {
    assignMappedPayloadFields(composed, input.source, input.mappedFields);
  }

  return composed;
}

export function composeTaskRequest<TSource extends { project_id: string }>(
  input: ComposeTaskRequestInput<TSource>,
): BaseTaskParams {
  return {
    project_id: input.source.project_id,
    task_type: input.taskType,
    params: input.params,
  };
}
