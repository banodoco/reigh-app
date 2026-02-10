/**
 * Videos Gallery Component for VideoTravelToolPage
 * 
 * Renders the videos gallery view with skeleton/loading states.
 * Handles the "should show skeleton" decision and MediaGallery wiring.
 * 
 * @see VideoTravelToolPage.tsx - Parent page component
 */

import React from 'react';
import { MediaGallery } from '@/shared/components/MediaGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import { GenerationRow, Shot } from '@/types/shots';

// =============================================================================
// PROP TYPES (grouped for clarity)
// =============================================================================

interface VideosQueryProps {
  videosData: { items: GenerationRow[]; total: number } | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
  selectedProjectId: string | null | undefined;
  projectAspectRatio: string | null | undefined;
  itemsPerPage: number;
  columnsPerRow?: number;
  shots: Shot[] | undefined;
}

interface VideosFiltersProps {
  videoPage: number;
  setVideoPage: (page: number) => void;
  videoShotFilter: string;
  setVideoShotFilter: (filter: string) => void;
  videoExcludePositioned: boolean;
  setVideoExcludePositioned: (exclude: boolean) => void;
  videoSearchTerm: string;
  setVideoSearchTerm: (term: string) => void;
  videoMediaTypeFilter: 'all' | 'image' | 'video';
  setVideoMediaTypeFilter: (filter: 'all' | 'image' | 'video') => void;
  videoToolTypeFilter: boolean;
  setVideoToolTypeFilter: (enabled: boolean) => void;
  videoStarredOnly: boolean;
  setVideoStarredOnly: (starred: boolean) => void;
}

interface AddToShotProps {
  targetShotIdForButton: string | undefined;
  targetShotNameForButtonTooltip: string;
  handleAddVideoToTargetShot: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  handleAddVideoToTargetShotWithoutPosition: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

interface DeleteProps {
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

interface PreloadingProps {
  /** @deprecated Use generationFilters instead */
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
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
    videoPage,
    setVideoPage,
    videoShotFilter,
    setVideoShotFilter,
    videoExcludePositioned,
    setVideoExcludePositioned,
    videoSearchTerm,
    setVideoSearchTerm,
    videoMediaTypeFilter,
    setVideoMediaTypeFilter,
    videoToolTypeFilter,
    setVideoToolTypeFilter,
    videoStarredOnly,
    setVideoStarredOnly,
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
            projectAspectRatio={projectAspectRatio}
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
          lastShotId={targetShotIdForButton}
          lastShotNameForTooltip={targetShotNameForButtonTooltip}
          currentToolType="travel-between-images"
          currentToolTypeName="Travel Between Images"
          // Pagination props
          totalCount={videosData?.total}
          serverPage={videoPage}
          onServerPageChange={(page) => setVideoPage(page)}
          itemsPerPage={itemsPerPage}
          // Filter props
          initialMediaTypeFilter={videoMediaTypeFilter}
          onMediaTypeFilterChange={(val) => { setVideoMediaTypeFilter(val); setVideoPage(1); }}
          initialToolTypeFilter={videoToolTypeFilter}
          onToolTypeFilterChange={(val) => { setVideoToolTypeFilter(val); setVideoPage(1); }}
          showShotFilter={true}
          initialShotFilter={videoShotFilter}
          onShotFilterChange={(val) => { setVideoShotFilter(val); setVideoPage(1); }}
          initialExcludePositioned={videoExcludePositioned}
          onExcludePositionedChange={(val) => { setVideoExcludePositioned(val); setVideoPage(1); }}
          showSearch={false}
          initialSearchTerm={videoSearchTerm}
          onSearchChange={(val) => { setVideoSearchTerm(val); setVideoPage(1); }}
          initialStarredFilter={videoStarredOnly}
          onStarredFilterChange={(val) => { setVideoStarredOnly(val); setVideoPage(1); }}
          projectAspectRatio={projectAspectRatio}
          columnsPerRow={effectiveColumnsPerRow}
          showShare={false}
          onDelete={deletion?.onDelete}
          isDeleting={deletion?.isDeleting}
          // Preloading props
          generationFilters={preloading?.generationFilters}
          enableAdjacentPagePreloading={preloading?.enableAdjacentPagePreloading ?? true}
        />
      </div>
    </div>
  );
};
