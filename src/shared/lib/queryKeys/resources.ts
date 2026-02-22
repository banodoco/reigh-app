export const resourceQueryKeys = {
  list: (projectId: string, type?: string) => ['resources', projectId, type] as const,
  detail: (id: string) => ['resource', id] as const,
  all: ['resources'] as const,
  public: (type?: string) => ['public-resources', type] as const,
  listByType: (type: string) => ['resources', type, 'v2'] as const,
  publicByType: (type: string) => ['public-resources', type, 'v2'] as const,
} as const;
