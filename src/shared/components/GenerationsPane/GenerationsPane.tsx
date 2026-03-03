import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRenderLogger } from '@/shared/lib/debug/debugRendering';
import { useSlidingPane } from '@/shared/hooks/useSlidingPane';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useQueryClient } from '@tanstack/react-query';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { Sparkles, ExternalLink } from 'lucide-react';
import { ImageGenerationModal } from '@/shared/components/ImageGenerationModal';
import { DeleteGenerationConfirmDialog } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';
import { useNavigate, useLocation } from 'react-router-dom';
import { TOOL_ROUTES } from '@/shared/lib/toolRoutes';
import { type GalleryFilterState } from '@/shared/components/MediaGallery';
import { useContainerWidth } from '@/shared/components/MediaGallery/hooks';
import { calculateGalleryLayout } from '@/shared/components/MediaGallery/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import PaneControlTab from '../PaneControlTab';
import { useGalleryPageState } from '@/features/gallery/hooks/useGalleryPageState';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShots } from '@/shared/contexts/ShotsContext';
import {
  useProjectCrudContext,
  useProjectSelectionContext,
} from '@/shared/contexts/ProjectContext';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { useStableObject } from '@/shared/hooks/useStableObject';
import { usePaneInteractionLifecycle } from '@/shared/components/panes/usePaneInteractionLifecycle';
import { SHOT_FILTER, isSpecialFilter } from '@/shared/constants/filterConstants';
import { useAppEventListener } from '@/shared/lib/typedEvents';
import { GenerationsPaneControls } from './components/GenerationsPaneControls';
import { GenerationsPaneGallery } from './components/GenerationsPaneGallery';

// Fallback rows for pane (smaller than full page galleries)
const PANE_ROWS = 2;

const GenerationsPaneComponent: React.FC = () => {
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
  
  // Check if we're on the image generation tool page
  const isOnImageGenerationPage = location.pathname === TOOL_ROUTES.IMAGE_GENERATION;

  // Get current project's aspect ratio
  const { selectedProjectId } = useProjectSelectionContext();
  const { projects } = useProjectCrudContext();
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  const shouldEnableDataLoading = isGenerationsPaneOpen;

  const isMobile = useIsMobile();

  // Measure gallery container width for calculating correct items per page
  const [galleryContainerRef, containerWidth] = useContainerWidth();

  // Calculate items per page based on actual container width
  // Pane uses fewer rows (PANE_ROWS=3) than full galleries (9 rows)
  const paneLayout = useMemo(() => {
    const layout = calculateGalleryLayout(projectAspectRatio, isMobile, containerWidth, undefined, true);
    // Override rows for the pane (3 rows instead of 9)
    return {
      ...layout,
      itemsPerPage: layout.columns * PANE_ROWS
    };
  }, [projectAspectRatio, isMobile, containerWidth]);

  const GENERATIONS_PER_PAGE = paneLayout.itemsPerPage;
  const { currentShotId } = useCurrentShot();

  // Media type filter state
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video'>('image');
  
  // Dropdown states to prevent unwanted opening
  const [shotFilterOpen, setShotFilterOpen] = useState(false);
  const [mediaTypeFilterOpen, setMediaTypeFilterOpen] = useState(false);
  
  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Image generation modal state
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);

  // Listen for custom events from product tour to open/close modal
  const handleOpenModal = useCallback(() => setIsGenerationModalOpen(true), []);
  const handleCloseModal = useCallback(() => setIsGenerationModalOpen(false), []);
  useAppEventListener('openGenerationModal', handleOpenModal);
  useAppEventListener('closeGenerationModal', handleCloseModal);

  // Use the generalized logic - data loading now enabled on all pages
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
    expectedItemCount, // Pre-computed count for instant skeleton display
    confirmDialogProps,
  } = useGalleryPageState({
    itemsPerPage: GENERATIONS_PER_PAGE,
    mediaType: mediaTypeFilter,
    enableDataLoading: shouldEnableDataLoading
  });

  // Fallback: use shots from shared context when local hook hasn't loaded yet
  const { shots: contextShots } = useShots();
  const shotsForFilter = (shotsData && shotsData.length > 0)
    ? shotsData
    : (contextShots || []);
  
  // Unified shot creation hook
  const { createShot } = useShotCreation();
  
  // Handle creating a new shot from lightbox
  const handleCreateShot = useCallback(async (shotName: string, files: File[]): Promise<void> => {
    // Use unified shot creation - handles inheritance, events, lastAffected automatically
    const result = await createShot({
      name: shotName,
      files: files.length > 0 ? files : undefined,
      // Disable skeleton events for empty shot creation from lightbox
      dispatchSkeletonEvents: files.length > 0,
      onSuccess: () => {
        // Invalidate and refetch shots to update the list
        if (selectedProjectId) {
          void queryClient.invalidateQueries({ queryKey: [...shotQueryKeys.all, selectedProjectId] });
        }
      },
    });

    if (!result) {
      // Error already shown by useShotCreation
      return;
    }

  }, [createShot, queryClient, selectedProjectId]);

  // Log every render with item count & page for loop detection
  useRenderLogger('GenerationsPane', { page, totalItems: totalCount });

  // Stable filters object for preloading (prevents recreating on every render)
  const generationFilters = useStableObject(() => ({
    mediaType: mediaTypeFilter,
    shotId: selectedShotFilter === SHOT_FILTER.ALL ? undefined : selectedShotFilter,
    excludePositioned: selectedShotFilter !== SHOT_FILTER.ALL ? excludePositioned : undefined,
    starredOnly
  }), [mediaTypeFilter, selectedShotFilter, excludePositioned, starredOnly]);

  // Consolidated gallery filter state for MediaGallery controlled mode
  const galleryFilters = useMemo((): GalleryFilterState => ({
    mediaType: mediaTypeFilter,
    shotFilter: selectedShotFilter,
    excludePositioned,
    searchTerm,
    starredOnly,
    toolTypeFilter: false, // GenerationsPane doesn't use tool type toggle
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

  const { isLocked, isOpen, toggleLock, openPane, paneProps, transformClass, handlePaneEnter, handlePaneLeave, showBackdrop, closePane } = useSlidingPane({
    side: 'bottom',
    isLocked: isGenerationsPaneLocked,
    onToggleLock: () => setIsGenerationsPaneLocked(!isGenerationsPaneLocked),
    additionalRefs: [shotFilterContentRef, mediaTypeContentRef],
  });
  const paneIsOpen = Boolean(isOpen);

  const { isPointerEventsEnabled, isInteractionDisabled } = usePaneInteractionLifecycle({
    isOpen: paneIsOpen,
    disableInteractionsDuringOpen: true,
    onOpenStart: () => {
      setShotFilterOpen(false);
      setMediaTypeFilterOpen(false);
    },
  });

  // Listen for custom event to open the pane (used on mobile from other components)
  const handleOpenGenerationsPane = useCallback(() => {
    openPane();
  }, [openPane]);

  useAppEventListener('openGenerationsPane', handleOpenGenerationsPane);

  // Sync open state with context so Layout can access it
  useEffect(() => {
    setIsGenerationsPaneOpen(paneIsOpen);
  }, [paneIsOpen, setIsGenerationsPaneOpen]);

  // Close the pane when navigating to generations page or image generation tool page
  useEffect(() => {
    if ((isOnImageGenerationPage) && (paneIsOpen || isLocked)) {
      setIsGenerationsPaneLocked(false);
    }
  }, [isOnImageGenerationPage, paneIsOpen, isLocked, setIsGenerationsPaneLocked]);

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile (only when open but NOT locked) */}
      {/* When locked, GenerationsPane allows interaction with outside content */}
      {showBackdrop && (
        <div
          className="fixed inset-0 z-[99] touch-none"
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closePane();
          }}
          aria-hidden="true"
        />
      )}
      {/* Hide the control tab when on the generations page or image generation tool page */}
      {!isOnImageGenerationPage && (
          <PaneControlTab
            side="bottom"
            isLocked={isLocked}
            isOpen={paneIsOpen}
          toggleLock={toggleLock}
          openPane={openPane}
          paneDimension={generationsPaneHeight}
          /* Centre within visible width taking into account any locked side panes */
          horizontalOffset={
            (isShotsPaneLocked ? shotsPaneWidth : 0) - (isTasksPaneLocked ? tasksPaneWidth : 0)
          }
          handlePaneEnter={handlePaneEnter}
          handlePaneLeave={handlePaneLeave}
          thirdButton={{
            onClick: () => {
              setIsGenerationsPaneLocked(false);
              navigate(TOOL_ROUTES.IMAGE_GENERATION);
            },
            ariaLabel: "Go to Image Generation tool",
            tooltip: "Go to Image Generation tool",
            content: <ExternalLink className="h-4 w-4" />
          }}
          fourthButton={{
            onClick: () => setIsGenerationModalOpen(true),
            ariaLabel: "Generate new image",
            tooltip: "Generate new image",
            content: <Sparkles className="h-4 w-4" />
          }}
          customIcon={<Sparkles className="h-4 w-4" />}
          paneTooltip="Generate new image"
          allowMobileLock={true}
          customOpenAction={() => setIsGenerationModalOpen(true)}
          dataTour="generations-pane-tab"
          dataTourLock="generations-lock"
          dataTourFourthButton="generations-sparkles"
        />
      )}
      <div
        {...paneProps}
        data-testid="generations-pane"
        style={{
          height: `${generationsPaneHeight}px`,
          left: isShotsPaneLocked ? `${shotsPaneWidth}px` : 0,
          right: isTasksPaneLocked ? `${tasksPaneWidth}px` : 0,
        }}
        className={cn(
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl z-[100] transform transition-all duration-300 ease-smooth flex flex-col pointer-events-auto`,
          transformClass
        )}
      >
        {/* Inner wrapper with delayed pointer events to prevent tap bleed-through */}
        <div 
          className={cn(
            'flex flex-col h-full',
            isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        >
          <GenerationsPaneControls
            filters={{
              shots: shotsForFilter,
              selectedShotFilter,
              onSelectedShotFilterChange: setSelectedShotFilter,
              excludePositioned,
              onExcludePositionedChange: setExcludePositioned,
              isMobile,
              shotFilterContentRef,
              mediaTypeFilterContentRef: mediaTypeContentRef,
              shotFilterOpen,
              onShotFilterOpenChange: setShotFilterOpen,
              mediaTypeFilter,
              onMediaTypeFilterChange: setMediaTypeFilter,
              mediaTypeFilterOpen,
              onMediaTypeFilterOpenChange: setMediaTypeFilterOpen,
              searchTerm,
              onSearchTermChange: setSearchTerm,
              isSearchOpen,
              onSearchOpenChange: setIsSearchOpen,
              searchInputRef,
              starredOnly,
              onStarredOnlyChange: setStarredOnly,
              currentShotId,
              isSpecialFilterSelected: isSpecialFilter(selectedShotFilter),
            }}
            pagination={{
              totalCount,
              perPage: GENERATIONS_PER_PAGE,
              page,
              onPageChange: handleServerPageChange,
            }}
            interaction={{ isInteractionDisabled }}
          />

          <GenerationsPaneGallery
            containerRef={galleryContainerRef}
            projectAspectRatio={projectAspectRatio}
            layout={{
              columns: paneLayout.columns,
              itemsPerPage: paneLayout.itemsPerPage,
            }}
            loading={{
              isLoading,
              expectedItemCount,
            }}
            pagination={{ page, totalCount }}
            error={error}
            gallery={{
              items: paginatedData.items,
              onDelete: handleDeleteGeneration,
              onToggleStar: handleToggleStar,
              isDeleting,
              allShots: shotsData || [],
              lastShotId: lastAffectedShotId || undefined,
              filters: galleryFilters,
              onFiltersChange: handleGalleryFiltersChange,
              onAddToShot: handleAddToShot,
              onAddToShotWithoutPosition: handleAddToShotWithoutPosition,
              onServerPageChange: handleServerPageChange,
              generationFilters,
              currentViewingShotId: currentShotId || undefined,
              onCreateShot: handleCreateShot,
            }}
          />
        </div> {/* Close inner wrapper with delayed pointer events */}
      </div>
      
      {/* Image Generation Modal */}
      <ImageGenerationModal
        isOpen={isGenerationModalOpen}
        onClose={() => setIsGenerationModalOpen(false)}
        initialShotId={currentShotId}
      />

      {/* Delete generation confirmation dialog */}
      <DeleteGenerationConfirmDialog {...confirmDialogProps} />
    </>
  );
};

// Memoize GenerationsPane - it has no props so a simple memo is sufficient
export const GenerationsPane = React.memo(GenerationsPaneComponent);
