import React, { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import {
  resolveGenerationMode,
  extractToolSettings,
  type GenerationModeNormalized
} from '@/shared/lib/settingsResolution';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { ProjectScopedCache } from '@/shared/lib/cache/ProjectScopedCache';
import { toObjectRecord } from '@/shared/lib/jsonRecord';

// Global cache instance that persists across component remounts
const globalProjectGenerationModesCache = new ProjectScopedCache<GenerationModeNormalized>();

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
  const { data: sessionData } = await supabase().auth.getSession();
  const userId = sessionData?.session?.user?.id ?? null;

  // Skip queries if user is not authenticated (e.g., on public share pages)
  // RLS will block these queries anyway, causing 406 errors
  if (!userId) {
    return new Map<string, GenerationModeNormalized>();
  }

  const [userResult, projectResult, shotsResult] = await Promise.all([
    supabase().from('users').select('settings').eq('id', userId).maybeSingle(),
    supabase().from('projects').select('settings').eq('id', projectId).maybeSingle(),
    supabase().from('shots').select('id, settings').eq('project_id', projectId),
  ]);

  if (shotsResult.error) {
    console.error('[ProjectGenerationModesCache] Error fetching shot settings:', shotsResult.error);
    throw shotsResult.error;
  }

  const toolId = TOOL_IDS.TRAVEL_BETWEEN_IMAGES;
  const userToolSettings = extractToolSettings(toObjectRecord(userResult.data?.settings), toolId);
  const projectToolSettings = extractToolSettings(toObjectRecord(projectResult.data?.settings), toolId);

  const modes = new Map<string, GenerationModeNormalized>();
  (shotsResult.data || []).forEach((shot) => {
    const shotToolSettings = extractToolSettings(toObjectRecord(shot.settings), toolId);

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
  
  const smartPollingConfig = useSmartPollingConfig(settingsQueryKeys.generationModes(projectId ?? '__no-project__'));
  
  // Query to fetch all shot generation modes for the project
  const { data: projectModes, isLoading, error, refetch } = useQuery<Map<string, GenerationModeNormalized>>({
    queryKey: settingsQueryKeys.generationModes(projectId!),
    queryFn: () => fetchProjectGenerationModesFromDB(projectId!),
    enabled: !!projectId && enabled,
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous data while refetching
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Enable background polling
  });
  
  // PERF: Ref for projectModes so callbacks always read latest without needing it in deps.
  // Maps break React Query's structural sharing → projectModes is a new reference on every
  // refetch → callbacks with projectModes in deps are recreated → break React.memo on children.
  const projectModesRef = useRef(projectModes);
  projectModesRef.current = projectModes;

  // Update cache when data changes
  React.useEffect(() => {
    if (projectModes && projectId) {
      cacheRef.current.setProject(projectId, projectModes);
    }
  }, [projectModes, projectId]);

  const getShotGenerationMode = useCallback((shotId: string | null, isMobile: boolean = false): GenerationModeNormalized | null => {
    // Mobile always uses batch mode
    if (isMobile) {
      return 'batch';
    }

    if (!projectId || !shotId) return null;

    // First try cache
    const cachedMode = cacheRef.current.getItem(projectId, shotId);
    if (cachedMode !== null) {
      return cachedMode;
    }

    // Then try current query data
    const value = projectModesRef.current?.get(shotId);
    return value !== undefined ? value : null;
  }, [projectId]);

  const getAllShotModes = useCallback((): Map<string, GenerationModeNormalized> | null => {
    return cacheRef.current.getProjectWithFallback(projectId, projectModesRef.current);
  }, [projectId]);
  
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
  }, []);
  
  const deleteProjectCache = useCallback((projectId: string | null): void => {
    if (!projectId) return;
    cacheRef.current.deleteProject(projectId);
  }, []);
  
  // Debug function to log cache state
  const logCacheState = useCallback((): void => {
  }, []);
  
  // Optimistically update a single shot's mode in cache
  const updateShotMode = useCallback((shotId: string | null, mode: GenerationModeNormalized) => {
    if (!projectId || !shotId) return;
    
    // Update in-memory cache immediately
    const currentModes = cacheRef.current.getProject(projectId);
    if (currentModes) {
      currentModes.set(shotId, mode);
      cacheRef.current.setProject(projectId, currentModes);
    }
    
    // CRITICAL: Also update React Query cache so it persists across re-renders
    // The previous code created updatedModes but never saved it!
    queryClient.setQueryData<Map<string, GenerationModeNormalized>>(
      settingsQueryKeys.generationModes(projectId!),
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
