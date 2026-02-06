/**
 * useVariantPromotion - Handles promoting variants to standalone generations
 *
 * Manages variant promotion (creating standalone generation from a variant)
 * and adding variants as new generations to shots with timeline positioning.
 */

import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { supabase } from '@/integrations/supabase/client';
import { usePromoteVariantToGeneration } from '@/shared/hooks/usePromoteVariantToGeneration';
import { useAddImageToShot } from '@/shared/hooks/useShots';

export interface UseVariantPromotionProps {
  selectedProjectId: string | null;
}

export interface UseVariantPromotionReturn {
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  handleAddVariantAsNewGenerationToShot: (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ) => Promise<boolean>;
}

export function useVariantPromotion({
  selectedProjectId,
}: UseVariantPromotionProps): UseVariantPromotionReturn {
  const promoteVariantMutation = usePromoteVariantToGeneration();
  const addImageToShotMutation = useAddImageToShot();
  const [promoteSuccess, setPromoteSuccess] = useState(false);

  // Handler for "Make new image" button in VariantSelector
  const handlePromoteToGeneration = useCallback(async (variantId: string) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    setPromoteSuccess(false);

    try {
      const result = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
      });

      console.log('[NewImage] promoted → new generation:', result.id.substring(0, 8));
      setPromoteSuccess(true);
      setTimeout(() => setPromoteSuccess(false), 2000);
    } catch (error) {
      handleError(error, { context: 'useVariantPromotion', showToast: false });
    }
  }, [promoteVariantMutation, selectedProjectId]);

  // Handler for "Add as new image to shot" button in ShotSelectorControls
  // Positions new image between current and next item in the TARGET shot
  const handleAddVariantAsNewGenerationToShot = useCallback(async (
    shotId: string,
    variantId: string,
    currentTimelineFrame?: number
  ): Promise<boolean> => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return false;
    }

    try {
      // 1. Create the generation from the variant
      const newGen = await promoteVariantMutation.mutateAsync({
        variantId,
        projectId: selectedProjectId,
      });

      console.log('[VariantToShot] Created generation:', newGen.id.substring(0, 8));

      // 2. Calculate target timeline frame by querying the TARGET shot's items
      let targetTimelineFrame: number | undefined;
      if (currentTimelineFrame !== undefined) {
        // Query all items in the target shot to find next item and calculate average spacing
        const { data: allShotItems } = await supabase
          .from('shot_generations')
          .select('timeline_frame')
          .eq('shot_id', shotId)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true });

        const frames = (allShotItems || [])
          .map(item => item.timeline_frame as number)
          .filter(f => f !== null && f !== undefined);

        // Find the next item after current position
        const nextTimelineFrame = frames.find(f => f > currentTimelineFrame);

        console.log('[VariantToShot] Frame calculation:', {
          currentTimelineFrame,
          nextTimelineFrame,
          hasNext: nextTimelineFrame !== undefined,
          totalFrames: frames.length,
        });

        if (nextTimelineFrame !== undefined && nextTimelineFrame > currentTimelineFrame) {
          // Place in the middle between current and next
          targetTimelineFrame = Math.floor((currentTimelineFrame + nextTimelineFrame) / 2);
          console.log('[VariantToShot] Midpoint:', currentTimelineFrame, '+', nextTimelineFrame, '/ 2 =', targetTimelineFrame);
          // If middle would be same as current (consecutive frames), use current + 1
          if (targetTimelineFrame === currentTimelineFrame) {
            targetTimelineFrame = currentTimelineFrame + 1;
          }
        } else {
          // No next item in shot - calculate average spacing and use that
          if (frames.length >= 2) {
            // Calculate average gap between consecutive frames
            let totalGap = 0;
            for (let i = 1; i < frames.length; i++) {
              totalGap += frames[i] - frames[i - 1];
            }
            const averageGap = Math.round(totalGap / (frames.length - 1));
            targetTimelineFrame = currentTimelineFrame + Math.max(1, averageGap);
            console.log('[VariantToShot] No next item, using average gap:', averageGap, '-> frame:', targetTimelineFrame);
          } else {
            // Only one item in shot, use current + 1
            targetTimelineFrame = currentTimelineFrame + 1;
            console.log('[VariantToShot] Single item in shot, using current +1:', targetTimelineFrame);
          }
        }
      }

      // 3. Add to shot
      await addImageToShotMutation.mutateAsync({
        shot_id: shotId,
        generation_id: newGen.id,
        project_id: selectedProjectId,
        imageUrl: newGen.location,
        thumbUrl: newGen.thumbnail_url || undefined,
        timelineFrame: targetTimelineFrame,
      });
      console.log('[VariantToShot] Added to shot at frame:', targetTimelineFrame);
      return true;
    } catch (error) {
      handleError(error, { context: 'useVariantPromotion', showToast: false });
      return false;
    }
  }, [promoteVariantMutation, addImageToShotMutation, selectedProjectId]);

  return {
    promoteSuccess,
    isPromoting: promoteVariantMutation.isPending,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
  };
}
