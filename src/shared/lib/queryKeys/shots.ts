export const shotQueryKeys = {
  all: ['shots'] as const,
  list: (projectId: string, maxImages?: number) => ['shots', projectId, maxImages] as const,
  detail: (shotId: string) => ['shot', shotId] as const,
  positions: (projectId: string) => ['shot-positions', projectId] as const,
  positionsAll: ['shot-positions'] as const,
  regenData: (shotId: string) => ['shot-regen-data', shotId] as const,
  batchSettings: (shotId: string) => ['shot-batch-settings', shotId] as const,
} as const;
