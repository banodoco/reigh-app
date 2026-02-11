import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toolsManifest } from '@/tools';
import { handleError } from '@/shared/lib/errorHandler';
import { deepMerge } from '@/shared/lib/deepEqual';
import { queryKeys } from '@/shared/lib/queryKeys';
import { TOOL_IDS } from '@/shared/lib/toolConstants';

// Central list of tool IDs we want to preload. Update when you add more tools.
const PREFETCH_TOOL_IDS = [
  TOOL_IDS.IMAGE_GENERATION,
  TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
  'project-image-settings', // Shared settings including reference images
];

// Tool defaults registry - client-side version matching server
const toolDefaults: Record<string, unknown> = Object.fromEntries(
  toolsManifest.map(toolSettings => [toolSettings.id, toolSettings.defaults])
);

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
      toolDefaults[toolId] ?? {},
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
export function usePrefetchToolSettings(projectId?: string | null, shotIds: string[] = []) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId) {
      return;
    }

    // Prefetch project-level settings for each tool.
    PREFETCH_TOOL_IDS.forEach((toolId) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.settings.tool(toolId, projectId, undefined),
        queryFn: () => fetchToolSettingsSupabase(toolId, { projectId }),
        staleTime: 5 * 60 * 1000, // keep fresh for 5 min (same as useToolSettings)
      }).then(() => {
      }).catch((error) => {
        handleError(error, { context: 'usePrefetchToolSettings', showToast: false });
      });
    });

    // Prefetch shot-level settings when shot IDs are provided.
    if (shotIds.length) {
      shotIds.forEach((shotId) => {
        PREFETCH_TOOL_IDS.forEach((toolId) => {
          queryClient.prefetchQuery({
            queryKey: queryKeys.settings.tool(toolId, projectId, shotId),
            queryFn: () => fetchToolSettingsSupabase(toolId, { projectId, shotId }),
            staleTime: 5 * 60 * 1000,
          });
        });
      });
    }
  }, [projectId, shotIds.join(','), queryClient]);
} 