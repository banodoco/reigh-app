import React, { useMemo, useEffect, useCallback, useRef } from "react";
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useShotAdditionSelectionOptional } from '@/shared/contexts/ShotAdditionSelectionContext';
import { useIsMobile, useIsTablet } from "@/shared/hooks/mobile";
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useToggleGenerationStar } from '@/domains/generation/hooks/useGenerationMutations';
import { useTaskDetails } from '@/shared/components/ShotImageManager/hooks/useTaskDetails';
import { useBackgroundThumbnailGenerator } from '@/shared/hooks/media/useBackgroundThumbnailGenerator';
import { useVariantBadges } from '@/shared/hooks/useVariantBadges';
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { cn } from '@/shared/components/ui/contracts/cn';

// Import hooks
import {
  useMediaGalleryState,
  useMediaGalleryFilters,
  useMediaGalleryPagination,
  useMediaGalleryActions,
  useContainerWidth,
  useLightboxNavigation,
  useMediaGalleryInteractionController,
} from './hooks';

// Import components
import { MediaGalleryHeader } from './components/MediaGalleryHeader';
import { ShotNotifier } from './components/ShotNotifier';
import { MediaGalleryGrid } from './components/MediaGalleryGrid';
import { MediaGalleryLightbox } from './components/MediaGalleryLightbox';
import { MobileBottomBar } from './components/MobileBottomBar';
import { useMediaGalleryDebugTools } from './hooks/useMediaGalleryDebugTools';

// Import utils
import { GRID_COLUMN_CLASSES, calculateGalleryLayout } from './utils';

// Import types
import type {
  GeneratedImageWithMetadata,
  MediaGalleryProps,
  GalleryFilterState,
  GalleryConfig,
} from './types';
export type { GalleryFilterState };
export { DEFAULT_GALLERY_FILTERS } from './types';
import { DEFAULT_GALLERY_CONFIG } from './types';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import type {
  ItemActions,
  ItemFeatures,
  ItemLoading,
  ItemMobileInteraction,
  ItemShotWorkflow,
} from '@/shared/components/MediaGalleryItem/types';

// Re-export types that are used externally
export type {
  GeneratedImageWithMetadata,
};

/**
 * MediaGallery Component with consolidated state management
 * 
 * Key optimizations:
 * - Consolidated state management using useReducer instead of multiple useState calls
 * - Selective re-rendering with React.memo and proper dependency arrays
 * - Memoized expensive computations and callbacks
 * - Reduced hook complexity and state updates
 */
const MediaGallery: React.FC<MediaGalleryProps> = React.memo((props) => {
  const {
    images,
    onDelete,
    isDeleting,
    onApplySettings,
    allShots,
    lastShotId,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    currentToolType,
    initialFilterState = true,
    currentViewingShotId,
    offset = 0,
    totalCount,
    columnsPerRow = 'auto',
    itemsPerPage,
    filters,
    onFiltersChange,
    defaultFilters,
    onServerPageChange,
    serverPage,
    onToggleStar,
    currentToolTypeName: _currentToolTypeName,
    formAssociatedShotId,
    onSwitchToAssociatedShot,
    className,
    enableAdjacentPagePreloading = true,
    generationFilters,
    onCreateShot,
    lastShotNameForTooltip: _lastShotNameForTooltip,
    onBackfillRequest,
    onImageClick,
    config: configOverrides,
  } = props;

  // Merge caller's config overrides with defaults
  const config: GalleryConfig = React.useMemo(() => ({
    ...DEFAULT_GALLERY_CONFIG,
    ...configOverrides,
  }), [configOverrides]);

  // Destructure config for convenience (avoids config.X everywhere in JSX)
  const {
    showDelete, showDownload, showShare, showEdit, showStar, showAddToShot,
    enableSingleClick, videosAsThumbnails, darkSurface, reducedSpacing,
    showShotFilter, showSearch,
    hidePagination, hideTopFilters, hideMediaTypeFilter, hideBottomPagination, hideShotNotifier,
  } = config;

  // Get project context for cache clearing and aspect ratio
  const { selectedProjectId, projects } = useProject();
  const { currentShotId } = useCurrentShot();

  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const rawIsMobile = useIsMobile();

  const isTablet = useIsTablet();

  // Measure container width for dynamic column calculation
  const [galleryContainerRef, containerWidth] = useContainerWidth();

  // Fallback mobile detection in case useIsMobile fails
  const isMobile = rawIsMobile ?? (typeof window !== 'undefined' && window.innerWidth < 768);

  // Phone only (not iPad) - for safe area adjustments
  const isPhoneOnly = isMobile && !isTablet;

  useMediaGalleryDebugTools({
    currentToolType,
    filtersMediaType: filters?.mediaType,
    defaultFiltersMediaType: defaultFilters?.mediaType,
    imagesLength: images?.length ?? 0,
    isMobile,
  });
  
  // Star functionality
  const toggleStarMutation = useToggleGenerationStar();
  const { navigateToShot } = useShotNavigation();

  // Compute aspect-ratio-aware layout (columns, itemsPerPage, skeletonColumns)
  // This adjusts columns based on both image dimensions AND container width:
  // - Wide images (16:9) → larger target width → fewer columns
  // - Tall images (9:16) → smaller target width → more columns
  // - Wider containers → more columns fit
  // - Narrower containers → fewer columns fit
  // Tweak TARGET_IMAGE_WIDTH.BASE in mediaGallery-constants.ts to adjust density.
  const aspectRatioLayout = React.useMemo(() => {
    return calculateGalleryLayout(projectAspectRatio, isMobile, containerWidth, undefined, reducedSpacing);
  }, [projectAspectRatio, isMobile, containerWidth, reducedSpacing]);

  // Use aspect-ratio-aware defaults, but allow explicit override via props
  // 'auto' means dynamic calculation based on aspect ratio, any number is a fixed column count
  const effectiveColumnsPerRow = columnsPerRow === 'auto' ? aspectRatioLayout.columns : columnsPerRow;
  const defaultItemsPerPage = aspectRatioLayout.itemsPerPage;

  // Ensure itemsPerPage is a multiple of columns to guarantee full rows
  const rawItemsPerPage = itemsPerPage ?? defaultItemsPerPage;
  const actualItemsPerPage = Math.floor(rawItemsPerPage / effectiveColumnsPerRow) * effectiveColumnsPerRow || effectiveColumnsPerRow;

  // Memoize simplified shot options to prevent re-computation on every render
  const simplifiedShotOptions = React.useMemo(() =>
    [...allShots]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map(s => ({
        id: s.id,
        name: s.name,
        settings: s.settings,
        created_at: s.created_at
      })),
    [allShots]
  );

  // Memoize grid column classes to prevent unnecessary recalculations
  const gridColumnClasses = React.useMemo(() => {
    return GRID_COLUMN_CLASSES[effectiveColumnsPerRow as keyof typeof GRID_COLUMN_CLASSES] || aspectRatioLayout.gridColumnClasses;
  }, [effectiveColumnsPerRow, aspectRatioLayout.gridColumnClasses]);

  // Core state management hook
  const stateHook = useMediaGalleryState({
    images,
    currentShotId: currentShotId ?? undefined,
    lastShotId,
    simplifiedShotOptions,
    isServerPagination: !!(onServerPageChange && serverPage),
    serverPage,
  });

  // Filters hook
  const filtersHook = useMediaGalleryFilters({
    images,
    optimisticDeletedIds: stateHook.state.optimisticDeletedIds,
    currentToolType,
    initialFilterState,
    onServerPageChange,
    serverPage,
    filters,
    onFiltersChange,
    defaultFilters,
  });

  // Check if filters are active for empty state
  const hasFilters = filtersHook.filterByToolType || filtersHook.mediaTypeFilter !== 'all' || !!filtersHook.searchTerm.trim() || filtersHook.showStarredOnly || !filtersHook.toolTypeFilterEnabled;

  // Pagination hook
  const paginationHook = useMediaGalleryPagination({
    filteredImages: filtersHook.filteredImages,
    itemsPerPage: actualItemsPerPage,
    onServerPageChange,
    serverPage,
    offset,
    totalCount,
    enableAdjacentPagePreloading,
    isMobile,
    galleryTopRef: stateHook.galleryTopRef,
  });

  const withPaginationReset = useCallback(<T,>(fn: () => T): T => {
    const result = fn();
    paginationHook.goToFirstPage();
    if (paginationHook.isServerPagination) {
      paginationHook.startNavigation();
    }
    return result;
  }, [paginationHook]);

  // Handle page bounds exceeded (e.g., deleted all items on last page)
  const handlePageBoundsExceeded = useCallback((newLastPage: number) => {
    if (onServerPageChange) {
      onServerPageChange(newLastPage);
    }
  }, [onServerPageChange]);

  // Actions hook
  const actionsHook = useMediaGalleryActions({
    onDelete,
    onApplySettings,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onToggleStar,
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    setActiveLightboxMedia: stateHook.setActiveLightboxMedia,
    setAutoEnterEditMode: stateHook.setAutoEnterEditMode,
    markOptimisticDeleted: stateHook.markOptimisticDeleted,
    markOptimisticDeletedWithBackfill: stateHook.markOptimisticDeletedWithBackfill,
    removeOptimisticDeleted: stateHook.removeOptimisticDeleted,
    setDownloadingImageId: stateHook.setDownloadingImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    mainTickTimeoutRef: stateHook.mainTickTimeoutRef,
    secondaryTickTimeoutRef: stateHook.secondaryTickTimeoutRef,
    onBackfillRequest,
    serverPage,
    itemsPerPage: actualItemsPerPage,
    isServerPagination: paginationHook.isServerPagination,
    setIsBackfillLoading: stateHook.setIsBackfillLoading,
    filteredImages: filtersHook.filteredImages,
    setIsDownloadingStarred: stateHook.setIsDownloadingStarred,
    setSelectedShotIdLocal: stateHook.setSelectedShotIdLocal,
    // New props for robust backfill
    totalCount,
    optimisticDeletedCount: stateHook.state.optimisticDeletedIds.size,
    onPageBoundsExceeded: handlePageBoundsExceeded,
  });

  const shotAdditionSelection = useShotAdditionSelectionOptional();
  useEffect(() => {
    const selectedShotId = shotAdditionSelection?.selectedShotId;
    if (!selectedShotId) {
      return;
    }
    actionsHook.handleShotChange(selectedShotId);
    shotAdditionSelection.clearSelectedShotForAddition();
  }, [actionsHook.handleShotChange, shotAdditionSelection]);

  // Task details functionality using shared hook
  const lightboxImageId = getGenerationId(stateHook.state.activeLightboxMedia);
  const {
    taskDetailsData,
    taskMapping: lightboxTaskMapping,
    task,
    taskError,
  } = useTaskDetails({
    generationId: lightboxImageId,
    projectId: selectedProjectId ?? null,
    onClose: actionsHook.handleCloseLightbox,
  });
  const inputImages = taskDetailsData?.inputImages || [];

  // Background thumbnail generation for videos without thumbnails
  useBackgroundThumbnailGenerator({
    videos: paginationHook.paginatedImages || [],
    projectId: selectedProjectId,
    enabled: !!selectedProjectId && (paginationHook.paginatedImages?.length || 0) > 0,
  });

  // Lazy-load variant badge data (derivedCount, hasUnviewedVariants, unviewedVariantCount)
  // This allows images to display immediately while badge data loads in background
  const paginatedGenerationIds = useMemo(() =>
    (paginationHook.paginatedImages || []).map(img =>
      getGenerationId(img)
    ).filter((id): id is string => typeof id === 'string' && id.length > 0),
    [paginationHook.paginatedImages]
  );
  const { getBadgeData, isLoading: isBadgeDataLoading } = useVariantBadges(paginatedGenerationIds);

  // Merge badge data with paginated images (only when badge data is loaded)
  const paginatedImagesWithBadges = useMemo(() => {
    if (!paginationHook.paginatedImages) return [];
    return paginationHook.paginatedImages.map(img => {
      // Don't merge badge data while loading - prevents showing "0" badges
      // Strip out any existing derivedCount to prevent flash of "0"
      if (isBadgeDataLoading) {
        const { derivedCount, hasUnviewedVariants, unviewedVariantCount, ...imgWithoutBadges } = img;
        return imgWithoutBadges;
      }
      const generationId = getGenerationId(img);
      const badgeData = generationId
        ? getBadgeData(generationId)
        : { derivedCount: 0, hasUnviewedVariants: false, unviewedVariantCount: 0 };
      return {
        ...img,
        derivedCount: badgeData.derivedCount,
        hasUnviewedVariants: badgeData.hasUnviewedVariants,
        unviewedVariantCount: badgeData.unviewedVariantCount,
      };
    });
  }, [paginationHook.paginatedImages, getBadgeData, isBadgeDataLoading]);

  // Calculate effective page for progressive loading
  const effectivePage = paginationHook.isServerPagination
    ? Math.max(0, (serverPage ?? 1) - 1)
    : paginationHook.page;

  // Lightbox navigation (next/previous/go-to-index with cross-page support)
  const {
    handleNextImage,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    pendingTargetSetTimeRef,
  } = useLightboxNavigation({
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage,
    totalPages: paginationHook.totalPages,
    onServerPageChange,
    handleOpenLightbox: actionsHook.handleOpenLightbox,
    setPendingLightboxTarget: stateHook.setPendingLightboxTarget,
  });

  // Track filteredImages changes for debugging cross-page navigation
  const prevFilteredImagesRef = useRef<string>('');

  // Handle opening lightbox after page navigation
  useEffect(() => {
    const currentSignature = `${filtersHook.filteredImages.length}-${filtersHook.filteredImages[0]?.id?.substring(0,8) ?? 'none'}-${filtersHook.filteredImages[filtersHook.filteredImages.length-1]?.id?.substring(0,8) ?? 'none'}`;

    prevFilteredImagesRef.current = currentSignature;

    if (stateHook.state.pendingLightboxTarget && filtersHook.filteredImages.length > 0) {
      const targetIndex = stateHook.state.pendingLightboxTarget === 'first' ? 0 : filtersHook.filteredImages.length - 1;
      const targetImage = filtersHook.filteredImages[targetIndex];

      if (targetImage) {
        actionsHook.handleOpenLightbox(targetImage);
        stateHook.setPendingLightboxTarget(null);
        pendingTargetSetTimeRef.current = null;
      }
    }
  }, [actionsHook, filtersHook.filteredImages, pendingTargetSetTimeRef, serverPage, stateHook]);

  const { galleryHandlers, mobileInteractions } = useMediaGalleryInteractionController({
    handlers: {
      allShots,
      simplifiedShotOptions,
      navigateToShot,
      closeLightbox: actionsHook.handleCloseLightbox,
      formAssociatedShotId,
      onSwitchToAssociatedShot,
      setShotFilter: filtersHook.setShotFilter,
      activeLightboxMedia: stateHook.state.activeLightboxMedia,
      setSelectedImageForDetails: stateHook.setSelectedImageForDetails,
      setShowTaskDetailsModal: stateHook.setShowTaskDetailsModal,
      setActiveLightboxMedia: stateHook.setActiveLightboxMedia,
    },
    mobile: {
      isMobile,
      setMobileActiveImageId: stateHook.setMobileActiveImageId,
      mobilePopoverOpenImageId: stateHook.state.mobilePopoverOpenImageId,
      setMobilePopoverOpenImageId: stateHook.setMobilePopoverOpenImageId,
      onOpenLightbox: actionsHook.handleOpenLightbox,
    },
  });

  const {
    handleNavigateToShot,
    handleVisitShotFromNotifier,
    handleSwitchToAssociatedShot,
    handleShowAllShots,
    handleShowTaskDetails,
  } = galleryHandlers;

  const itemShotWorkflow = useMemo<ItemShotWorkflow>(() => ({
    selectedShotIdLocal: stateHook.state.selectedShotIdLocal,
    simplifiedShotOptions,
    setSelectedShotIdLocal: stateHook.setSelectedShotIdLocal,
    setLastAffectedShotId: actionsHook.handleShotChange,
    showTickForImageId: stateHook.state.showTickForImageId,
    onShowTick: actionsHook.handleShowTick,
    showTickForSecondaryImageId: stateHook.state.showTickForSecondaryImageId,
    onShowSecondaryTick: actionsHook.handleShowSecondaryTick,
    optimisticUnpositionedIds: stateHook.state.optimisticUnpositionedIds,
    optimisticPositionedIds: stateHook.state.optimisticPositionedIds,
    optimisticDeletedIds: stateHook.state.optimisticDeletedIds,
    onOptimisticUnpositioned: stateHook.markOptimisticUnpositioned,
    onOptimisticPositioned: stateHook.markOptimisticPositioned,
    addingToShotImageId: stateHook.state.addingToShotImageId,
    setAddingToShotImageId: stateHook.setAddingToShotImageId,
    addingToShotWithoutPositionImageId: stateHook.state.addingToShotWithoutPositionImageId,
    setAddingToShotWithoutPositionImageId: stateHook.setAddingToShotWithoutPositionImageId,
    currentViewingShotId,
    onCreateShot,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
  }), [
    actionsHook.handleShotChange,
    actionsHook.handleShowSecondaryTick,
    actionsHook.handleShowTick,
    currentViewingShotId,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onCreateShot,
    simplifiedShotOptions,
    stateHook.markOptimisticPositioned,
    stateHook.markOptimisticUnpositioned,
    stateHook.setAddingToShotImageId,
    stateHook.setAddingToShotWithoutPositionImageId,
    stateHook.setSelectedShotIdLocal,
    stateHook.state.addingToShotImageId,
    stateHook.state.addingToShotWithoutPositionImageId,
    stateHook.state.optimisticDeletedIds,
    stateHook.state.optimisticPositionedIds,
    stateHook.state.optimisticUnpositionedIds,
    stateHook.state.selectedShotIdLocal,
    stateHook.state.showTickForImageId,
    stateHook.state.showTickForSecondaryImageId,
  ]);

  const itemMobileInteraction = useMemo<Omit<ItemMobileInteraction, 'isMobile'>>(() => ({
    mobileActiveImageId: stateHook.state.mobileActiveImageId,
    mobilePopoverOpenImageId: stateHook.state.mobilePopoverOpenImageId,
    onMobileTap: mobileInteractions.handleMobileTap,
    setMobilePopoverOpenImageId: stateHook.setMobilePopoverOpenImageId,
  }), [
    mobileInteractions.handleMobileTap,
    stateHook.setMobilePopoverOpenImageId,
    stateHook.state.mobileActiveImageId,
    stateHook.state.mobilePopoverOpenImageId,
  ]);

  const itemFeatures = useMemo<ItemFeatures>(() => ({
    showDelete,
    showDownload,
    showShare,
    showEdit,
    showStar,
    showAddToShot,
    enableSingleClick,
    videosAsThumbnails,
  }), [
    enableSingleClick,
    showAddToShot,
    showDelete,
    showDownload,
    showEdit,
    showShare,
    showStar,
    videosAsThumbnails,
  ]);

  const itemActions = useMemo<ItemActions>(() => ({
    onOpenLightbox: actionsHook.handleOpenLightbox,
    onDelete: actionsHook.handleOptimisticDelete,
    onApplySettings,
    onDownloadImage: actionsHook.handleDownloadImage,
    onToggleStar,
    onImageClick,
    toggleStarMutation,
  }), [
    actionsHook.handleDownloadImage,
    actionsHook.handleOpenLightbox,
    actionsHook.handleOptimisticDelete,
    onApplySettings,
    onImageClick,
    onToggleStar,
    toggleStarMutation,
  ]);

  const itemLoading = useMemo<Omit<ItemLoading, 'shouldLoad' | 'isPriority' | 'isGalleryLoading'>>(() => ({
    isDeleting,
    downloadingImageId: stateHook.state.downloadingImageId,
  }), [isDeleting, stateHook.state.downloadingImageId]);

  return (
    <TooltipProvider>
      <div
        ref={galleryContainerRef as React.RefObject<HTMLDivElement>}
        className={cn(
          'space-y-6',
          // Add bottom padding: mobile gets extra padding for fixed bottom bar, desktop uses existing logic
          isMobile && !hidePagination ? 'pb-16' : (reducedSpacing ? 'pb-0' : ((!hidePagination && !hideBottomPagination) ? 'pb-[62px]' : 'pb-0')),
          className
        )}
      >
        {/* Header section with pagination and filters */}
        <div ref={stateHook.galleryTopRef}>
          <MediaGalleryHeader
            // Pagination props
            totalPages={paginationHook.totalPages}
            page={paginationHook.page}
            isServerPagination={paginationHook.isServerPagination}
            serverPage={serverPage}
            rangeStart={paginationHook.rangeStart}
            rangeEnd={paginationHook.rangeEnd}
            totalFilteredItems={paginationHook.totalFilteredItems}
            loadingButton={paginationHook.loadingButton}
            darkSurface={darkSurface}
            reducedSpacing={reducedSpacing}
            hidePagination={hidePagination}
            onPageChange={paginationHook.handlePageChange}
            isPhoneOnly={isPhoneOnly}

            // Filter props
            hideTopFilters={hideTopFilters}
            hideMediaTypeFilter={hideMediaTypeFilter}
            showStarredOnly={filtersHook.showStarredOnly}
            onStarredFilterChange={(val) => withPaginationReset(() => filtersHook.setShowStarredOnly(Boolean(val)))}

            // Shot filter props
            showShotFilter={showShotFilter}
            allShots={simplifiedShotOptions}
            shotFilter={filtersHook.shotFilter}
            onShotFilterChange={(shotId) => withPaginationReset(() => filtersHook.setShotFilter(shotId))}
            excludePositioned={filtersHook.excludePositioned}
            onExcludePositionedChange={(v) => withPaginationReset(() => filtersHook.setExcludePositioned(v))}

            // Search props
            showSearch={showSearch}
            isSearchOpen={filtersHook.isSearchOpen}
            searchTerm={filtersHook.searchTerm}
            searchInputRef={filtersHook.searchInputRef}
            toggleSearch={filtersHook.toggleSearch}
            clearSearch={filtersHook.clearSearch}
            handleSearchChange={(value) => withPaginationReset(() => filtersHook.setSearchTerm(value))}

            // Media type filter props
            mediaTypeFilter={filtersHook.mediaTypeFilter}
            onMediaTypeFilterChange={(value) => withPaginationReset(() => filtersHook.setMediaTypeFilter(value))}
          />
        </div>

        {/* Shot Filter Notifier */}
        {!hideShotNotifier && (
          <ShotNotifier
            formAssociatedShotId={formAssociatedShotId}
            shotFilter={filtersHook.shotFilter}
            showShotFilter={showShotFilter}
            allShots={simplifiedShotOptions}
            onSwitchToAssociatedShot={handleSwitchToAssociatedShot}
            onShowAllShots={handleShowAllShots}
            onVisitShot={handleVisitShotFromNotifier}
          />
        )}

        {/* Main Gallery Grid */}
        <MediaGalleryGrid
          // Data props
          images={images}
          paginatedImages={paginatedImagesWithBadges}
          filteredImages={filtersHook.filteredImages}

          // Layout props
          reducedSpacing={reducedSpacing}
          darkSurface={darkSurface}
          gridColumnClasses={gridColumnClasses}
          columnsPerRow={effectiveColumnsPerRow}
          projectAspectRatio={projectAspectRatio}

          // Loading props
          isGalleryLoading={paginationHook.isGalleryLoading}
          isServerPagination={paginationHook.isServerPagination}

          // Navigation completion - the SINGLE way to clear loading state
          clearNavigation={paginationHook.clearNavigation}
          
          // Progressive loading props
          effectivePage={effectivePage}
          isMobile={isMobile}
          
          // Lightbox state
          isLightboxOpen={!!stateHook.state.activeLightboxMedia}
          
          // Preloading props
          enableAdjacentPagePreloading={enableAdjacentPagePreloading}
          page={paginationHook.page}
          serverPage={serverPage}
          totalFilteredItems={paginationHook.totalFilteredItems}
          itemsPerPage={actualItemsPerPage}
          selectedProjectId={selectedProjectId ?? undefined}
          generationFilters={generationFilters}
          
          // Filter state for empty states
          hasFilters={hasFilters}

          // Backfill state
          isBackfillLoading={stateHook.state.isBackfillLoading}
          setIsBackfillLoading={stateHook.setIsBackfillLoading}

          // Props for computing skeleton count dynamically
          totalCount={totalCount}
          offset={offset}
          optimisticDeletedCount={stateHook.state.optimisticDeletedIds.size}
          
          // MediaGalleryItem grouped props
          itemShotWorkflow={itemShotWorkflow}
          itemMobileInteraction={itemMobileInteraction}
          itemFeatures={itemFeatures}
          itemActions={itemActions}
          itemLoading={itemLoading}
          hideBottomPagination={hideBottomPagination}
        />
      </div>

      {/* Lightbox and Task Details */}
      <MediaGalleryLightbox
        core={{
          activeLightboxMedia: stateHook.state.activeLightboxMedia,
          autoEnterEditMode: stateHook.state.autoEnterEditMode,
          onClose: actionsHook.handleCloseLightbox,
        }}
        navigation={{
          filteredImages: filtersHook.filteredImages,
          isServerPagination: paginationHook.isServerPagination,
          serverPage,
          totalPages: paginationHook.totalPages,
          onServerPageChange,
          onNext: handleNextImage,
          onPrevious: handlePreviousImage,
        }}
        actions={{
          onDelete: showDelete ? actionsHook.handleOptimisticDelete : undefined,
          isDeleting,
          onApplySettings,
        }}
        shotWorkflow={{
          simplifiedShotOptions,
          selectedShotIdLocal: stateHook.state.selectedShotIdLocal,
          onShotChange: actionsHook.handleShotChange,
          onAddToShot: onAddToLastShot,
          onAddToShotWithoutPosition: onAddToLastShotWithoutPosition,
        }}
        ui={{
          showTickForImageId: stateHook.state.showTickForImageId,
          setShowTickForImageId: stateHook.setShowTickForImageId,
          showTickForSecondaryImageId: stateHook.state.showTickForSecondaryImageId,
          setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
        }}
        optimistic={{
          optimisticPositionedIds: stateHook.state.optimisticPositionedIds,
          optimisticUnpositionedIds: stateHook.state.optimisticUnpositionedIds,
          onOptimisticPositioned: stateHook.markOptimisticPositioned,
          onOptimisticUnpositioned: stateHook.markOptimisticUnpositioned,
        }}
        taskModal={{
          isMobile,
          showTaskDetailsModal: stateHook.state.showTaskDetailsModal,
          setShowTaskDetailsModal: stateHook.setShowTaskDetailsModal,
          selectedImageForDetails: stateHook.state.selectedImageForDetails,
          setSelectedImageForDetails: stateHook.setSelectedImageForDetails,
          onShowTaskDetails: handleShowTaskDetails,
        }}
        taskData={{
          task,
          isLoadingTask: taskDetailsData?.isLoading ?? false,
          taskError,
          inputImages,
          lightboxTaskMapping,
        }}
        integration={{
          onCreateShot,
          onNavigateToShot: handleNavigateToShot,
          toolTypeOverride: currentToolType,
          setActiveLightboxIndex: handleSetActiveLightboxIndex,
        }}
      />

      {/* Mobile floating bottom bar with pagination and star filter - phones only, not iPad */}
      {isPhoneOnly && !hidePagination && !stateHook.state.activeLightboxMedia && paginationHook.totalPages > 1 && (
        <MobileBottomBar
          isServerPagination={paginationHook.isServerPagination}
          serverPage={serverPage}
          page={paginationHook.page}
          totalPages={paginationHook.totalPages}
          loadingButton={paginationHook.loadingButton}
          onPageChange={paginationHook.handlePageChange}
          hideTopFilters={hideTopFilters}
          showStarredOnly={filtersHook.showStarredOnly}
          onToggleStarred={() => withPaginationReset(() => filtersHook.setShowStarredOnly(!filtersHook.showStarredOnly))}
        />
      )}
    </TooltipProvider>
  );
});

// Add display name for debugging
MediaGallery.displayName = 'MediaGallery';

export { MediaGallery };
export default MediaGallery;
