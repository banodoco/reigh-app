import React, { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import { 
  resolveGenerationMode, 
  extractToolSettings,
  type GenerationModeNormalized 
} from '@/shared/lib/settingsResolution';

/**
 * Project-wide generation modes cache
 * Fetches all shot generation modes for a project in a single query
 */
class ProjectGenerationModesCache {
  private cache = new Map<string, Map<string, GenerationModeNormalized>>(); // projectId -> shotId -> generationMode
  
  getProjectModes(projectId: string): Map<string, GenerationModeNormalized> | null {
    return this.cache.get(projectId) || null;
  }
  
  getShotMode(projectId: string, shotId: string): GenerationModeNormalized | null {
    const projectModes = this.cache.get(projectId);
    if (!projectModes) return null;
    const value = projectModes.get(shotId);
    return value !== undefined ? value : null;
  }
  
  setProjectModes(projectId: string, modes: Map<string, GenerationModeNormalized>): void {
    this.cache.set(projectId, modes);
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
const globalProjectGenerationModesCache = new ProjectGenerationModesCache();

/**
 * Fetch all shot generation modes for a project
 */
async function fetchProjectGenerationModesFromDB(projectId: string): Promise<Map<string, GenerationModeNormalized>> {
  
  // IMPORTANT:
  // This cache must match the effective settings resolution used by `useToolSettings`:
  // defaults → user → project → shot.
  //
  // If we only look at shots.settings, we will be wrong for shots that inherit
  // generationMode from user/project defaults.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id ?? null;

  // Skip queries if user is not authenticated (e.g., on public share pages)
  // RLS will block these queries anyway, causing 406 errors
  if (!userId) {
    return new Map<string, GenerationModeNormalized>();
  }

  const [userResult, projectResult, shotsResult] = await Promise.all([
    supabase.from('users').select('settings').eq('id', userId).maybeSingle(),
    supabase.from('projects').select('settings').eq('id', projectId).maybeSingle(),
    supabase.from('shots').select('id, settings').eq('project_id', projectId),
  ]);

  if (shotsResult.error) {
    console.error('[ProjectGenerationModesCache] Error fetching shot settings:', shotsResult.error);
    throw shotsResult.error;
  }

  const toolId = 'travel-between-images';
  const userToolSettings = extractToolSettings(userResult.data?.settings, toolId);
  const projectToolSettings = extractToolSettings(projectResult.data?.settings, toolId);

  const modes = new Map<string, GenerationModeNormalized>();
  (shotsResult.data || []).forEach((shot) => {
    const shotToolSettings = extractToolSettings(shot.settings, toolId);

    // Use shared resolution logic (priority: shot → project → user → defaults)
    // defaults to 'timeline' via normalizeGenerationMode
    const effectiveMode = resolveGenerationMode({
      shot: shotToolSettings,
      project: projectToolSettings,
      user: userToolSettings,
      // defaults not needed - normalizeGenerationMode handles undefined → 'timeline'
    });
    modes.set(shot.id, effectiveMode);
  });
  
  return modes;
}

/**
 * Hook to fetch and cache all shot generation modes for a project
 * Provides instant access to any shot's generation mode within the project
 *
 * @param projectId - The project ID to fetch modes for
 * @param options.enabled - Additional condition to enable the query (default: true)
 */
export function useProjectGenerationModesCache(projectId: string | null, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  const cacheRef = useRef(globalProjectGenerationModesCache);
  const queryClient = useQueryClient();
  
  // 🎯 SMART POLLING: Use DataFreshnessManager for intelligent polling decisions
  const smartPollingConfig = useSmartPollingConfig(['project-generation-modes', projectId]);
  
  // Query to fetch all shot generation modes for the project
  const { data: projectModes, isLoading, error, refetch } = useQuery<Map<string, GenerationModeNormalized>>({
    queryKey: ['project-generation-modes', projectId],
    queryFn: () => fetchProjectGenerationModesFromDB(projectId!),
    enabled: !!projectId && enabled,
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
    // 🎯 SMART POLLING: Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
  });
  
  // Update cache when data changes
  React.useEffect(() => {
    if (projectModes && projectId) {
      cacheRef.current.setProjectModes(projectId, projectModes);
    }
  }, [projectModes, projectId]);
  
  const getShotGenerationMode = useCallback((shotId: string | null, isMobile: boolean = false): GenerationModeNormalized | null => {
    // Mobile always uses batch mode
    if (isMobile) {
      return 'batch';
    }
    
    if (!projectId || !shotId) return null;
    
    // First try cache
    const cachedMode = cacheRef.current.getShotMode(projectId, shotId);
    if (cachedMode !== null) {
      return cachedMode;
    }
    
    // Then try current query data
    if (projectModes) {
      const value = projectModes.get(shotId);
      return value !== undefined ? value : null;
    }
    
    return null;
  }, [projectId, projectModes]);
  
  const getAllShotModes = useCallback((): Map<string, GenerationModeNormalized> | null => {
    if (!projectId) return null;
    
    // First try cache
    const cachedModes = cacheRef.current.getProjectModes(projectId);
    if (cachedModes) {
      return cachedModes;
    }
    
    // Then try current query data
    return projectModes || null;
  }, [projectId, projectModes]);
  
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
  }, []);
  
  const deleteProjectCache = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    cacheRef.current.deleteProject(projectId);
  }, []);
  
  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
  }, [projectId, getAllShotModes]);
  
  // Optimistically update a single shot's mode in cache
  const updateShotMode = useCallback((shotId: string | null, mode: GenerationModeNormalized) => {
    if (!projectId || !shotId) return;
    
    // Update in-memory cache immediately
    const currentModes = cacheRef.current.getProjectModes(projectId);
    if (currentModes) {
      currentModes.set(shotId, mode);
      cacheRef.current.setProjectModes(projectId, currentModes);
    }
    
    // CRITICAL: Also update React Query cache so it persists across re-renders
    // The previous code created updatedModes but never saved it!
    queryClient.setQueryData<Map<string, GenerationModeNormalized>>(
      ['project-generation-modes', projectId],
      (oldData) => {
        if (!oldData) return oldData;
        const newData = new Map(oldData);
        newData.set(shotId, mode);
        return newData;
      }
    );
  }, [projectId, queryClient]);
  
  // Invalidate cache when mode changes (for manual refresh if needed)
  const invalidateOnModeChange = useCallback(() => {
    if (projectId) {
      cacheRef.current.deleteProject(projectId);
      refetch();
    }
  }, [projectId, refetch]);

  return {
    getShotGenerationMode,
    getAllShotModes,
    updateShotMode,
    isLoading,
    error,
    refetch,
    clearCache,
    deleteProjectCache,
    invalidateOnModeChange,
    logCacheState
  };
}

