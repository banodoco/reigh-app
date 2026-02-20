import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Task } from '@/types/tasks';
import { GenerationRow } from '@/types/shots';
import { extractSourceGenerationId } from '../utils/task-utils';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';

interface UseImageGenerationOptions {
  task: Task;
  taskParams: { parsed: Record<string, unknown>; promptText: string };
  isImageTask: boolean;
}

/**
 * Hook to fetch generation data for image tasks
 * Checks both generations table and generation_variants table (for edit tasks)
 */
export function useImageGeneration({
  task,
  taskParams,
  isImageTask,
}: UseImageGenerationOptions) {
  // Check if this is a successful image task with output
  const hasGeneratedImage = useMemo(() => {
    return isImageTask && task.status === 'Complete' && !!task.outputLocation;
  }, [isImageTask, task.status, task.outputLocation]);

  // Fetch generation data - checks both generations and generation_variants tables
  const { data: generationResult, isLoading: isLoadingGeneration, error: generationError } = useQuery({
    queryKey: [...generationQueryKeys.forTask(task.id), task.outputLocation],
    queryFn: async () => {
      if (!task.outputLocation) return null;

      // First try: Look up by location in generations table
      const { data: genByLocation, error: genError } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
        `)
        .eq('location', task.outputLocation)
        .eq('project_id', task.projectId)
        .maybeSingle();

      if (!genError && genByLocation) {
        return { generation: genByLocation, variantId: null };
      }

      // Second try: Check generation_variants by location (for edit tasks that create variants)
      const { data: variantByLocation, error: variantError } = await supabase
        .from('generation_variants')
        .select('id, generation_id, location, thumbnail_url, is_primary, params')
        .eq('location', task.outputLocation)
        .limit(1);

      if (!variantError && variantByLocation && variantByLocation.length > 0) {
        const variant = variantByLocation[0];

        // Fetch the parent generation
        const { data: parentGen, error: parentError } = await supabase
          .from('generations')
          .select(`
            *,
            shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
          `)
          .eq('id', variant.generation_id)
          .single();

        if (!parentError && parentGen) {
          return {
            generation: {
              ...parentGen,
              // Override with variant's location/thumbnail
              location: variant.location,
              thumbnail_url: variant.thumbnail_url || parentGen.thumbnail_url,
            },
            variantId: variant.id,
            variantIsPrimary: variant.is_primary,
          };
        }
      }

      // Fallback: Search by task ID in the tasks JSONB array
      const { data: byTaskId, error: taskIdError } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
        `)
        .filter('tasks', 'cs', JSON.stringify([task.id]))
        .eq('project_id', task.projectId)
        .maybeSingle();

      if (!taskIdError && byTaskId) {
        return { generation: byTaskId, variantId: null };
      }

      return null;
    },
    enabled: hasGeneratedImage && !!task.outputLocation,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const actualGeneration = generationResult?.generation || null;

  // Create GenerationRow data for MediaLightbox
  const generationData: GenerationRow | null = useMemo(() => {
    // Fallback: If no generation record exists, create a minimal GenerationRow from outputLocation
    if (isImageTask && hasGeneratedImage && task.outputLocation && !actualGeneration) {
      const sourceGenerationId = extractSourceGenerationId(taskParams.parsed);
      
      return {
        id: task.id,
        location: task.outputLocation,
        imageUrl: task.outputLocation,
        thumbUrl: task.outputLocation,
        type: 'image',
        createdAt: task.createdAt || new Date().toISOString(),
        metadata: task.params || {},
        taskId: task.id,
        generation_id: sourceGenerationId || undefined,
        parent_generation_id: sourceGenerationId || undefined,
        based_on: sourceGenerationId || undefined,
      } as GenerationRow;
    }
    
    if (!hasGeneratedImage || !actualGeneration) return null;
    
    const gen = actualGeneration as Record<string, unknown>;
    const metadata = ((gen.metadata as Record<string, unknown> | null | undefined) ?? {}) as Record<string, unknown>;
    const basedOnValue =
      (typeof gen.based_on === 'string' ? gen.based_on : null) ||
      (typeof metadata.based_on === 'string' ? metadata.based_on : null) ||
      null;

    // Transform shot associations
    const shotGenerations = (gen.shot_generations as Array<{ shot_id: string; timeline_frame: number | null }>) || [];
    const shotIds = shotGenerations.map((sg) => sg.shot_id);
    const timelineFrames = shotGenerations.reduce<Record<string, number | null>>((acc, sg) => {
      acc[sg.shot_id] = sg.timeline_frame;
      return acc;
    }, {});

    const allShotAssociations = shotGenerations.map((sg) => ({
      shot_id: sg.shot_id,
      position: sg.timeline_frame,
    }));

    const location = typeof actualGeneration.location === 'string' ? actualGeneration.location : null;
    const thumbnailUrl = typeof gen.thumbnail_url === 'string' ? gen.thumbnail_url : undefined;
    const imageUrl = location ?? thumbnailUrl;
    const thumbUrl = thumbnailUrl ?? location ?? undefined;
    const createdAt = (gen.created_at as string | undefined) || new Date().toISOString();

    return {
      id: actualGeneration.id,
      location,
      imageUrl,
      thumbUrl,
      type: (actualGeneration.type ?? 'image') as string,
      createdAt,
      metadata,
      based_on: basedOnValue,
      sourceGenerationId: basedOnValue,
      parent_generation_id: (gen.parent_generation_id as string | undefined) || undefined,
      shotIds,
      timelineFrames,
      all_shot_associations: allShotAssociations,
      name: (gen.name as string | undefined) || undefined,
      // Include variant info if this was found via variant lookup
      _variant_id: generationResult?.variantId || undefined,
      _variant_is_primary: generationResult?.variantIsPrimary || undefined,
    } as GenerationRow;
  }, [hasGeneratedImage, actualGeneration, task, taskParams.parsed, isImageTask, generationResult?.variantId, generationResult?.variantIsPrimary]);

  return {
    generationData,
    actualGeneration,
    isLoadingGeneration,
    generationError,
    hasGeneratedImage,
    // Expose variant ID for passing to lightbox
    variantId: generationResult?.variantId || null,
  };
}
