import { useCallback, useRef, useMemo } from 'react';
import { nanoid } from "nanoid";
import { toast } from "@/shared/components/ui/sonner";
import { handleError } from "@/shared/lib/errorHandler";
import { GenerationRow, Shot } from "@/types/shots";
import { useProject } from "@/shared/contexts/ProjectContext";
import {
  useAddImageToShot,
  useRemoveImageFromShot,
  useHandleExternalImageDrop,
  useDuplicateAsNewGeneration
} from "@/shared/hooks/useShots";

import { useQueryClient } from '@tanstack/react-query';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { ShotEditorState } from '../state/types';
import { isGenerationVideo } from '../utils/generation-utils';
import {
  cropImagesToShotAspectRatio,
  calculateNextAvailableFrame,
  persistTimelinePositions
} from './timelineDropHelpers';
import { DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
import { useDemoteOrphanedVariants } from '@/shared/hooks/useDemoteOrphanedVariants';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { queryKeys } from '@/shared/lib/queryKeys';

interface UseGenerationActionsProps {
  state: ShotEditorState;
  actions: {
    setUploadingImage: (value: boolean) => void;
    setFileInputKey: (value: number) => void;
    setDeletingVideoId: (value: string | null) => void;
    setDuplicatingImageId: (value: string | null) => void;
    setDuplicateSuccessImageId: (value: string | null) => void;
    setPendingFramePositions: (value: Map<string, number>) => void;
    // REMOVED: setLocalOrderedShotImages - no longer needed with two-phase loading
  };
  selectedShot: Shot;
  projectId: string;
  batchVideoFrames: number;
  onShotImagesUpdate: () => void;
  orderedShotImages: GenerationRow[];
  skipNextSyncRef: React.MutableRefObject<boolean>;
}

export const useGenerationActions = ({
  state,
  actions,
  selectedShot,
  projectId,
  batchVideoFrames,
  onShotImagesUpdate,
  orderedShotImages,
}: UseGenerationActionsProps) => {
  const { projects } = useProject();
  const queryClient = useQueryClient();

  // Mutations
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();
  const duplicateAsNewGenerationMutation = useDuplicateAsNewGeneration();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();

  // Orphaned variant detection
  const { demoteOrphanedVariants } = useDemoteOrphanedVariants();

  // Upload settings
  const { settings: uploadSettings } = useToolSettings<{ cropToProjectSize?: boolean }>('upload', { projectId });

  // 🎯 STABILITY FIX: Use refs for data that changes reference frequently but callbacks 
  // only need the latest value. This prevents callback recreation when data refetches.
  const orderedShotImagesRef = useRef(orderedShotImages);
  orderedShotImagesRef.current = orderedShotImages;
  
  const onShotImagesUpdateRef = useRef(onShotImagesUpdate);
  onShotImagesUpdateRef.current = onShotImagesUpdate;
  
  // These are used in handleTimelineImageDrop - stabilize to prevent recreation
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  
  const uploadSettingsRef = useRef(uploadSettings);
  uploadSettingsRef.current = uploadSettings;
  
  // 🎯 STABILITY FIX: selectedShot object changes reference when React Query cache updates
  // even if the shot ID hasn't changed. Use ref to prevent callback recreation.
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  
  const batchVideoFramesRef = useRef(batchVideoFrames);
  batchVideoFramesRef.current = batchVideoFrames;
  
  // 🎯 STABILITY FIX: React Query mutation objects change reference when mutation state changes
  // (pending → success → idle). Use refs to access stable mutateAsync functions.
  const addImageToShotMutationRef = useRef(addImageToShotMutation);
  addImageToShotMutationRef.current = addImageToShotMutation;
  
  const removeImageFromShotMutationRef = useRef(removeImageFromShotMutation);
  removeImageFromShotMutationRef.current = removeImageFromShotMutation;

  const duplicateAsNewGenerationMutationRef = useRef(duplicateAsNewGenerationMutation);
  duplicateAsNewGenerationMutationRef.current = duplicateAsNewGenerationMutation;
  
  const handleExternalImageDropMutationRef = useRef(handleExternalImageDropMutation);
  handleExternalImageDropMutationRef.current = handleExternalImageDropMutation;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const demoteOrphanedVariantsRef = useRef(demoteOrphanedVariants);
  demoteOrphanedVariantsRef.current = demoteOrphanedVariants;

  // 🎯 STABILITY FIX: Even though actions from useShotEditorState should be stable,
  // use a ref to be absolutely certain callbacks won't recreate
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handleDeleteImageFromShot = useCallback(async (shotImageEntryId: string) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot || !currentProjectId) {
      console.error('[DeleteDebug] ❌ Missing shot or project', {
        hasSelectedShot: !!currentShot,
        hasProjectId: !!currentProjectId
      });
      toast.error("Cannot remove image: No shot or project selected.");
      return;
    }

    // Guard: Prevent deleting optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    // Find the image by its id (shot_generations.id)
    // shotImageEntryId param IS the id (same value now)
    // 🎯 STABILITY FIX: Use ref to access latest data without causing callback recreation
    const currentOrderedImages = orderedShotImagesRef.current;
    const imageToDelete = currentOrderedImages.find(img => img.id === shotImageEntryId);
    
    // The actual generation ID is now stored in generation_id
    const actualGenerationId = imageToDelete?.generation_id;
    
    if (!actualGenerationId) {
      console.error('[DeleteDebug] ❌ Could not find generation ID for shotImageEntryId', {
        shotImageEntryId: shotImageEntryId.substring(0, 8),
        availableIds: currentOrderedImages.map(img => ({
          id: img.id?.substring(0, 8), // shot_generations.id
          generation_id: img.generation_id?.substring(0, 8)
        }))
      });
      toast.error("Cannot remove image: Image not found.");
      return;
    }

    // Check if we're deleting the first positioned item on the timeline
    // If so, we need to shift all remaining items back proportionally
    const positionedImages = currentOrderedImages
      .filter(img => img.timeline_frame != null && img.timeline_frame >= 0 && !isGenerationVideo(img))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    const deletedItemFrame = imageToDelete?.timeline_frame;
    const isDeletingFirstItem = positionedImages.length > 1 && 
      deletedItemFrame != null && 
      deletedItemFrame >= 0 &&
      positionedImages[0]?.id === shotImageEntryId;
    
    // Calculate the offset to shift remaining items (gap between first and second item)
    let frameOffset = 0;
    let itemsToShift: Array<{ id: string; currentFrame: number }> = [];
    
    if (isDeletingFirstItem && positionedImages.length >= 2) {
      const firstFrame = positionedImages[0].timeline_frame ?? 0;
      const secondFrame = positionedImages[1].timeline_frame ?? 0;
      frameOffset = secondFrame - firstFrame;
      
      // Collect all remaining items (excluding the one being deleted)
      itemsToShift = positionedImages
        .slice(1) // Skip first item (being deleted)
        .map(img => ({
          id: img.id,
          currentFrame: img.timeline_frame ?? 0
        }));
      
    }

    // [OptimisticUpdates] No event coordination needed - the mutation's optimistic update
    // immediately updates the React Query cache, and selectors automatically reflect the change.
    
    // Build shift data to pass to mutation (applied optimistically in onMutate)
    const shiftItems = isDeletingFirstItem && frameOffset > 0 && itemsToShift.length > 0
      ? itemsToShift.map(item => ({ id: item.id, newFrame: item.currentFrame - frameOffset }))
      : undefined;

    try {
      // CRITICAL: Pass shotGenerationId (shot_generations.id), NOT generationId (generations.id)
      // This ensures only this specific entry is deleted, not all duplicates of the same generation
      // shiftItems are applied optimistically in onMutate and persisted in mutationFn
      await removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: shotImageEntryId, // The unique shot_generations.id
        projectId: currentProjectId,
        shiftItems,
      });

      invalidateGenerationsSync(queryClientRef.current, currentShot.id, {
        reason: isDeletingFirstItem ? 'delete-image-frame-shift' : 'delete-image',
        scope: 'all',
        includeShots: true,
        projectId: currentProjectId
      });

      // Check for orphaned video variants after image deletion
      // Videos whose source images have changed will be demoted
      await demoteOrphanedVariantsRef.current(currentShot.id, 'single-image-delete');
    } catch (error) {
      handleError(error, { context: 'DeleteDebug', showToast: false });
      // Error handling is done by the mutation itself
    }
  }, []); // mutations, queryClient, selectedShot, projectId, orderedShotImages accessed via refs

  const handleBatchDeleteImages = useCallback(async (shotImageEntryIds: string[]) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot || !currentProjectId || shotImageEntryIds.length === 0) {
      return;
    }

    // [OptimisticUpdates] No event coordination needed - each mutation's optimistic update
    // immediately updates the React Query cache, and selectors automatically reflect the change.
    
    // Execute all timeline removals
    const removePromises = shotImageEntryIds.map(id => 
      removeImageFromShotMutationRef.current.mutateAsync({
        shotId: currentShot.id,
        shotGenerationId: id,
        projectId: currentProjectId,
      })
    );

    try {
      await Promise.all(removePromises);

      // Check for orphaned video variants after batch deletion
      await demoteOrphanedVariantsRef.current(currentShot.id, 'batch-image-delete');
    } catch (error) {
      toast.error('Failed to remove some images from timeline');
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  const handleDuplicateImage = useCallback(async (shotImageEntryId: string, timeline_frame: number) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot || !currentProjectId) {
      toast.error("Cannot duplicate image: No shot or project selected.");
      return;
    }

    // Guard: Prevent duplicating optimistic items (mutations in progress)
    if (shotImageEntryId.startsWith('temp-')) {
      toast.warning("Please wait for the previous operation to complete.");
      return;
    }

    // shotImageEntryId param is the shot_generations.id which matches img.id
    // 🎯 STABILITY FIX: Use ref to access latest data without causing callback recreation
    const currentOrderedImages = orderedShotImagesRef.current;
    const originalImage = currentOrderedImages.find(img => img.id === shotImageEntryId);
    if (!originalImage) {
      toast.error("Original image not found for duplication.");
      return;
    }
    
    // Get the actual generation_id (generations.id, not shot_generations.id)
    // originalImage.id is now shot_generations.id, we need generation_id
    const generationId = getGenerationId(originalImage);
    
    // Additional guard: Check if the generation ID is also temporary
    if (generationId.startsWith('temp-')) {
      toast.warning("Please wait for the image to finish uploading.");
      return;
    }
    
    // [OptimisticUpdates] No event coordination needed - the mutation's optimistic update
    // immediately updates the React Query cache, and selectors automatically reflect the change.

    // Start loading state targeting the specific shotImageEntryId
    actionsRef.current.setDuplicatingImageId(shotImageEntryId);

    // OPTIMISTIC UPDATE: Create a temporary duplicate for immediate feedback
    const tempDuplicateId = nanoid();
    const optimisticDuplicate: GenerationRow = {
      ...originalImage,
      shotImageEntryId: tempDuplicateId,
      id: tempDuplicateId,
      isOptimistic: true,
      // Place duplicate right after the original for mobile batch view
    };

    // REMOVED: Optimistic duplicate insertion - two-phase loading is fast enough

    // Calculate the next image's frame from UI data (more reliable than database query)
    // Sort images by their timeline_frame and find the one after the current
    const sortedImages = [...currentOrderedImages]
      .filter(img => img.timeline_frame !== undefined && img.timeline_frame !== null)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    
    // Find by id (shot_generations.id)
    const currentIndex = sortedImages.findIndex(img => img.id === shotImageEntryId);
    
    const nextImage = currentIndex >= 0 && currentIndex < sortedImages.length - 1
      ? sortedImages[currentIndex + 1]
      : null;
    const nextTimelineFrame = nextImage ? nextImage.timeline_frame : undefined;

    // The interceptor already calculates the correct target frame (midpoint + collision avoidance).
    // Always pass it as target_timeline_frame so the mutation uses it directly instead of
    // re-computing a midpoint (which would give a different result since timeline_frame
    // is already the midpoint, not the original item's frame).
    const targetTimelineFrame = timeline_frame;
    const sourceTimelineFrame = originalImage.timeline_frame ?? 0;

    duplicateAsNewGenerationMutationRef.current.mutate({
      shot_id: currentShot.id,
      generation_id: generationId,
      project_id: currentProjectId,
      timeline_frame: sourceTimelineFrame,
      next_timeline_frame: nextTimelineFrame,
      target_timeline_frame: targetTimelineFrame,
    }, {
      onSuccess: (result) => {

        // Add the new item to pending positions immediately to prevent flicker
        // The new item will be in the positions map before the refetch completes
        if (result.new_shot_generation_id && result.timeline_frame !== undefined) {
          const newPendingPositions = new Map(state.pendingFramePositions);
          newPendingPositions.set(result.new_shot_generation_id, result.timeline_frame);
          actionsRef.current.setPendingFramePositions(newPendingPositions);

          // Notify skeleton to wait for this specific item ID before clearing
          window.dispatchEvent(new CustomEvent('timeline:duplicate-complete', {
            detail: {
              shotId: currentShot.id,
              newItemId: result.new_shot_generation_id
            }
          }));
        }

        // Show success state
        actionsRef.current.setDuplicateSuccessImageId(shotImageEntryId);
        // Clear success state after 2 seconds
        setTimeout(() => actionsRef.current.setDuplicateSuccessImageId(null), 2000);
      },
      onError: (error) => {
        handleError(error, { context: 'DUPLICATE', toastTitle: 'Failed to duplicate image' });

        // REMOVED: Rollback logic - no optimistic state to revert
      },
      onSettled: () => {
        // Clear loading state
        actionsRef.current.setDuplicatingImageId(null);
      }
    });
  }, []); // actions, mutations, selectedShot, projectId, orderedShotImages accessed via refs

  /**
   * Handle dropping external image files onto the timeline
   * 
   * REFACTORED: Uses a simplified approach:
   * 1. Calculate positions upfront
   * 2. Upload with pre-calculated positions (single database round-trip)
   * 3. Refresh data (positions already set correctly)
   * 
   * This eliminates the race conditions that caused shaky behavior.
   */
  const handleTimelineImageDrop = useCallback(async (files: File[], targetFrame?: number) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    const currentBatchVideoFrames = batchVideoFramesRef.current;
    
    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    try {
      actionsRef.current.setUploadingImage(true);
      
      // 1. Calculate target positions BEFORE upload
      const calculatedTargetFrame = await calculateNextAvailableFrame(
        currentShot.id,
        targetFrame
      );
      
      // 2. Crop images to shot aspect ratio
      // 🎯 STABILITY FIX: Use refs to access latest data without causing callback recreation
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        currentShot,
        currentProjectId,
        projectsRef.current,
        uploadSettingsRef.current
      );
      
      // 3. Calculate positions for each file
      const positions = processedFiles.map((_, index) => 
        calculatedTargetFrame + (index * currentBatchVideoFrames)
      );
      
      // 4. Upload with positions (single round trip to database)
      const result = await handleExternalImageDropMutationRef.current.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: currentShot.id,
        currentProjectQueryKey: currentProjectId,
        currentShotCount: 0,
        skipAutoPosition: false, // Let server use our calculated positions
        positions: positions, // Pass pre-calculated positions
        onProgress: (fileIndex, fileProgress, overallProgress) => {
        }
      });

      if (!result?.generationIds?.length) {
        return;
      }
      
      // 5. If positions weren't set by the upload mutation, set them now
      // This is a fallback for backwards compatibility
      if (result.generationIds.length > 0) {
        // Check if positions were already set by the upload
        const needsPositionUpdate = await (async () => {
          const { data } = await supabase
            .from('shot_generations')
            .select('id, timeline_frame')
            .eq('shot_id', currentShot.id)
            .in('generation_id', result.generationIds)
            .limit(1);
          
          return data?.[0]?.timeline_frame === null;
        })();
        
        if (needsPositionUpdate) {
          await persistTimelinePositions(
            currentShot.id,
            result.generationIds,
            calculatedTargetFrame,
            currentBatchVideoFrames
          );
        }
      }

      // 6. Refresh the shot data
      // REMOVED: Don't force refetch here. useAddImageToShot now handles cache updates correctly.
      // Calling refetch here causes a race condition where stale data from the server
      // overwrites the correct optimistic data in the cache, causing the image to disappear.
      // await onShotImagesUpdate();
      
    } catch (error) {
      handleError(error, { context: 'TimelineDrop', toastTitle: 'Failed to add images' });
      throw error;
    } finally {
      actionsRef.current.setUploadingImage(false);
    }
  }, [
    // actions, mutations, selectedShot, projectId, batchVideoFrames, projects, uploadSettings, onShotImagesUpdate accessed via refs
  ]);

  /**
   * Handle dropping a generation from GenerationsPane onto the timeline
   * This adds an existing generation to the shot at the specified frame position
   */
  const handleTimelineGenerationDrop = useCallback(async (
    generationId: string, 
    imageUrl: string, 
    thumbUrl: string | undefined, 
    targetFrame?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      
      // Add the generation to the shot using the existing mutation
      // The addImageToShot API will handle creating the shot_image_entry
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        timelineFrame: targetFrame, // Position on timeline if provided
        project_id: currentProjectId
      });
      
      // Note: Don't call onShotImagesUpdate() here - the mutation's onSuccess 
      // already invalidates the cache, and calling refresh causes double-refresh flicker
    } catch (error) {
      handleError(error, { context: 'GenerationDrop', toastTitle: 'Failed to add generation' });
      throw error;
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  /**
   * Handle dropping external images onto batch mode grid
   *
   * Shows optimistic skeleton immediately using local file preview URLs,
   * then uploads and replaces with real data.
   *
   * @param files - Files to upload
   * @param targetFrame - timeline_frame position (calculated by component from grid position)
   */
  const handleBatchImageDrop = useCallback(async (
    files: File[],
    targetFrame?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;
    
    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add images: No shot or project selected.");
      return;
    }

    // Track optimistic items for cleanup
    const optimisticIds: string[] = [];
    const localUrls: string[] = [];

    try {
      actionsRef.current.setUploadingImage(true);
      
      // 1. Calculate target frame positions with collision detection
      // First get the start frame (already collision-checked by calculateNextAvailableFrame)
      const startFrame = targetFrame ?? await calculateNextAvailableFrame(currentShot.id, undefined);
      
      // For multiple files, we need to ensure each position is unique
      // Get existing frames from cache for quick collision detection
      const existingGens = queryClientRef.current.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(currentShot.id)) || [];
      const existingFrames = existingGens
        .filter(g => g.timeline_frame != null && g.timeline_frame !== -1)
        .map(g => g.timeline_frame as number);
      
      // Calculate unique positions for each file (DEFAULT_FRAME_SPACING frames apart)
      const positions: number[] = [];
      const allUsedFrames = [...existingFrames];
      for (let i = 0; i < files.length; i++) {
        let targetFrame = startFrame + (i * DEFAULT_FRAME_SPACING);
        // Ensure this frame is unique (not in existing or already assigned)
        while (allUsedFrames.includes(targetFrame)) {
          targetFrame += 1;
        }
        positions.push(targetFrame);
        allUsedFrames.push(targetFrame);
      }
      
      // 2. Create optimistic entries immediately using local file URLs
      const previousFastGens = queryClientRef.current.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(currentShot.id)) || [];
      
      const optimisticItems = files.map((file, index) => {
        const localUrl = URL.createObjectURL(file);
        localUrls.push(localUrl);
        const tempId = `temp-upload-${Date.now()}-${index}-${Math.random()}`;
        optimisticIds.push(tempId);
        
        return {
          id: tempId,
          generation_id: tempId,
          shotImageEntryId: tempId,
          shot_generation_id: tempId,
          location: localUrl,
          thumbnail_url: localUrl,
          imageUrl: localUrl,
          thumbUrl: localUrl,
          timeline_frame: positions[index],
          type: 'image' as const,
          created_at: new Date().toISOString(),
          starred: false,
          name: file.name,
          based_on: null,
          params: {},
          shot_data: { [currentShot.id]: [positions[index]] },  // Array format
          _optimistic: true,
          _uploading: true // Extra flag to show upload indicator
        };
      });
      
      // Add optimistic items to cache
      queryClientRef.current.setQueryData(
        queryKeys.generations.byShot(currentShot.id),
        [...previousFastGens, ...optimisticItems]
      );
      
      // 3. Crop images
      // 🎯 STABILITY FIX: Use refs to access latest data without causing callback recreation
      const processedFiles = await cropImagesToShotAspectRatio(
        files,
        currentShot,
        currentProjectId,
        projectsRef.current,
        uploadSettingsRef.current
      );
      
      // 4. Upload with positions
      // Pass skipOptimistic: true so we don't create DUPLICATE optimistic items
      // Our manual ones will persist until the real items come back from the server (after cache invalidation)
      const result = await handleExternalImageDropMutationRef.current.mutateAsync({
        imageFiles: processedFiles,
        targetShotId: currentShot.id,
        currentProjectQueryKey: currentProjectId,
        currentShotCount: 0,
        skipAutoPosition: false,
        positions: positions,
        skipOptimistic: true
      });
      
      if (!result?.generationIds?.length) {
        return;
      }
      
      // 5. If positions weren't set by the upload, set them now (fallback)
      const { data: checkData } = await supabase
        .from('shot_generations')
        .select('id, timeline_frame')
        .eq('shot_id', currentShot.id)
        .in('generation_id', result.generationIds)
        .limit(1);
      
      if (checkData?.[0]?.timeline_frame === null) {
        await persistTimelinePositions(
          currentShot.id,
          result.generationIds,
          startFrame,
          1 // Use 1 frame spacing for batch mode
        );
      }
      
    } catch (error) {
      handleError(error, { context: 'BatchDrop', toastTitle: 'Failed to add images' });

      // Remove optimistic items on error
      const currentCache = queryClientRef.current.getQueryData<GenerationRow[]>(queryKeys.generations.byShot(currentShot.id)) || [];
      queryClientRef.current.setQueryData(
        queryKeys.generations.byShot(currentShot.id),
        currentCache.filter(item => !optimisticIds.includes(item.id))
      );

      throw error;
    } finally {
      actionsRef.current.setUploadingImage(false);
      
      // Clean up local URLs to prevent memory leaks
      localUrls.forEach(url => URL.revokeObjectURL(url));
    }
  }, []); // actions, mutations, queryClient, selectedShot, projectId, projects, uploadSettings accessed via refs

  /**
   * Handle dropping a generation from GenerationsPane onto batch mode grid
   * Adds an existing generation to the shot at the specified position
   *
   * @param generationId - ID of the generation to add
   * @param imageUrl - Full URL of the image
   * @param thumbUrl - Thumbnail URL (optional)
   * @param targetFrame - timeline_frame position (calculated by component from grid position)
   */
  const handleBatchGenerationDrop = useCallback(async (
    generationId: string,
    imageUrl: string,
    thumbUrl: string | undefined,
    targetFrame?: number
  ) => {
    // 🎯 STABILITY FIX: Use refs to access latest values without causing callback recreation
    const currentShot = selectedShotRef.current;
    const currentProjectId = projectIdRef.current;

    if (!currentShot?.id || !currentProjectId) {
      toast.error("Cannot add generation: No shot or project selected.");
      return;
    }

    if (!generationId) {
      toast.error("Invalid generation: Missing generation ID.");
      return;
    }

    try {
      await addImageToShotMutationRef.current.mutateAsync({
        generation_id: generationId,
        shot_id: currentShot.id,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: currentProjectId,
        timelineFrame: targetFrame,
      });
    } catch (error) {
      handleError(error, { context: 'BatchDrop', toastTitle: 'Failed to add generation' });
      throw error;
    }
  }, []); // mutations, selectedShot, projectId accessed via refs

  // Memoize the return object to prevent callback instability in parent components.
  // All callbacks have empty dependency arrays and use refs internally.
  return useMemo(() => ({
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
  }), [
    handleDeleteImageFromShot,
    handleBatchDeleteImages,
    handleDuplicateImage,
    handleTimelineImageDrop,
    handleTimelineGenerationDrop,
    handleBatchImageDrop,
    handleBatchGenerationDrop,
  ]);
}; 