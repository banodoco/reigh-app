import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { useQueryClient } from '@tanstack/react-query';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { useNavigate, useLocation } from 'react-router-dom';
import { TOOL_ROUTES } from '@/shared/lib/toolRoutes';
import { type GalleryFilterState } from '@/shared/components/MediaGallery';
import { useContainerWidth } from '@/shared/components/MediaGallery/hooks/useContainerWidth';
import { calculateGalleryLayout } from '@/shared/components/MediaGallery/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useGalleryPageState } from '@/shared/hooks/gallery/useGalleryPageState';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import {
  useProjectCrudContext,
  useProjectSelectionContext,
} from '@/shared/contexts/ProjectContext';
import { useShotCreation } from '@/shared/hooks/shotCreation/useShotCreation';
import { useStableObject } from '@/shared/hooks/useStableObject';
import { usePaneInteractionLifecycle } from '@/shared/components/panes/usePaneInteractionLifecycle';
import { SHOT_FILTER, isSpecialFilter } from '@/shared/constants/filterConstants';
import { useAppEventListener } from '@/shared/lib/typedEvents';

// Fallback rows for pane (smaller than full page galleries)
const PANE_ROWS = 2;

export const useGenerationsPaneController = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    isGenerationsPaneLocked,
    setIsGenerationsPaneLocked,
    isGenerationsPaneOpen,
    setIsGenerationsPaneOpen,
    generationsPaneHeight,
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth,
  } = usePanes();

  const isOnImageGenerationPage = location.pathname === TOOL_ROUTES.IMAGE_GENERATION;

  const { selectedProjectId } = useProjectSelectionContext();
  const { projects } = useProjectCrudContext();
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const shouldEnableDataLoading = isGenerationsPaneOpen;

  const isMobile = useIsMobile();
  const [galleryContainerRef, containerWidth] = useContainerWidth();

  const paneLayout = useMemo(() => {
    const layout = calculateGalleryLayout(
      projectAspectRatio,
      isMobile,
      containerWidth,
      undefined,
      true,
    );
    return {
      ...layout,
      itemsPerPage: layout.columns * PANE_ROWS,
    };
  }, [projectAspectRatio, isMobile, containerWidth]);

  const generationsPerPage = paneLayout.itemsPerPage;
  const { currentShotId } = useCurrentShot();

  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image');
  const [shotFilterOpen, setShotFilterOpen] = useState(false);
  const [mediaTypeFilterOpen, setMediaTypeFilterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

  const handleOpenModal = useCallback(() => setIsGenerationModalOpen(true), []);
  const handleCloseModal = useCallback(() => setIsGenerationModalOpen(false), []);
  useAppEventListener('openGenerationModal', handleOpenModal);
  useAppEventListener('closeGenerationModal', handleCloseModal);

  const {
    shotsData,
    paginatedData,
    lastAffectedShotId,
    totalCount,
    selectedShotFilter,
    excludePositioned,
    page,
    isLoading,
    error,
    isDeleting,
    starredOnly,
    searchTerm,
    setSelectedShotFilter,
    setExcludePositioned,
    setStarredOnly,
    setSearchTerm,
    handleServerPageChange,
    handleDeleteGeneration,
    handleToggleStar,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    expectedItemCount,
    confirmDialogProps,
  } = useGalleryPageState({
    itemsPerPage: generationsPerPage,
    mediaType: mediaTypeFilter,
    enableDataLoading: shouldEnableDataLoading,
  });

  const { shots: contextShots } = useShots();
  const shotsForFilter = (shotsData && shotsData.length > 0)
    ? shotsData
    : (contextShots || []);

  const { createShot } = useShotCreation();
  const handleCreateShot = useCallback(async (shotName: string, files: File[]): Promise<void> => {
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      dispatchSkeletonEvents: files.length > 0,
      onSuccess: () => {
        if (selectedProjectId) {
          void queryClient.invalidateQueries({ queryKey: [...shotQueryKeys.all, selectedProjectId] });
        }
      },
    });

    if (!result) {
      return;
    }
  }, [createShot, queryClient, selectedProjectId]);

  useRenderLogger('GenerationsPane', { page, totalItems: totalCount });

  const generationFilters = useStableObject(() => ({
    mediaType: mediaTypeFilter,
    shotId: selectedShotFilter === SHOT_FILTER.ALL ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== SHOT_FILTER.ALL ? excludePositioned : undefined,
    starredOnly,
  }), [mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

  const galleryFilters = useMemo((): GalleryFilterState => ({
    mediaType: mediaTypeFilter,
    shotFilter: selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,
    toolTypeFilter: false,
  }), [mediaTypeFilter, selectedShotFilter, excludePositioned, searchTerm, starredOnly]);

  const handleGalleryFiltersChange = useCallback((newFilters: GalleryFilterState) => {
    setSelectedShotFilter(newFilters.shotFilter);
    setExcludePositioned(newFilters.excludePositioned);
    setSearchTerm(newFilters.searchTerm);
    setStarredOnly(newFilters.starredOnly);
    setMediaTypeFilter(newFilters.mediaType);
  }, [setSelectedShotFilter, setExcludePositioned, setSearchTerm, setStarredOnly, setMediaTypeFilter]);

  const shotFilterContentRef = useRef<HTMLDivElement>(null);
  const mediaTypeContentRef = useRef<HTMLDivElement>(null);

  const {
    isLocked,
    isOpen,
    toggleLock,
    openPane,
    paneProps,
    transformClass,
    handlePaneEnter,
    handlePaneLeave,
    showBackdrop,
    closePane,
  } = useSlidingPane({
    side: 'bottom',
    isLocked: isGenerationsPaneLocked,
    onToggleLock: () => setIsGenerationsPaneLocked(!isGenerationsPaneLocked),
    additionalRefs: [shotFilterContentRef, mediaTypeContentRef],
  });
  const paneIsOpen = Boolean(isOpen);

  const handlePaneOpenStart = useCallback(() => {
    setShotFilterOpen(false);
    setMediaTypeFilterOpen(false);
  }, [setShotFilterOpen, setMediaTypeFilterOpen]);

  const { isPointerEventsEnabled, isInteractionDisabled } = usePaneInteractionLifecycle({
    isOpen: paneIsOpen,
    disableInteractionsDuringOpen: true,
    onOpenStart: handlePaneOpenStart,
  });

  const handleOpenGenerationsPane = useCallback(() => {
    openPane();
  }, [openPane]);
  useAppEventListener('openGenerationsPane', handleOpenGenerationsPane);

  useEffect(() => {
    setIsGenerationsPaneOpen(paneIsOpen);
  }, [paneIsOpen, setIsGenerationsPaneOpen]);

  useEffect(() => {
    if ((isOnImageGenerationPage) && (paneIsOpen || isLocked)) {
      setIsGenerationsPaneLocked(false);
    }
  }, [isOnImageGenerationPage, paneIsOpen, isLocked, setIsGenerationsPaneLocked]);

  const handleNavigateToImageGeneration = useCallback(() => {
    setIsGenerationsPaneLocked(false);
    navigate(TOOL_ROUTES.IMAGE_GENERATION);
  }, [navigate, setIsGenerationsPaneLocked]);

  return {
    closePane,
    confirmDialogProps,
    currentShotId,
    error,
    excludePositioned,
    galleryContainerRef,
    galleryFilters,
    generationFilters,
    generationsPaneHeight,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    handleCreateShot,
    handleDeleteGeneration,
    handleGalleryFiltersChange,
    handleNavigateToImageGeneration,
    handlePaneEnter,
    handlePaneLeave,
    handleServerPageChange,
    handleToggleStar,
    isDeleting,
    isGenerationModalOpen,
    isInteractionDisabled,
    isLocked,
    isLoading,
    isOnImageGenerationPage,
    isPointerEventsEnabled,
    isSearchOpen,
    isShotsPaneLocked,
    isSpecialFilterSelected: isSpecialFilter(selectedShotFilter),
    isTasksPaneLocked,
    lastAffectedShotId,
    mediaTypeContentRef,
    mediaTypeFilter,
    mediaTypeFilterOpen,
    openPane,
    page,
    paginatedData,
    paneIsOpen,
    paneLayout,
    paneProps,
    projectAspectRatio,
    searchInputRef,
    searchTerm,
    selectedShotFilter,
    setExcludePositioned,
    setIsGenerationModalOpen,
    setIsSearchOpen,
    setMediaTypeFilter,
    setMediaTypeFilterOpen,
    setSelectedShotFilter,
    setShotFilterOpen,
    setStarredOnly,
    setSearchTerm,
    shotFilterContentRef,
    shotFilterOpen,
    shotsForFilter,
    shotsPaneWidth,
    showBackdrop,
    starredOnly,
    tasksPaneWidth,
    toggleLock,
    totalCount,
    transformClass,
    expectedItemCount,
  };
};
