import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationRow } from '@/types/shots';
import { queryKeys } from '@/shared/lib/queryKeys';
import { isNotFoundError } from '@/shared/constants/supabaseErrors';
import {
  calculateNextAvailableFrame,
  ensureUniqueFrame,
} from '@/shared/utils/timelinePositionCalculator';
import { updateAllShotsCaches } from './cacheUtils';
import { isQuotaOrServerError } from './shotMutationHelpers';

export interface AddImageToShotVariables {
  shot_id: string;
  generation_id: string;
  project_id: string;
  imageUrl?: string;
  thumbUrl?: string;
  timelineFrame?: number | null;
  skipOptimistic?: boolean;
}

interface CanonicalShotGenerationIdentity {
  generationId: string;
  shotEntryId: string;
}

function withLegacyShotGenerationIdentity<T extends Record<string, unknown>>(
  base: T,
  identity: CanonicalShotGenerationIdentity,
) {
  return {
    ...base,
    id: identity.shotEntryId,
    generation_id: identity.generationId,
    shotImageEntryId: identity.shotEntryId,
    shot_generation_id: identity.shotEntryId,
  };
}

export const withVariableMetadata = (data: Record<string, unknown>, variables: AddImageToShotVariables) => ({
  ...data,
  project_id: variables.project_id,
  imageUrl: variables.imageUrl,
  thumbUrl: variables.thumbUrl,
});

async function insertUnpositionedShotGeneration(
  shotId: string,
  generationId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('shot_generations')
    .insert({
      shot_id: shotId,
      generation_id: generationId,
      timeline_frame: null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function insertAutoPositionedShotGeneration(
  shotId: string,
  generationId: string,
): Promise<Record<string, unknown>> {
  const { data: rpcResult, error: rpcError } = await supabase.rpc('add_generation_to_shot', {
    p_shot_id: shotId,
    p_generation_id: generationId,
    p_with_position: true,
  });

  if (rpcError) {
    throw rpcError;
  }

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  return (result || {}) as Record<string, unknown>;
}

async function fetchResolvedTimelineFrame(shotId: string, requestedFrame: number): Promise<number> {
  const { data: existingGens, error: fetchError } = await supabase
    .from('shot_generations')
    .select('timeline_frame')
    .eq('shot_id', shotId)
    .not('timeline_frame', 'is', null);

  if (fetchError && !isNotFoundError(fetchError)) {
    // Non-critical fetch failure: fall through with empty frame list.
  }

  const existingFrames = (existingGens || [])
    .map((generation) => generation.timeline_frame)
    .filter((frame): frame is number => frame != null && frame !== -1);

  return ensureUniqueFrame(requestedFrame, existingFrames);
}

async function insertExplicitlyPositionedShotGeneration(
  shotId: string,
  generationId: string,
  timelineFrame: number,
): Promise<Record<string, unknown>> {
  const resolvedFrame = await fetchResolvedTimelineFrame(shotId, timelineFrame);
  const { data, error } = await supabase
    .from('shot_generations')
    .insert({
      shot_id: shotId,
      generation_id: generationId,
      timeline_frame: resolvedFrame,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

export function runAddImageMutation(variables: AddImageToShotVariables): Promise<Record<string, unknown>> {
  const { shot_id, generation_id, timelineFrame } = variables;

  if (timelineFrame === null) {
    return insertUnpositionedShotGeneration(shot_id, generation_id);
  }
  if (timelineFrame === undefined) {
    return insertAutoPositionedShotGeneration(shot_id, generation_id);
  }
  return insertExplicitlyPositionedShotGeneration(shot_id, generation_id, timelineFrame);
}

function resolveOptimisticFrame(
  timelineFrame: AddImageToShotVariables['timelineFrame'],
  currentImages: Array<{ timeline_frame?: number | null }>,
): number | null {
  const existingFrames = currentImages
    .filter((image) => image.timeline_frame != null && image.timeline_frame !== -1)
    .map((image) => image.timeline_frame as number);

  if (timelineFrame === null) {
    return null;
  }
  if (timelineFrame !== undefined) {
    return ensureUniqueFrame(timelineFrame, existingFrames);
  }
  return calculateNextAvailableFrame(existingFrames);
}

function createOptimisticGenerationItem(input: {
  tempId: string;
  shotId: string;
  generationId: string;
  imageUrl?: string;
  thumbUrl?: string;
  timelineFrame: AddImageToShotVariables['timelineFrame'];
  currentImages: Array<{ timeline_frame?: number | null }>;
}) {
  const { tempId, shotId, generationId, imageUrl, thumbUrl, timelineFrame, currentImages } = input;
  const resolvedFrame = resolveOptimisticFrame(timelineFrame, currentImages);
  const identity: CanonicalShotGenerationIdentity = {
    generationId,
    shotEntryId: tempId,
  };

  return withLegacyShotGenerationIdentity({
    location: imageUrl,
    thumbnail_url: thumbUrl || imageUrl,
    imageUrl,
    thumbUrl: thumbUrl || imageUrl,
    timeline_frame: resolvedFrame,
    type: 'image',
    created_at: new Date().toISOString(),
    starred: false,
    name: null,
    based_on: null,
    params: {},
    shot_data: resolvedFrame !== null ? { [shotId]: [resolvedFrame] } : {},
    _optimistic: true,
  }, identity);
}

export function applyOptimisticCaches(
  queryClient: QueryClient,
  variables: AddImageToShotVariables,
  previousFastGens: GenerationRow[] | undefined,
  tempId: string,
): void {
  const { shot_id, project_id, generation_id, imageUrl, thumbUrl, timelineFrame } = variables;

  if (previousFastGens) {
    const optimisticItem = createOptimisticGenerationItem({
      tempId,
      shotId: shot_id,
      generationId: generation_id,
      imageUrl,
      thumbUrl,
      timelineFrame,
      currentImages: previousFastGens,
    });
    queryClient.setQueryData(queryKeys.generations.byShot(shot_id), [...previousFastGens, optimisticItem]);
  }

  updateAllShotsCaches(queryClient, project_id, (shots = []) =>
    shots.map((shot) => {
      if (shot.id !== shot_id) {
        return shot;
      }

      const currentImages = shot.images || [];
      const optimisticItem = createOptimisticGenerationItem({
        tempId,
        shotId: shot_id,
        generationId: generation_id,
        imageUrl,
        thumbUrl,
        timelineFrame,
        currentImages,
      });
      return { ...shot, images: [...currentImages, optimisticItem] };
    }),
  );
}

export function toAddImageErrorMessage(error: Error): string {
  if (error.message.includes('Load failed') || error.message.includes('TypeError')) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  if (error.message.includes('fetch')) {
    return 'Unable to connect to server. Please try again in a moment.';
  }
  if (isQuotaOrServerError(error)) {
    return 'Server is temporarily busy. Please wait a moment before trying again.';
  }
  return error.message;
}

export function replaceOptimisticItemInCache(
  queryClient: QueryClient,
  shotId: string,
  tempId: string,
  data: Record<string, unknown>,
): void {
  const identity: CanonicalShotGenerationIdentity = {
    generationId: data.generation_id as string,
    shotEntryId: data.id as string,
  };

  const updateCache = (oldData: GenerationRow[] | undefined) => {
    if (!oldData) {
      return oldData;
    }
    return oldData.map((item) => {
      if (item.id !== tempId) {
        return item;
      }
      return withLegacyShotGenerationIdentity({
        ...item,
        timeline_frame: data.timeline_frame as number | null,
        _optimistic: undefined,
      }, identity);
    });
  };

  queryClient.setQueryData(queryKeys.generations.byShot(shotId), updateCache);
}

export function replaceOptimisticItemInShotsCache(
  queryClient: QueryClient,
  projectId: string,
  shotId: string,
  tempId: string,
  data: Record<string, unknown>,
): void {
  const identity: CanonicalShotGenerationIdentity = {
    generationId: data.generation_id as string,
    shotEntryId: data.id as string,
  };

  updateAllShotsCaches(queryClient, projectId, (shots = []) =>
    shots.map((shot) => {
      if (shot.id !== shotId || !shot.images) {
        return shot;
      }
      return {
        ...shot,
        images: shot.images.map((image) => {
          if (image.id !== tempId) {
            return image;
          }
          return withLegacyShotGenerationIdentity({
            ...image,
            timeline_frame: data.timeline_frame as number | null,
            _optimistic: undefined,
          }, identity);
        }),
      };
    }),
  );
}
