export const projectStatsQueryKeys = {
  images: (projectId: string) => ['project-image-stats', projectId] as const,
  videos: (projectId: string) => ['project-video-counts', projectId] as const,
} as const;
