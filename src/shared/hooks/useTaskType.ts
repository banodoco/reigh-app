import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

export interface TaskTypeInfo {
  id: string;
  name: string;
  content_type: string | null;
  tool_type: string | null;
  display_name: string;
  category: string;
  is_visible: boolean;
  supports_progress: boolean;
}

/**
 * Hook to fetch task type information including content_type
 * @param taskType - The task type name to look up
 * @returns Query result with task type information
 */
export const useTaskType = (taskType: string) => {
  return useQuery({
    queryKey: taskQueryKeys.type(taskType),
    queryFn: async (): Promise<TaskTypeInfo | null> => {
      const { data, error } = await supabase
        .from('task_types')
        .select('id, name, content_type, tool_type, display_name, category, is_visible, supports_progress')
        .eq('name', taskType)
        .maybeSingle();

      if (error) {
        console.warn(`Failed to fetch task type info for ${taskType}:`, error);
        return null;
      }

      if (!data) {
        return null;
      }

      return {
        ...data,
        is_visible: data.is_visible ?? false,
        supports_progress: data.supports_progress ?? false,
      };
    },
    enabled: !!taskType,
    staleTime: 5 * 60 * 1000, // 5 minutes - task types don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// =============================================================================
// GLOBAL TASK TYPE CONFIG CACHE
// =============================================================================

// Global cache for synchronous access (populated by useAllTaskTypesConfig hook)
let _taskTypeConfigCache: Record<string, TaskTypeInfo> = {};
let _cacheInitialized = false;

/**
 * Get the global task type config cache
 * Used by taskConfig.ts for synchronous access
 */
export function getTaskTypeConfigCache(): Record<string, TaskTypeInfo> {
  return _taskTypeConfigCache;
}

/**
 * Check if the cache has been initialized
 */
export function isTaskTypeConfigCacheInitialized(): boolean {
  return _cacheInitialized;
}

/**
 * Fetch all task types config directly (for initialization)
 * This is called once on app load to populate the cache
 */
async function fetchAllTaskTypesConfig(): Promise<Record<string, TaskTypeInfo>> {
  const { data, error } = await supabase
    .from('task_types')
    .select('id, name, content_type, tool_type, display_name, category, is_visible, supports_progress')
    .eq('is_active', true);

  if (error) {
    return {};
  }

  const configMap = (data || []).reduce((acc, taskType) => {
    acc[taskType.name] = {
      ...taskType,
      is_visible: taskType.is_visible ?? false,
      supports_progress: taskType.supports_progress ?? false,
    };
    return acc;
  }, {} as Record<string, TaskTypeInfo>);

  // Update the global cache
  _taskTypeConfigCache = configMap;
  _cacheInitialized = true;
  
  return configMap;
}

/**
 * Hook to fetch and cache ALL task type configs
 * Should be called once near the app root to initialize the cache
 * @returns Query result with all task type configurations
 */
export const useAllTaskTypesConfig = () => {
  return useQuery({
    queryKey: taskQueryKeys.typesConfigAll,
    queryFn: fetchAllTaskTypesConfig,
    staleTime: 10 * 60 * 1000, // 10 minutes - task types config rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};
