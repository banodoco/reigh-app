/**
 * useShotActions - Shot manipulation callbacks for ShotEditor
 *
 * Extracted to reduce ShotEditor size. Handles:
 * - Shot navigation (handleShotChange)
 * - Add to shot operations (handleAddToShot, handleAddToShotWithoutPosition)
 * - Shot creation (handleCreateShot, handleNewShotFromSelection)
 * - Generations pane integration (openUnpositionedGenerationsPane)
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandler';
import type { GenerationRow, Shot } from '@/types/shots';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

interface AddToShotParams {
  shot_id: string;
  generation_id: string;
  imageUrl?: string;
  thumbUrl?: string;
  timelineFrame?: number;
  project_id: string;
}

interface UseShotActionsOptions {
  // Refs for stable access
  projectIdRef: React.MutableRefObject<string>;
  selectedShotRef: React.MutableRefObject<Shot | null>;
  allShotImagesRef: React.MutableRefObject<GenerationRow[]>;
  addToShotMutationRef: React.MutableRefObject<(params: AddToShotParams) => Promise<void>>;
  addToShotWithoutPositionMutationRef: React.MutableRefObject<(params: { shot_id: string; generation_id: string; project_id: string }) => Promise<void>>;
  createShotRef: React.MutableRefObject<(params: { name: string }) => Promise<{ shotId: string } | null>>;
  setIsGenerationsPaneLockedRef: React.MutableRefObject<(locked: boolean) => void>;

  // Direct dependencies
  shots: Shot[] | undefined;
  navigateToShot: (shot: Shot, options?: { scrollToTop?: boolean; isNewlyCreated?: boolean }) => void;
  setCurrentShotId: (id: string) => void;
  updateGenerationsPaneSettings: (settings: Record<string, unknown>) => void;
  isMobile: boolean;
  selectedShot: Shot | null;
}

export function useShotActions({
  projectIdRef,
  selectedShotRef,
  allShotImagesRef,
  addToShotMutationRef,
  addToShotWithoutPositionMutationRef,
  createShotRef,
  setIsGenerationsPaneLockedRef,
  shots,
  navigateToShot,
  setCurrentShotId,
  updateGenerationsPaneSettings,
  isMobile,
  selectedShot,
}: UseShotActionsOptions) {
  const queryClient = useQueryClient();

  // Opens the Generations pane focused on un-positioned images for the current shot
  const openUnpositionedGenerationsPane = useCallback(() => {
    const shotId = selectedShotRef.current?.id;

    if (shotId) {
      updateGenerationsPaneSettings({
        selectedShotFilter: shotId,
        excludePositioned: true,
      });
    }

    if (isMobile) {
      window.dispatchEvent(new CustomEvent('openGenerationsPane'));
    } else {
      setIsGenerationsPaneLockedRef.current(true);
    }
  }, [isMobile, updateGenerationsPaneSettings]);

  const handleShotChange = useCallback((shotId: string) => {
    const shot = shots?.find(s => s.id === shotId);
    if (shot) {
      navigateToShot(shot, { scrollToTop: true, isNewlyCreated: true });
    } else {
      queryClient.refetchQueries({ queryKey: queryKeys.shots.all }).then(() => {
        const refreshedShots = queryClient.getQueryData<typeof shots>(queryKeys.shots.all);
        const refreshedShot = refreshedShots?.find((s) => s.id === shotId);
        if (refreshedShot) {
          navigateToShot(refreshedShot, { scrollToTop: true, isNewlyCreated: true });
        } else {
          setCurrentShotId(shotId);
        }
      });
    }
  }, [shots, navigateToShot, setCurrentShotId, queryClient]);

  const handleAddToShot = useCallback(async (shotId: string, generationId: string, position?: number) => {
    const shouldAutoPosition = position === undefined || position === 0 || position === -1;

    await addToShotMutationRef.current({
      shot_id: shotId,
      generation_id: generationId,
      timelineFrame: shouldAutoPosition ? undefined : position,
      project_id: projectIdRef.current
    });
  }, []);

  const handleAddToShotWithoutPosition = useCallback(async (shotId: string, generationId: string) => {

    try {
      await addToShotWithoutPositionMutationRef.current({
        shot_id: shotId,
        generation_id: generationId,
        project_id: projectIdRef.current
      });
      return true;
    } catch (error) {
      handleError(error, { context: 'AddWithoutPosDebug', showToast: false });
      throw error;
    }
  }, []);

  const handleCreateShot = useCallback(async (name: string) => {
    const result = await createShotRef.current({ name });
    if (!result) {
      throw new Error('Failed to create shot');
    }
    return result.shotId;
  }, []);

  const handleNewShotFromSelection = useCallback(async (selectedIds: string[]): Promise<string | void> => {

    const selectedImages = allShotImagesRef.current.filter(img =>
      selectedIds.includes(img.id)
    );

    if (selectedImages.length === 0) {
      toast.error('No images selected');
      return;
    }

    const newShotName = `From ${selectedShot?.name || 'selection'} (${selectedImages.length})`;

    try {
      const result = await createShotRef.current({ name: newShotName });
      if (!result || !result.shotId) {
        throw new Error('Failed to create shot');
      }

      const sortedImages = [...selectedImages].sort((a, b) =>
        (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0)
      );

      const FRAME_GAP = 50;
      await Promise.all(sortedImages.map((img, i) => {
        const generationId = getGenerationId(img);
        const newFrame = i * FRAME_GAP;
        return addToShotMutationRef.current({
          shot_id: result.shotId,
          generation_id: generationId,
          timelineFrame: newFrame,
          project_id: projectIdRef.current
        });
      }));

      await queryClient.refetchQueries({ queryKey: queryKeys.shots.all });
      return result.shotId;
    } catch (error) {
      handleError(error, { context: 'ShotEditor', toastTitle: 'Failed to create shot' });
    }
  }, [selectedShot?.name, queryClient]);

  return {
    openUnpositionedGenerationsPane,
    handleShotChange,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleCreateShot,
    handleNewShotFromSelection,
  };
}
