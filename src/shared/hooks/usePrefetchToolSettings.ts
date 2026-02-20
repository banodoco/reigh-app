import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { deepMerge } from '@/shared/lib/deepEqual';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { toolDefaultsRegistry } from '@/tooling/toolDefaultsRegistry';

// Central list of tool IDs we want to preload. Update when you add more tools.
const PREFETCH_TOOL_IDS = [
  TOOL_IDS.IMAGE_GENERATION,
  TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
  'project-image-settings', // Shared settings including reference images
];
const EMPTY_SHOT_IDS: string[] = [];

/**
 * Fetch tool settings using Supabase (for prefetching)
 */
async function fetchToolSettingsSupabase(toolId: string, ctx: { projectId?: string; shotId?: string }): Promise<unknown> {
  try {
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Fetch all needed data in parallel using Supabase client
    const [userResult, projectResult, shotResult] = await Promise.all([
      // User settings
      supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single(),
      
      // Project settings (if projectId provided)
      ctx.projectId ? 
        supabase
          .from('projects')
          .select('settings')
          .eq('id', ctx.projectId)
          .single() :
        Promise.resolve({ data: null, error: null }),
      
      // Shot settings (if shotId provided)  
      ctx.shotId ?
        supabase
          .from('shots')
          .select('settings')
          .eq('id', ctx.shotId)
          .single() :
        Promise.resolve({ data: null, error: null }),
    ]);

    // Extract tool-specific settings from each scope
    const userSettingsData = userResult.data?.settings as Record<string, unknown> | null;
    const projectSettingsData = projectResult.data?.settings as Record<string, unknown> | null;
    const shotSettingsData = shotResult.data?.settings as Record<string, unknown> | null;
    const userSettings = (userSettingsData?.[toolId] as Record<string, unknown>) ?? {};
    const projectSettings = (projectSettingsData?.[toolId] as Record<string, unknown>) ?? {};
    const shotSettings = (shotSettingsData?.[toolId] as Record<string, unknown>) ?? {};

      // Merge in priority order: defaults → user → project → shot
      return deepMerge(
        {},
        toolDefaultsRegistry[toolId] ?? {},
        userSettings,
        projectSettings,
        shotSettings
    );

  } catch (error: unknown) {
    handleError(error, { context: 'usePrefetchToolSettings', showToast: false });
    throw error;
  }
}

/**
 * Prefetch tool settings for a project (and optionally its shots) so that
 * individual pages can hydrate synchronously from React-Query cache.
 * Now uses direct Supabase calls for better mobile reliability.
 *
 * @param projectId selected project id
 * @param shotIds  array of shot ids belonging to the project (optional)
 */
export function usePrefetchToolSettings(projectId?: string | null, shotIds: string[] = EMPTY_SHOT_IDS) {
  const queryClient = useQueryClient();
  const shotIdsKey = shotIds.join(',');
  const shotIdsForPrefetch = useMemo(
    () => (shotIdsKey ? shotIdsKey.split(',') : EMPTY_SHOT_IDS),
    [shotIdsKey],
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    // Prefetch project-level settings for each tool.
    PREFETCH_TOOL_IDS.forEach((toolId) => {
      queryClient.prefetchQuery({
        queryKey: settingsQueryKeys.tool(toolId, projectId, undefined),
        queryFn: () => fetchToolSettingsSupabase(toolId, { projectId }),
        staleTime: 5 * 60 * 1000, // keep fresh for 5 min (same as useToolSettings)
      }).then(() => {
      }).catch((error) => {
        handleError(error, { context: 'usePrefetchToolSettings', showToast: false });
      });
    });

    // Prefetch shot-level settings when shot IDs are provided.
    if (shotIdsForPrefetch.length) {
      shotIdsForPrefetch.forEach((shotId) => {
        PREFETCH_TOOL_IDS.forEach((toolId) => {
          queryClient.prefetchQuery({
            queryKey: settingsQueryKeys.tool(toolId, projectId, shotId),
            queryFn: () => fetchToolSettingsSupabase(toolId, { projectId, shotId }),
            staleTime: 5 * 60 * 1000,
          });
        });
      });
    }
  }, [projectId, shotIdsForPrefetch, queryClient]);
}
