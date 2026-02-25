/**
 * Videos Gallery Component for VideoTravelToolPage
 *
 * Renders the videos gallery view with skeleton/loading states.
 * Handles the "should show skeleton" decision and MediaGallery wiring.
 *
 * @see VideoTravelToolPage.tsx - Parent page component
 */

import React, { type Dispatch, type SetStateAction } from 'react';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { MediaGallery, type GalleryFilterState } from '@/shared/components/MediaGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import type { GenerationsPaginatedResponse } from '@/shared/hooks/useProjectGenerations';
import { Shot } from '@/domains/generation/types';

// =============================================================================
// PROP TYPES (grouped for clarity)
// =============================================================================

interface VideosQueryProps {
  videosData: GenerationsPaginatedResponse | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
  selectedProjectId: string | null | undefined;
  projectAspectRatio: string | undefined;
  itemsPerPage: number;
  columnsPerRow?: number;
  shots: Shot[] | undefined;
}

interface VideosFiltersProps {
  videoFilters: GalleryFilterState;
  setVideoFilters: Dispatch<SetStateAction<GalleryFilterState>>;
  videoPage: number;
  setVideoPage: (page: number) => void;
}

interface AddToShotProps {
  targetShotIdForButton: string | null | undefined;
  targetShotNameForButtonTooltip: string;
  handleAddVideoToTargetShot: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  handleAddVideoToTargetShotWithoutPosition: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

interface DeleteProps {
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

interface PreloadingProps {
  enableAdjacentPagePreloading?: boolean;
  /** Filters for automatic preloading */
  generationFilters?: Record<string, unknown>;
}

interface VideoTravelVideosGalleryProps {
  query: VideosQueryProps;
  filters: VideosFiltersProps;
  addToShot: AddToShotProps;
  deletion?: DeleteProps;
  preloading?: PreloadingProps;
  /** Flag to show skeleton during view transition */
  videosViewJustEnabled: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const VideoTravelVideosGallery: React.FC<VideoTravelVideosGalleryProps> = ({
  query,
  filters,
  addToShot,
  deletion,
  preloading,
  videosViewJustEnabled,
}) => {
  const {
    videosData,
    videosLoading,
    videosFetching,
    selectedProjectId,
    projectAspectRatio,
    itemsPerPage,
    columnsPerRow,
    shots,
  } = query;

  const {
    videoFilters,
    setVideoFilters,
    videoPage,
    setVideoPage,
  } = filters;

  const {
    targetShotIdForButton,
    targetShotNameForButtonTooltip,
    handleAddVideoToTargetShot,
    handleAddVideoToTargetShotWithoutPosition,
  } = addToShot;

  // Determine if we should show skeleton
  const hasValidData = videosData?.items && videosData.items.length > 0;
  const isLoadingOrFetching = videosLoading || videosFetching;

  // Show skeleton if:
  // 1. No project selected, OR
  // 2. Currently loading/fetching and no valid data, OR
  // 3. We just switched to videos view (videosViewJustEnabled flag)
  const shouldShowSkeleton = !selectedProjectId || (isLoadingOrFetching && !hasValidData) || videosViewJustEnabled;

  // Use actual count if available, otherwise default to 12
  const skeletonCount = videosData?.total || 12;

  // For videos, use fewer columns than images (hardcoded for now to verify it works)
  const effectiveColumnsPerRow = columnsPerRow ?? 3;

  if (shouldShowSkeleton) {
    return (
      <div className="px-4 max-w-7xl mx-auto">
        <div className="pb-2">
          <SkeletonGallery
            count={skeletonCount}
            columns={SKELETON_COLUMNS[effectiveColumnsPerRow as keyof typeof SKELETON_COLUMNS] || SKELETON_COLUMNS[5]}
            showControls={true}
            projectAspectRatio={projectAspectRatio ?? undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 max-w-7xl mx-auto">
      <div className="pb-2">
        <MediaGallery
          images={videosData?.items || []}
          allShots={shots || []}
          // Add to Shot functionality
          onAddToLastShot={handleAddVideoToTargetShot}
          onAddToLastShotWithoutPosition={handleAddVideoToTargetShotWithoutPosition}
          lastShotId={targetShotIdForButton ?? undefined}
          lastShotNameForTooltip={targetShotNameForButtonTooltip}
          currentToolType={TOOL_IDS.TRAVEL_BETWEEN_IMAGES}
          currentToolTypeName="Travel Between Images"
          // Pagination props
          totalCount={videosData?.total}
          serverPage={videoPage}
          onServerPageChange={(page) => setVideoPage(page)}
          itemsPerPage={itemsPerPage}
          // Consolidated filter props
          filters={videoFilters}
          onFiltersChange={setVideoFilters}
          columnsPerRow={effectiveColumnsPerRow}
          onDelete={deletion?.onDelete}
          isDeleting={deletion?.isDeleting}
          // Preloading props
          generationFilters={preloading?.generationFilters}
          enableAdjacentPagePreloading={preloading?.enableAdjacentPagePreloading ?? true}
          config={{
            showShotFilter: true,
            showShare: false,
          }}
        />
      </div>
    </div>
  );
};
