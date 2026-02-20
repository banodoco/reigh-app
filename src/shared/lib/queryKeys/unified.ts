const NO_PROJECT_KEY = '__no-project__';
const normalizeProjectId = (projectId: string | null | undefined): string => projectId ?? NO_PROJECT_KEY;

export const unifiedGenerationQueryKeys = {
  all: ['unified-generations'] as const,
  projectPrefix: (projectId: string | null | undefined) => ['unified-generations', 'project', normalizeProjectId(projectId)] as const,
  byProject: (
    projectId: string | null | undefined,
    page?: number,
    limit?: number,
    filters?: string | null,
    includeTaskData?: boolean
  ) => ['unified-generations', 'project', normalizeProjectId(projectId), page, limit, filters, includeTaskData] as const,
} as const;
