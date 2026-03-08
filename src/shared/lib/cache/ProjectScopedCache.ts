/**
 * Generic two-level cache: projectId -> itemId -> value.
 *
 * Used by useProjectGenerationModesCache and useProjectVideoCountsCache
 * (and any future per-project, per-shot caches) to avoid duplicating the
 * same Map-of-Maps boilerplate.
 */
export class ProjectScopedCache<T> {
  private cache = new Map<string, Map<string, T>>();

  getProject(projectId: string): Map<string, T> | null {
    return this.cache.get(projectId) ?? null;
  }

  getProjectWithFallback(
    projectId: string | null,
    fallback: Map<string, T> | null | undefined,
  ): Map<string, T> | null {
    if (!projectId) {
      return null;
    }

    const cached = this.getProject(projectId);
    if (cached) {
      return cached;
    }

    return fallback ?? null;
  }

  getItem(projectId: string, itemId: string): T | null {
    const projectMap = this.cache.get(projectId);
    if (!projectMap) return null;
    const value = projectMap.get(itemId);
    return value !== undefined ? value : null;
  }

  setProject(projectId: string, items: Map<string, T>): void {
    this.cache.set(projectId, items);
  }

  clear(): void {
    this.cache.clear();
  }

  deleteProject(projectId: string): void {
    this.cache.delete(projectId);
  }

  size(): number {
    return this.cache.size;
  }
}
