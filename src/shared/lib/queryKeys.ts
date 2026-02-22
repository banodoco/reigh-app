import { apiQueryKeys } from '@/shared/lib/queryKeys/api';
import { creditQueryKeys } from '@/shared/lib/queryKeys/credits';
import { finalVideoQueryKeys } from '@/shared/lib/queryKeys/finalVideos';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';
import { projectStatsQueryKeys } from '@/shared/lib/queryKeys/projectStats';
import { resourceQueryKeys } from '@/shared/lib/queryKeys/resources';
import { segmentQueryKeys } from '@/shared/lib/queryKeys/segments';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';

export const queryKeys = {
  shots: shotQueryKeys,
  generations: generationQueryKeys,
  unified: unifiedGenerationQueryKeys,
  finalVideos: finalVideoQueryKeys,
  segments: segmentQueryKeys,
  tasks: taskQueryKeys,
  settings: settingsQueryKeys,
  resources: resourceQueryKeys,
  credits: creditQueryKeys,
  api: apiQueryKeys,
  presets: presetQueryKeys,
  projectStats: projectStatsQueryKeys,
} as const;

type QueryKeys = typeof queryKeys;
type QueryKeyOf<T> = T extends (...args: unknown[]) => infer R ? R : T;
