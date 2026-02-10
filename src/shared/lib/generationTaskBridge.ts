import { useQuery, useMutation, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
import { Task } from '@/types/tasks';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandler';

// ================================================================
// CENTRALIZED GENERATION ↔ TASK INTEGRATION PATTERNS
// ================================================================
// This utility consolidates all the scattered logic for linking
// generations to their associated tasks across different components.
// 
// Previously duplicated in:
// - useGenerations.ts (getTaskIdForGeneration)
// - useTaskPrefetch.ts (preloadTaskDataInBackground)
// - TaskDetailsModal.tsx (getTaskIdMutation)
// - TaskItem.tsx (generation-for-task lookup)
// - VideoOutputsGallery.tsx (manual preloading)

// ================================================================
// TYPES
// ================================================================

interface GenerationTaskMapping {
  generationId: string;
  taskId: string | null;
  taskData?: Task; // Full task object when available
}

interface TaskGenerationMapping {
  taskId: string;
  generationId: string | null;
  generationData?: GenerationRow; // Full generation object when available
}

// ================================================================
// CORE MAPPING FUNCTIONS
// ================================================================

/**
 * Get task ID(s) for a generation using efficient batch lookup
 */
async function getTaskIdForGeneration(generationId: string): Promise<{ taskId: string | null }> {
  const { data, error } = await supabase
    .from('generations')
    .select('tasks')
    .eq('id', generationId)
    .single();

  if (error) {
    throw new Error(`Generation not found or has no task: ${error.message}`);
  }

  const tasksArray = data?.tasks as string[] | null;
  const taskId = Array.isArray(tasksArray) && tasksArray.length > 0 ? tasksArray[0] : null;

  return { taskId };
}

/**
 * Batch fetch task IDs for multiple generations (more efficient than individual calls)
 */
async function getTaskIdsForGenerations(generationIds: string[]): Promise<Map<string, string | null>> {
  if (generationIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('generations')
    .select('id, tasks')
    .in('id', generationIds);

  if (error) {
    throw new Error(`Failed to fetch task mappings: ${error.message}`);
  }

  const mappings = new Map<string, string | null>();
  data?.forEach(mapping => {
    const tasksArray = mapping.tasks as string[] | null;
    const taskId = Array.isArray(tasksArray) && tasksArray.length > 0 ? tasksArray[0] : null;
    mappings.set(mapping.id, taskId);
  });

  return mappings;
}

/**
 * Get generation for a task by output location
 * Includes shot associations for proper UI state
 */
async function getGenerationForTask(taskId: string, outputLocation: string, projectId: string): Promise<GenerationRow | null> {
  if (!outputLocation) return null;

  const { data, error } = await supabase
    .from('generations')
    .select(`
      *,
      shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
    `)
    .eq('location', outputLocation)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    handleError(error, { context: 'GenerationTaskBridge', showToast: false });
    return null;
  }

  return data;
}

// ================================================================
// REACT HOOKS
// ================================================================

/**
 * Hook to get task ID for a generation with proper caching
 */
function useGenerationTaskMapping(generationId: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.generationMapping(generationId || ''),
    queryFn: () => getTaskIdForGeneration(generationId!),
    enabled: !!generationId,
    staleTime: 5 * 60 * 1000, // 5 minutes - task associations rarely change
    retry: 2,
  });
}

/**
 * Hook to get generation data for a task
 */
function useTaskGenerationMapping(taskId: string, outputLocation: string | null, projectId: string) {
  return useQuery({
    queryKey: [...queryKeys.tasks.taskMapping(taskId), outputLocation],
    queryFn: () => getGenerationForTask(taskId, outputLocation!, projectId),
    enabled: !!taskId && !!outputLocation && !!projectId,
    staleTime: 10 * 60 * 1000, // 10 minutes - generated content is immutable
    retry: 2,
  });
}

/**
 * Mutation for getting task ID (for compatibility with existing code)
 */
export function useGetTaskIdForGeneration() {
  return useMutation({
    mutationFn: getTaskIdForGeneration,
    onError: (error: Error) => {
      handleError(error, { context: 'GenerationTaskBridge', showToast: false });
    },
  });
}

/**
 * Hook to get full task data once we have the mapping
 */
function useTaskData(taskId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.tasks.all, 'single', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!taskId,
    staleTime: 2 * 60 * 1000, // 2 minutes for task data
  });
}

// ================================================================
// CACHE MANAGEMENT
// ================================================================

/**
 * Preload task mappings for a batch of generations in the background
 */
export async function preloadGenerationTaskMappings(
  generationIds: string[], 
  queryClient: QueryClient,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    preloadFullTaskData?: boolean;
  } = {}
) {
  const { 
    batchSize = 5, 
    delayBetweenBatches = 200,
    preloadFullTaskData = false 
  } = options;

  for (let i = 0; i < generationIds.length; i += batchSize) {
    const batch = generationIds.slice(i, i + batchSize);
    
    try {
      // Batch fetch task IDs
      const mappings = await getTaskIdsForGenerations(batch);
      
      // Cache the mappings
      mappings.forEach((taskId, generationId) => {
        queryClient.setQueryData(queryKeys.tasks.generationMapping(generationId), { taskId });

        // Optionally preload full task data
        if (preloadFullTaskData && taskId) {
          queryClient.prefetchQuery({
            queryKey: [...queryKeys.tasks.all, 'single', taskId],
            queryFn: async () => {
              const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();
              
              if (error) throw error;
              return data;
            },
            staleTime: 2 * 60 * 1000,
          });
        }
      });

    } catch (error) {
      handleError(error, { context: 'GenerationTaskBridge', showToast: false });
    }
    
    // Throttle between batches
    if (i + batchSize < generationIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
}

/**
 * Invalidate all caches related to a specific generation-task relationship
 */
function invalidateGenerationTaskCaches(queryClient: QueryClient, generationId: string, taskId?: string) {
  // Invalidate the mapping
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.generationMapping(generationId) });

  if (taskId) {
    // Invalidate task data
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.single(taskId) });
    // Invalidate reverse mapping
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.taskMapping(taskId) });
  }
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

/**
 * Extract task IDs from generation objects
 */
function extractTaskIds(generations: (GenerationRow | { tasks?: string[] })[]): string[] {
  const taskIds: string[] = [];
  
  generations.forEach(gen => {
    const tasks = 'tasks' in gen ? gen.tasks : undefined;
    if (Array.isArray(tasks) && tasks.length > 0) {
      taskIds.push(tasks[0]); // First task ID
    }
  });
  
  return [...new Set(taskIds)]; // Remove duplicates
}

/**
 * Enhance generations with task data from cache
 */
export function enhanceGenerationsWithTaskData(
  generations: GenerationRow[],
  queryClient: QueryClient
): (GenerationRow & { taskId?: string | null; taskData?: Task | null })[] {
  return generations.map(generation => {
    // Try to get cached task mapping
    const cachedMapping = queryClient.getQueryData<{ taskId: string | null }>(queryKeys.tasks.generationMapping(generation.id));
    const taskId = cachedMapping?.taskId || null;

    // Try to get cached task data
    const taskData = taskId ? queryClient.getQueryData<Task>([...queryKeys.tasks.all, 'single', taskId]) : null;
    
    return {
      ...generation,
      taskId,
      taskData,
    };
  });
}
