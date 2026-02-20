/**
 * Gallery Page State & Orchestration (useGalleryPageState)
 * =========================================================
 *
 * This is a PAGE-LEVEL CONTROLLER, not a data fetching hook.
 * It manages filter state, pagination, and action handlers for gallery pages.
 *
 * ## When to Use
 * - Building a tool page with the standard GenerationsPane
 * - You need filter state (shot filter, starred, search) with persistence
 * - You need "add to shot" or "delete" action handlers
 * - You want automatic filter persistence per-shot
 *
 * ## When NOT to Use
 * - You just need to fetch generations -> use `useProjectGenerations` directly
 * - You're inside a shot editor -> use hooks from `useShotImages.ts`
 * - You're building a custom gallery without standard filters
 *
 * ## What This Hook Provides
 * - **State**: selectedShotFilter, excludePositioned, searchTerm, starredOnly, page
 * - **Data**: paginatedData, totalCount, expectedItemCount (for skeletons)
 * - **Handlers**: handleAddToShot, handleDeleteGeneration, handleToggleStar
 * - **Loading**: isLoading, isFetching, isError
 *
 * ## Internal Dependencies
 * - Calls `useGalleryFilterState` for filter state management
 * - Calls `useProjectGenerations` for data fetching
 * - Calls `useShots` for shot list and counts
 *
 * @module useGalleryPageState
 */

import { useState, useEffect, useMemo, useContext } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useProjectGenerations, type GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useToggleGenerationStar } from '@/shared/hooks/useGenerationMutations';
import { useDeleteGenerationWithConfirm } from '@/shared/hooks/useDeleteGenerationWithConfirm';
import { useAddImageToShot, useAddImageToShotWithoutPosition, usePositionExistingGenerationInShot } from '@/shared/hooks/useShots';
import { LastAffectedShotContext } from '@/shared/contexts/LastAffectedShotContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useGalleryFilterState } from '@/shared/hooks/gallery/useGalleryFilterState';

interface UseGenerationsPageLogicOptions {
  itemsPerPage?: number;
  mediaType?: 'all' | 'image' | 'video';
  toolType?: string;
  enableDataLoading?: boolean;
}

/**
 * @internal Use `useGalleryPageState` instead (exported alias below).
 */
function useGenerationsPageLogic({
  itemsPerPage = 45,
  mediaType = 'image',
  toolType,
  enableDataLoading = true
}: UseGenerationsPageLogicOptions = {}) {
  const { selectedProjectId } = useProject();
  const { shots: shotsData } = useShots();

  // Gate all data loading based on project availability and enableDataLoading flag
  const shouldLoadData = enableDataLoading && !!selectedProjectId;
  const [page, setPage] = useState(1);

  const { currentShotId } = useCurrentShot();

  // Get last affected shot context early so it's available for effects below
  const lastAffectedShotContext = useContext(LastAffectedShotContext);
  const { lastAffectedShotId = null, setLastAffectedShotId = () => {} } = lastAffectedShotContext || {};

  // ============================================================================
  // FILTER STATE (extracted to useGalleryFilterState)
  // ============================================================================

  const filterState = useGalleryFilterState({
    shouldLoadData,
    onShotFilterApplied: setLastAffectedShotId,
  }, mediaType, toolType);

  const {
    selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,
    filters,
    expectedItemCount,
    applyQueryFallback,
  } = filterState;

  // Reset to page 1 when shot filter or position filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedShotFilter, excludePositioned]);

  // Reset to page 1 when media type or starred filter changes
  useEffect(() => {
    setPage(1);
  }, [mediaType, starredOnly]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const generationsQuery = useProjectGenerations(
    shouldLoadData ? selectedProjectId : null,
    page,
    itemsPerPage,
    shouldLoadData,
    filters
  );
  const generationsResponse = generationsQuery.data as GenerationsPaginatedResponse | undefined;
  const isFetching = generationsQuery.isFetching;
  const isError = generationsQuery.isError;
  const error = generationsQuery.error;

  // Track if we're showing stale/placeholder data during a filter change
  const isPlaceholderData = generationsQuery.isPlaceholderData;

  // Show loading state when:
  // 1. Initial load (no data yet), OR
  // 2. Filter changed and we're showing stale placeholder data
  const isLoading = generationsQuery.isLoading || (isFetching && isPlaceholderData);

  // ============================================================================
  // QUERY FALLBACK - delegate to filter state hook
  // ============================================================================

  useEffect(() => {
    applyQueryFallback({
      isLoading,
      isFetching,
      total: generationsResponse?.total,
      hasResponse: generationsResponse !== undefined,
    }, page);
  }, [selectedShotFilter, isLoading, isFetching, generationsResponse?.total, page, applyQueryFallback, generationsResponse]);

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const positionExistingGenerationMutation = usePositionExistingGenerationInShot();
  const { requestDelete, DeleteConfirmDialog, deletingId } = useDeleteGenerationWithConfirm();
  const toggleStarMutation = useToggleGenerationStar();

  // ============================================================================
  // PAGINATION
  // ============================================================================

  const paginatedData = useMemo(() => {
    const items = generationsResponse?.items ?? [];
    const total = generationsResponse?.total ?? 0;
    const totalPages = Math.ceil(total / itemsPerPage);

    return {
      items,
      totalPages,
      currentPage: page
    };
  }, [generationsResponse, page, itemsPerPage]);

  // ============================================================================
  // LAST AFFECTED SHOT INITIALIZATION
  // ============================================================================

  useEffect(() => {

    if (!lastAffectedShotId && shotsData && shotsData.length > 0) {
      setLastAffectedShotId(shotsData[0].id);
    }
  }, [lastAffectedShotId, shotsData, setLastAffectedShotId, currentShotId, selectedShotFilter]);

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  const handleServerPageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleDeleteGeneration = (id: string) => {
    requestDelete(id);
  };

  const handleToggleStar = (id: string, starred: boolean) => {
    toggleStarMutation.mutate({ id, starred });
  };

  const handleAddToShot = async (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    const resolvedTargetShotId = targetShotId || lastAffectedShotId || currentShotId;

    if (!resolvedTargetShotId || !selectedProjectId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return false;
    }

    const shouldPositionExisting = selectedShotFilter === resolvedTargetShotId && excludePositioned;

    // Dispatch event to trigger skeleton animation in ShotListDisplay
    window.dispatchEvent(new CustomEvent('shot-pending-upload', {
      detail: { shotId: resolvedTargetShotId, expectedCount: 1 }
    }));

    try {
      if (shouldPositionExisting) {

        await positionExistingGenerationMutation.mutateAsync({
          shot_id: resolvedTargetShotId,
          generation_id: generationId,
          project_id: selectedProjectId,
        });

      } else {

        await addImageToShotMutation.mutateAsync({
          shot_id: resolvedTargetShotId,
          generation_id: generationId,
          imageUrl: imageUrl,
          thumbUrl: thumbUrl,
          project_id: selectedProjectId,
        });

      }

      setLastAffectedShotId(resolvedTargetShotId);
      return true;
    } catch (error) {
      handleError(error, { context: 'useGenerationsPageLogic', toastTitle: 'Failed to add image to shot' });
      return false;
    }
  };

  const handleAddToShotWithoutPosition = async (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    const resolvedTargetShotId = targetShotId || lastAffectedShotId || currentShotId;

    if (!resolvedTargetShotId || !selectedProjectId) {
      toast.error("No shot selected", {
        description: "Please select a shot in the gallery or create one first.",
      });
      return false;
    }

    try {
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: resolvedTargetShotId,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId,
      });
      setLastAffectedShotId(resolvedTargetShotId);
      return true;
    } catch (error) {
      handleError(error, { context: 'useGenerationsPageLogic', toastTitle: 'Failed to add image to shot' });
      return false;
    }
  };

  // ============================================================================
  // RETURN API
  // ============================================================================

  return {
    // Data
    selectedProjectId,
    shotsData,
    generationsResponse,
    paginatedData,
    lastAffectedShotId,
    totalCount: generationsResponse?.total ?? 0,

    // State
    page,
    selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,

    // State setters
    setPage,
    setSelectedShotFilter: filterState.setSelectedShotFilter,
    setExcludePositioned: filterState.setExcludePositioned,
    setSearchTerm: filterState.setSearchTerm,
    setStarredOnly: filterState.setStarredOnly,

    // Loading states
    isLoading,
    isFetching,
    isError,
    error,
    isDeleting: deletingId,

    // Confirmation dialog component — render in consuming component's JSX
    DeleteConfirmDialog,

    // For skeleton display when filter changes
    expectedItemCount,

    // Handlers
    handleServerPageChange,
    handleDeleteGeneration,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleToggleStar,
  };
}

// ============================================================================
// NEW NAME (preferred) - Use this in new code
// ============================================================================

/**
 * Gallery page state & orchestration hook.
 * This is the preferred name - use this in new code.
 * @see useGenerationsPageLogic for documentation
 */
export const useGalleryPageState = useGenerationsPageLogic;

// ============================================================================
// BACKWARDS COMPATIBILITY
// useGenerationsPageLogic is exported above as the implementation
// ============================================================================
