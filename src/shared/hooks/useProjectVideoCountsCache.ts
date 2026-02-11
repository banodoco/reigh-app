import React, { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { queryKeys } from '@/shared/lib/queryKeys';

/** Counts stored per shot */
interface ShotCounts {
  videoCount: number;
  finalVideoCount: number;
  hasStructureVideo: boolean;
}

/**
 * Project-wide video counts cache
 * Fetches all shot video counts for a project in a single query
 */
class ProjectVideoCountsCache {
  private cache = new Map<string, Map<string, ShotCounts>>(); // projectId -> shotId -> counts

  getProjectCounts(projectId: string): Map<string, ShotCounts> | null {
    return this.cache.get(projectId) || null;
  }

  getShotCounts(projectId: string, shotId: string): ShotCounts | null {
    const projectCounts = this.cache.get(projectId);
    if (!projectCounts) return null;
    return projectCounts.get(shotId) || null;
  }

  setProjectCounts(projectId: string, counts: Map<string, ShotCounts>): void {
    this.cache.set(projectId, counts);
  }

  clear(): void {
    this.cache.clear();
  }

  deleteProject(projectId: string): void {
    this.cache.delete(projectId);
  }

  // Get cache size for debugging
  size(): number {
    return this.cache.size;
  }

  // Get all cached project IDs for debugging
  getCachedProjectIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global cache instance that persists across component remounts
const globalProjectVideoCountsCache = new ProjectVideoCountsCache();

/**
 * Check if a shot's settings contain structure video configuration.
 * Handles both new array format and legacy single-video format.
 */
function shotSettingsHaveStructureVideo(settings: Record<string, unknown> | null): boolean {
  if (!settings) return false;
  const svSettings = settings['travel-structure-video'] as Record<string, unknown> | undefined;
  if (!svSettings) return false;

  // New array format
  const videos = svSettings.structure_videos as unknown[] | undefined;
  if (videos && videos.length > 0) return true;

  // Legacy single-video format
  const path = svSettings.structure_video_path;
  if (path && path !== null) return true;

  return false;
}

/**
 * Fetch all shot video counts + structure video presence for a project
 */
async function fetchProjectShotDataFromDB(projectId: string): Promise<Map<string, ShotCounts>> {
  // Parallel fetch: shot statistics (from view) + structure video presence (from shots table)
  const [statsResult, shotsResult] = await Promise.all([
    supabase
      .from('shot_statistics')
      .select('shot_id, video_count, final_video_count')
      .eq('project_id', projectId),
    supabase
      .from('shots')
      .select('id, settings')
      .eq('project_id', projectId),
  ]);

  if (statsResult.error) {
    console.error('[ProjectVideoCountsCache] Error fetching shot statistics:', statsResult.error);
    throw statsResult.error;
  }

  // Build structure video presence set
  const structureVideoShots = new Set<string>();
  if (!shotsResult.error && shotsResult.data) {
    for (const shot of shotsResult.data) {
      if (shotSettingsHaveStructureVideo(shot.settings as Record<string, unknown> | null)) {
        structureVideoShots.add(shot.id);
      }
    }
  }
  console.log('[StructureVideo] Project cache fetched', {
    projectId,
    totalShots: shotsResult.data?.length ?? 0,
    shotsWithStructureVideo: structureVideoShots.size,
    shotIds: [...structureVideoShots],
  });

  const counts = new Map<string, ShotCounts>();
  statsResult.data?.forEach(row => {
    counts.set(row.shot_id, {
      videoCount: row.video_count || 0,
      finalVideoCount: row.final_video_count || 0,
      hasStructureVideo: structureVideoShots.has(row.shot_id),
    });
  });

  // Include shots that have structure videos but no statistics entry
  for (const shotId of structureVideoShots) {
    if (!counts.has(shotId)) {
      counts.set(shotId, {
        videoCount: 0,
        finalVideoCount: 0,
        hasStructureVideo: true,
      });
    }
  }

  return counts;
}

/**
 * Hook to fetch and cache all shot video counts for a project
 * Provides instant access to any shot's video count within the project
 */
export function useProjectVideoCountsCache(projectId: string | null) {
  const cacheRef = useRef(globalProjectVideoCountsCache);

  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(queryKeys.projectStats.videos(projectId!));

  // Query to fetch all shot video counts for the project
  const { data: projectCounts, isLoading, error, refetch } = useQuery<Map<string, ShotCounts>>({
    queryKey: queryKeys.projectStats.videos(projectId!),
    queryFn: () => fetchProjectShotDataFromDB(projectId!),
    enabled: !!projectId,
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
  });

  // Update cache when data changes
  React.useEffect(() => {
    if (projectCounts && projectId) {
      cacheRef.current.setProjectCounts(projectId, projectCounts);
    }
  }, [projectCounts, projectId]);

  const getShotVideoCount = useCallback((shotId: string | null): number | null => {
    if (!projectId || !shotId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getShotCounts(projectId, shotId);
    if (cachedCounts !== null) {
      return cachedCounts.videoCount;
    }

    // Then try current query data
    if (projectCounts) {
      const counts = projectCounts.get(shotId);
      return counts !== undefined ? counts.videoCount : null;
    }

    return null;
  }, [projectId, projectCounts]);

  const getFinalVideoCount = useCallback((shotId: string | null): number | null => {
    if (!projectId || !shotId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getShotCounts(projectId, shotId);
    if (cachedCounts !== null) {
      return cachedCounts.finalVideoCount;
    }

    // Then try current query data
    if (projectCounts) {
      const counts = projectCounts.get(shotId);
      return counts !== undefined ? counts.finalVideoCount : null;
    }

    return null;
  }, [projectId, projectCounts]);

  const getHasStructureVideo = useCallback((shotId: string | null): boolean | null => {
    if (!projectId || !shotId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getShotCounts(projectId, shotId);
    if (cachedCounts !== null) {
      return cachedCounts.hasStructureVideo;
    }

    // Then try current query data
    if (projectCounts) {
      const counts = projectCounts.get(shotId);
      return counts !== undefined ? counts.hasStructureVideo : null;
    }

    return null;
  }, [projectId, projectCounts]);

  const getAllShotCounts = useCallback((): Map<string, ShotCounts> | null => {
    if (!projectId) return null;

    // First try cache
    const cachedCounts = cacheRef.current.getProjectCounts(projectId);
    if (cachedCounts) {
      return cachedCounts;
    }

    // Then try current query data
    return projectCounts || null;
  }, [projectId, projectCounts]);

  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
  }, []);

  const deleteProjectCache = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    cacheRef.current.deleteProject(projectId);
  }, []);

  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
  }, [projectId, getAllShotCounts]);

  // Invalidate cache when certain query keys change (video additions/deletions)
  const invalidateOnVideoChanges = useCallback(() => {
    if (projectId) {
      cacheRef.current.deleteProject(projectId);
      refetch();
    }
  }, [projectId, refetch]);

  return {
    getShotVideoCount,
    getFinalVideoCount,
    getHasStructureVideo,
    getAllShotCounts,
    isLoading,
    error,
    refetch,
    clearCache,
    deleteProjectCache,
    invalidateOnVideoChanges,
    logCacheState
  };
}
