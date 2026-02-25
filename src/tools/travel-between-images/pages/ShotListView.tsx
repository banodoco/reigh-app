import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Shot } from '@/domains/generation/types';
import { Button } from '@/shared/components/ui/button';
import CreateShotModal from '@/shared/components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useShotCreation } from '@/shared/hooks/useShotCreation';
import { useHandleExternalImageDrop, useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/shots';
import { useProjectGenerations } from '@/shared/hooks/useProjectGenerations';
import type { GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { useDeleteGenerationWithConfirm } from '@/domains/generation/hooks/useDeleteGenerationWithConfirm';
import { DeleteGenerationConfirmDialog } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { useStableObject } from '@/shared/hooks/useStableObject';
import {
  useVideoTravelViewMode,
  useVideoTravelDropHandlers,
  useVideoTravelAddToShot,
  useVideoLayoutConfig,
} from '../hooks';
import { VideoTravelListHeader } from '../components/VideoTravelListHeader';
import { VideoTravelVideosGallery } from '../components/VideoTravelVideosGallery';

interface ShotListViewProps {
  /** Array of shots */
  shots: Shot[] | undefined;
  /** Selected project ID */
  selectedProjectId: string;
  /** Project aspect ratio */
  projectAspectRatio: string | undefined;
  /** Refetch shots callback */
  refetchShots: () => void;
  /** Project UI settings */
  projectUISettings: { shotSortMode?: 'ordered' | 'newest' | 'oldest' } | undefined;
  /** Update project UI settings */
  updateProjectUISettings: ((scope: 'project', settings: { shotSortMode?: 'ordered' | 'newest' | 'oldest' }) => void) | undefined;
  /** Upload settings */
  uploadSettings: { cropToProjectSize?: boolean } | undefined;
  /** Current shot sort mode (lifted to parent) */
  shotSortMode: 'ordered' | 'newest' | 'oldest';
  /** Set shot sort mode */
  setShotSortMode: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

/**
 * Shot list view - displays the list of shots or videos gallery.
 * Handles search, filters, create modal, and drop interactions.
 */
export function ShotListView({
  shots,
  selectedProjectId,
  projectAspectRatio,
  refetchShots,
  uploadSettings,
  shotSortMode,
  setShotSortMode,
}: ShotListViewProps) {
  const isMobile = useIsMobile();

  // Video layout configuration
  const { columns: videoColumnsPerRow, itemsPerPage } = useVideoLayoutConfig({
    projectAspectRatio,
    isMobile,
  });

  // Mutations
  const { createShot } = useShotCreation();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const { requestDelete: requestDeleteGeneration, confirmDialogProps, isPending: isDeletePending } = useDeleteGenerationWithConfirm();

  // Navigation
  const { navigateToShot } = useShotNavigation();

  // Modal state
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);

  // Skeleton setup for instant modal close
  const skeletonSetupRef = useRef<((imageCount: number) => void) | null>(null);
  const skeletonClearRef = useRef<(() => void) | null>(null);
  const handleSkeletonSetupReady = useCallback((setup: (imageCount: number) => void, clear: () => void) => {
    skeletonSetupRef.current = setup;
    skeletonClearRef.current = clear;
  }, []);

  // View mode and filters
  const {
    showVideosView,
    setShowVideosViewRaw,
    setViewMode,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
    videoFilters,
    setVideoFilters,
    videoPage,
    setVideoPage,
    videoSortMode,
    setVideoSortMode,
    shotSearchQuery,
    setShotSearchQuery,
    clearSearch,
    isSearchOpen,
    setIsSearchOpen,
    handleSearchToggle,
    searchInputRef,
  } = useVideoTravelViewMode({
    selectedProjectId,
    initialShotSortMode: shotSortMode,
  });

  // Filter shots based on search query
  const filteredShots = useMemo(() => {
    if (!shots || !shotSearchQuery.trim()) {
      return shots;
    }

    const query = shotSearchQuery.toLowerCase().trim();

    // First, try to match shot names
    const nameMatches = shots.filter(shot =>
      shot.name.toLowerCase().includes(query)
    );

    // If no shot name matches, search through generation parameters
    if (nameMatches.length === 0) {
      return shots.filter(shot => {
        return shot.images?.some(image => {
          if (image.metadata) {
            const metadataStr = JSON.stringify(image.metadata).toLowerCase();
            if (metadataStr.includes(query)) return true;
          }
          if (image.params) {
            const paramsStr = JSON.stringify(image.params).toLowerCase();
            if (paramsStr.includes(query)) return true;
          }
          if (image.type && image.type.toLowerCase().includes(query)) {
            return true;
          }
          if (image.location && image.location.toLowerCase().includes(query)) {
            return true;
          }
          return false;
        });
      });
    }
    return nameMatches;
  }, [shots, shotSearchQuery]);

  // Search state helpers
  const isSearchActive = useMemo(() => shotSearchQuery.trim().length > 0, [shotSearchQuery]);
  const hasNoSearchResults = isSearchActive && ((filteredShots?.length || 0) === 0);

  // Stable filters object for videos query (prevents recreating on every render)
  const videosFilters = useStableObject(() => ({
    toolType: videoFilters.toolTypeFilter ? TOOL_IDS.TRAVEL_BETWEEN_IMAGES : undefined,
    mediaType: videoFilters.mediaType,
    shotId: videoFilters.shotFilter !== 'all' ? videoFilters.shotFilter : undefined,
    excludePositioned: videoFilters.excludePositioned,
    starredOnly: videoFilters.starredOnly,
    searchTerm: videoFilters.searchTerm,
    sort: videoSortMode,
    includeChildren: false
  }), [videoFilters, videoSortMode]);

  // Videos query
  const {
    data: videosData,
    isLoading: videosLoading,
    isFetching: videosFetching,
  } = useProjectGenerations(
    selectedProjectId,
    videoPage,
    itemsPerPage,
    showVideosView,
    videosFilters
  );
  const typedVideosData = videosData as GenerationsPaginatedResponse | undefined;

  // Clear videosViewJustEnabled flag when data loads
  React.useEffect(() => {
    if (showVideosView && videosViewJustEnabled && (videosData as { items?: unknown[] } | undefined)?.items) {
      setVideosViewJustEnabled(false);
    }
  }, [showVideosView, videosViewJustEnabled, videosData, setVideosViewJustEnabled]);

  // Add to shot handlers
  const {
    targetShotInfo,
    handleAddVideoToTargetShot,
    handleAddVideoToTargetShotWithoutPosition,
  } = useVideoTravelAddToShot({
    selectedProjectId,
    shots,
    addImageToShotMutation,
    addImageToShotWithoutPositionMutation,
  });

  // Delete generation handler (with confirmation dialog)
  const handleDeleteGeneration = useCallback(async (id: string) => {
    requestDeleteGeneration(id);
  }, [requestDeleteGeneration]);

  // Drop handlers
  const {
    handleGenerationDropOnShot,
    handleGenerationDropForNewShot,
    handleFilesDropForNewShot,
    handleFilesDropOnShot,
  } = useVideoTravelDropHandlers({
    selectedProjectId,
    shots,
    addImageToShotMutation,
    addImageToShotWithoutPositionMutation,
    handleExternalImageDropMutation,
    refetchShots,
    setShotSortMode,
  });

  // Shot selection handler
  const handleShotSelect = useCallback((shot: Shot) => {
    setShowVideosViewRaw(false);
    navigateToShot(shot, { scrollToTop: false });
  }, [setShowVideosViewRaw, navigateToShot]);

  // Create shot modal handlers
  const handleCreateNewShot = useCallback(() => {
    setIsCreateShotModalOpen(true);
  }, []);

  const handleModalSubmitCreateShot = async (name: string, files: File[], aspectRatio: string | null) => {
    // Show skeleton immediately
    const imageCount = files.length;
    if (skeletonSetupRef.current) {
      skeletonSetupRef.current(imageCount);
    }

    // Switch to "Newest First" so the new shot appears at the top
    setShotSortMode('newest');

    // Run creation in background
    (async () => {
      try {
        const result = await createShot({
          name,
          files: files.length > 0 ? files : undefined,
          aspectRatio: aspectRatio || undefined,
          dispatchSkeletonEvents: false,
          onSuccess: async () => {
            await refetchShots();
          },
        });

        if (!result) {
          if (skeletonClearRef.current) {
            skeletonClearRef.current();
          }
          return;
        }
      } catch (error) {
        normalizeAndPresentError(error, { context: 'ShotListView', toastTitle: 'Failed to create shot' });
        if (skeletonClearRef.current) {
          skeletonClearRef.current();
        }
      }
    })();
  };

  return (
    <>
      {/* Shot List Header */}
      <VideoTravelListHeader
        viewMode={{
          showVideosView,
          setViewMode,
        }}
        search={{
          isMobile,
          isSearchOpen,
          setIsSearchOpen,
          handleSearchToggle,
          searchInputRef,
          shotSearchQuery,
          setShotSearchQuery,
          videoSearchTerm: videoFilters.searchTerm,
          setVideoSearchTerm: (term: string) => {
            setVideoFilters(prev => ({ ...prev, searchTerm: term }));
          },
          setVideoPage,
        }}
        sort={{
          showVideosView,
          shotSortMode,
          setShotSortMode,
          videoSortMode,
          setVideoSortMode,
          setVideoPage,
        }}
      />

      {/* Content Area */}
      {showVideosView ? (
        <VideoTravelVideosGallery
          query={{
            videosData: typedVideosData,
            videosLoading,
            videosFetching,
            selectedProjectId,
            projectAspectRatio,
            itemsPerPage,
            columnsPerRow: videoColumnsPerRow,
            shots,
          }}
          filters={{
            videoFilters,
            setVideoFilters,
            videoPage,
            setVideoPage,
          }}
          preloading={{
            generationFilters: videosFilters,
            enableAdjacentPagePreloading: true,
          }}
          addToShot={{
            targetShotIdForButton: targetShotInfo.targetShotIdForButton,
            targetShotNameForButtonTooltip: targetShotInfo.targetShotNameForButtonTooltip,
            handleAddVideoToTargetShot,
            handleAddVideoToTargetShotWithoutPosition,
          }}
          deletion={{
            onDelete: handleDeleteGeneration,
            isDeleting: isDeletePending,
          }}
          videosViewJustEnabled={videosViewJustEnabled}
        />
      ) : (
        hasNoSearchResults ? (
          <div className="px-4 max-w-7xl mx-auto py-10 text-center text-muted-foreground">
            <p className="mb-4">No shots or parameters match your search.</p>
            <Button variant="outline" size="sm" onClick={clearSearch}>Clear search</Button>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            <ShotListDisplay
              projectId={selectedProjectId}
              onSelectShot={handleShotSelect}
              onCreateNewShot={handleCreateNewShot}
              shots={filteredShots}
              sortMode={shotSortMode}
              onSortModeChange={setShotSortMode}
              onGenerationDropOnShot={handleGenerationDropOnShot}
              onGenerationDropForNewShot={handleGenerationDropForNewShot}
              onFilesDropForNewShot={handleFilesDropForNewShot}
              onFilesDropOnShot={handleFilesDropOnShot}
              onSkeletonSetupReady={handleSkeletonSetupReady}
            />
          </div>
        )
      )}

      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={false}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
        projectAspectRatio={projectAspectRatio}
        initialAspectRatio={null}
        projectId={selectedProjectId}
        cropToProjectSize={uploadSettings?.cropToProjectSize ?? true}
      />

      {/* Delete generation confirmation dialog */}
      <DeleteGenerationConfirmDialog {...confirmDialogProps} />
    </>
  );
}
