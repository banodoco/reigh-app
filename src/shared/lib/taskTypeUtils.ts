import { getTaskTypeFamilyFromFallback } from '@/shared/lib/taskTypeConfigFallback';

type TaskTypeFamily = 'travel' | 'join_clips' | 'character_animate';

function resolveTaskTypeFamily(taskType: string): TaskTypeFamily | undefined {
  // `clip_join` is a persisted variant_type, not a task_types row.
  if (taskType === 'clip_join') {
    return 'join_clips';
  }

  if (taskType === 'join_clips') {
    return 'join_clips';
  }

  return getTaskTypeFamilyFromFallback(taskType);
}

export const isJoinClipsTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return resolveTaskTypeFamily(taskType) === 'join_clips';
};

export const isTravelTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return resolveTaskTypeFamily(taskType) === 'travel';
};

export const isCharacterAnimateTaskType = (taskType: string | null | undefined): boolean => {
  if (!taskType) return false;
  return resolveTaskTypeFamily(taskType) === 'character_animate';
};

export { parseTaskParams } from '@/shared/lib/taskParamsUtils';
