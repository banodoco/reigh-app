/**
 * Duplicate an image in a shot by creating a NEW generation from the primary variant.
 * Extracted from useShotGenerationMutations for single-responsibility.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { invalidateGenerationsSync } from '@/shared/hooks/invalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';

/** Maximum offset to try when resolving timeline frame collisions */
const MAX_FRAME_COLLISION_OFFSET = 1000;

interface DuplicateAsNewGenerationInput {
  shot_id: string;
  generation_id: string;
  project_id: string;
  timeline_frame: number;
  next_timeline_frame?: number;
  /** Explicit target frame - bypasses midpoint/+30 calculation */
  target_timeline_frame?: number;
}

interface DuplicateAsNewGenerationResult {
  shot_id: string;
  original_generation_id: string;
  new_generation_id: string;
  new_shot_generation_id: string;
  timeline_frame: number;
  project_id: string;
}

interface SourceGenerationData {
  sourceLocation: string;
  sourceThumbnail: string | null;
  sourceParams: Record<string, Json | undefined>;
}

interface CreatedGenerationData {
  id: string;
  params: Record<string, Json | undefined>;
}

function resolveMediaType(sourceLocation: string): 'image' | 'video' {
  return sourceLocation.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image';
}

function buildTargetTimelineFrame(input: DuplicateAsNewGenerationInput): number {
  if (input.target_timeline_frame !== undefined) {
    return input.target_timeline_frame;
  }

  if (input.next_timeline_frame !== undefined) {
    return Math.floor((input.timeline_frame + input.next_timeline_frame) / 2);
  }

  return input.timeline_frame + 30;
}

function resolveTimelineCollision(
  targetTimelineFrame: number,
  existingFrames: number[]
): number {
  const newTimelineFrame = Math.max(0, Math.round(targetTimelineFrame));
  if (!existingFrames.includes(newTimelineFrame)) {
    return newTimelineFrame;
  }

  let offset = 1;
  while (offset < MAX_FRAME_COLLISION_OFFSET) {
    const higher = newTimelineFrame + offset;
    if (!existingFrames.includes(higher)) {
      return higher;
    }

    const lower = newTimelineFrame - offset;
    if (lower >= 0 && !existingFrames.includes(lower)) {
      return lower;
    }

    offset += 1;
  }

  return newTimelineFrame;
}

function toJsonObject(value: unknown): Record<string, Json | undefined> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
}

async function fetchSourceGenerationData(generationId: string): Promise<SourceGenerationData> {
  const { data: primaryVariant, error: variantError } = await supabase().from('generation_variants')
    .select('*')
    .eq('generation_id', generationId)
    .eq('is_primary', true)
    .maybeSingle();

  if (variantError) {
    throw new Error(`Failed to fetch primary variant: ${variantError.message}`);
  }

  if (primaryVariant) {
    return {
      sourceLocation: primaryVariant.location,
      sourceThumbnail: primaryVariant.thumbnail_url,
      sourceParams: toJsonObject(primaryVariant.params),
    };
  }

  const { data: generation, error: generationError } = await supabase().from('generations')
    .select('location, thumbnail_url, params, type')
    .eq('id', generationId)
    .single();

  if (generationError || !generation) {
    throw new Error(`Failed to fetch generation: ${generationError?.message || 'Not found'}`);
  }

  if (!generation.location) {
    throw new Error('Generation is missing location');
  }

  return {
    sourceLocation: generation.location,
    sourceThumbnail: generation.thumbnail_url,
    sourceParams: toJsonObject(generation.params),
  };
}

async function createDuplicatedGeneration(input: {
  generationId: string;
  projectId: string;
  source: SourceGenerationData;
}): Promise<CreatedGenerationData> {
  const params = {
    ...input.source.sourceParams,
    source: 'timeline_duplicate',
    source_generation_id: input.generationId,
    duplicated_at: new Date().toISOString(),
  };

  const { data: newGeneration, error: insertError } = await supabase().from('generations')
    .insert({
      location: input.source.sourceLocation,
      thumbnail_url: input.source.sourceThumbnail,
      project_id: input.projectId,
      type: resolveMediaType(input.source.sourceLocation),
      based_on: input.generationId,
      params,
    })
    .select()
    .single();

  if (insertError || !newGeneration) {
    throw new Error(`Failed to create generation: ${insertError?.message || 'Unknown error'}`);
  }

  return {
    id: newGeneration.id,
    params,
  };
}

async function insertPrimaryVariant(input: {
  generationId: string;
  source: SourceGenerationData;
  params: Record<string, Json | undefined>;
}): Promise<void> {
  await supabase().from('generation_variants').insert({
    generation_id: input.generationId,
    location: input.source.sourceLocation,
    thumbnail_url: input.source.sourceThumbnail,
    is_primary: true,
    variant_type: VARIANT_TYPE.ORIGINAL,
    name: 'Original',
    params: input.params,
  });
}

async function fetchExistingTimelineFrames(shotId: string): Promise<number[]> {
  const { data: existingFramesData } = await supabase().from('shot_generations')
    .select('timeline_frame')
    .eq('shot_id', shotId);

  return (existingFramesData || [])
    .map((shotGeneration) => shotGeneration.timeline_frame)
    .filter((frame): frame is number => frame !== null);
}

async function insertShotGeneration(input: {
  shotId: string;
  generationId: string;
  timelineFrame: number;
}): Promise<{ id: string }> {
  const { data: newShotGeneration, error: addError } = await supabase().from('shot_generations')
    .insert({
      shot_id: input.shotId,
      generation_id: input.generationId,
      timeline_frame: input.timelineFrame,
    })
    .select()
    .single();

  if (addError || !newShotGeneration) {
    throw new Error(`Failed to add to shot: ${addError?.message || 'Unknown error'}`);
  }

  return { id: newShotGeneration.id };
}

async function duplicateAsNewGeneration(
  input: DuplicateAsNewGenerationInput
): Promise<DuplicateAsNewGenerationResult> {
  const source = await fetchSourceGenerationData(input.generation_id);
  const createdGeneration = await createDuplicatedGeneration({
    generationId: input.generation_id,
    projectId: input.project_id,
    source,
  });

  await insertPrimaryVariant({
    generationId: createdGeneration.id,
    source,
    params: createdGeneration.params,
  });

  const existingFrames = await fetchExistingTimelineFrames(input.shot_id);
  const targetTimelineFrame = buildTargetTimelineFrame(input);
  const newTimelineFrame = resolveTimelineCollision(targetTimelineFrame, existingFrames);
  const newShotGeneration = await insertShotGeneration({
    shotId: input.shot_id,
    generationId: createdGeneration.id,
    timelineFrame: newTimelineFrame,
  });

  return {
    shot_id: input.shot_id,
    original_generation_id: input.generation_id,
    new_generation_id: createdGeneration.id,
    new_shot_generation_id: newShotGeneration.id,
    timeline_frame: newTimelineFrame,
    project_id: input.project_id,
  };
}

export const useDuplicateAsNewGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: duplicateAsNewGeneration,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(data.project_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.byProjectAll });
      invalidateGenerationsSync(queryClient, data.shot_id, {
        reason: 'duplicate-as-new-generation',
        scope: 'all',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.generations.derivedGenerations(data.original_generation_id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(data.shot_id) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.segments.parents(data.shot_id, data.project_id),
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to duplicate image: ${error.message}`);
    },
  });
};
