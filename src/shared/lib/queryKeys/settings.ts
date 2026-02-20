export const settingsQueryKeys = {
  tool: (toolId: string, projectId?: string, shotId?: string) =>
    ['toolSettings', toolId, projectId, shotId] as const,
  byTool: (toolId: string) => ['toolSettings', toolId] as const,
  all: ['toolSettings'] as const,
  user: ['user-settings'] as const,
} as const;
