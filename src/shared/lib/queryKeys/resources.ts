export const resourceQueryKeys = {
  list: (projectId: string, type?: string) => ['resources', projectId, type] as const,
  detail: (id: string) => ['resource', id] as const,
  all: ['resources'] as const,
  public: (type?: string) => ['public-resources', type] as const,
} as const;
