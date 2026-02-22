export const settingsQueryKeys = {
  tool: (toolId: string, projectId?: string, shotId?: string) =>
    ['toolSettings', toolId, projectId, shotId] as const,
  byTool: (toolId: string) => ['toolSettings', toolId] as const,
  all: ['toolSettings'] as const,
  user: ['user-settings'] as const,
  generationModes: (projectId: string) => ['project-generation-modes', projectId] as const,
} as const;
