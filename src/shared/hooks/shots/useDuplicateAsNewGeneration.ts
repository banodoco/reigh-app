/**
 * Duplicate an image in a shot by creating a NEW generation from the primary variant.
 * Extracted from useShotGenerationMutations for single-responsibility.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/sonner';
import { invalidateGenerationsSync } from '@/shared/hooks/invalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';

/** Maximum offset to try when resolving timeline frame collisions */
const MAX_FRAME_COLLISION_OFFSET = 1000;

export const useDuplicateAsNewGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
      timeline_frame,
      next_timeline_frame,
      target_timeline_frame,
    }: {
      shot_id: string;
      generation_id: string;
      project_id: string;
      timeline_frame: number;
      next_timeline_frame?: number;
      /** Explicit target frame - bypasses midpoint/+30 calculation */
      target_timeline_frame?: number;
    }) => {
      // 1. Get the primary variant for the source generation
      const { data: primaryVariant, error: variantError } = await supabase
        .from('generation_variants')
        .select('*')
        .eq('generation_id', generation_id)
        .eq('is_primary', true)
        .maybeSingle();

      if (variantError) {
        throw new Error(`Failed to fetch primary variant: ${variantError.message}`);
      }

      let sourceLocation: string;
      let sourceThumbnail: string | null;
      let sourceParams: Record<string, unknown> = {};

      if (primaryVariant) {
        sourceLocation = primaryVariant.location;
        sourceThumbnail = primaryVariant.thumbnail_url;
        sourceParams = (primaryVariant.params as Record<string, unknown>) || {};
      } else {
        // Fallback to generation
        const { data: generation, error: genError } = await supabase
          .from('generations')
          .select('location, thumbnail_url, params, type')
          .eq('id', generation_id)
          .single();

        if (genError || !generation) {
          throw new Error(`Failed to fetch generation: ${genError?.message || 'Not found'}`);
        }

        sourceLocation = generation.location;
        sourceThumbnail = generation.thumbnail_url;
        sourceParams = (generation.params as Record<string, unknown>) || {};
      }

      // 2. Determine media type
      const isVideo = sourceLocation?.match(/\.(mp4|webm|mov)$/i);
      const mediaType = isVideo ? 'video' : 'image';

      // 3. Create new generation
      const newGenerationData = {
        location: sourceLocation,
        thumbnail_url: sourceThumbnail,
        project_id: project_id,
        type: mediaType,
        based_on: generation_id,
        params: {
          ...sourceParams,
          source: 'timeline_duplicate',
          source_generation_id: generation_id,
          duplicated_at: new Date().toISOString(),
        },
      };

      const { data: newGeneration, error: insertError } = await supabase
        .from('generations')
        .insert(newGenerationData)
        .select()
        .single();

      if (insertError || !newGeneration) {
        throw new Error(`Failed to create generation: ${insertError?.message || 'Unknown error'}`);
      }

      // 4. Create variant
      await supabase.from('generation_variants').insert({
        generation_id: newGeneration.id,
        location: sourceLocation,
        thumbnail_url: sourceThumbnail,
        is_primary: true,
        variant_type: VARIANT_TYPE.ORIGINAL,
        name: 'Original',
        params: newGenerationData.params,
      });

      // 5. Calculate timeline position
      const { data: existingFramesData } = await supabase
        .from('shot_generations')
        .select('timeline_frame')
        .eq('shot_id', shot_id);

      const existingFrames = (existingFramesData || [])
        .map(shotGen => shotGen.timeline_frame)
        .filter((f): f is number => f !== null);

      let targetTimelineFrame: number;
      if (target_timeline_frame !== undefined) {
        // Explicit target provided (interceptor pre-calculates midpoint + collision avoidance)
        targetTimelineFrame = target_timeline_frame;
      } else if (next_timeline_frame !== undefined) {
        targetTimelineFrame = Math.floor((timeline_frame + next_timeline_frame) / 2);
      } else {
        targetTimelineFrame = timeline_frame + 30;
      }

      let newTimelineFrame = Math.max(0, Math.round(targetTimelineFrame));
      if (existingFrames.includes(newTimelineFrame)) {
        let offset = 1;
        while (offset < MAX_FRAME_COLLISION_OFFSET) {
          const higher = newTimelineFrame + offset;
          if (!existingFrames.includes(higher)) {
            newTimelineFrame = higher;
            break;
          }
          const lower = newTimelineFrame - offset;
          if (lower >= 0 && !existingFrames.includes(lower)) {
            newTimelineFrame = lower;
            break;
          }
          offset += 1;
        }
      }

      // 6. Add to shot
      const { data: newShotGen, error: addError } = await supabase
        .from('shot_generations')
        .insert({
          shot_id,
          generation_id: newGeneration.id,
          timeline_frame: newTimelineFrame,
        })
        .select()
        .single();

      if (addError || !newShotGen) {
        throw new Error(`Failed to add to shot: ${addError?.message || 'Unknown error'}`);
      }

      return {
        shot_id,
        original_generation_id: generation_id,
        new_generation_id: newGeneration.id,
        new_shot_generation_id: newShotGen.id,
        timeline_frame: newTimelineFrame,
        project_id,
      };
    },

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
