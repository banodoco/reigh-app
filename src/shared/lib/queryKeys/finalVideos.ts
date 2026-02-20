export const finalVideoQueryKeys = {
  byProject: (projectId: string) => ['shot-final-videos', projectId] as const,
  all: ['shot-final-videos'] as const,
} as const;
