import { TOOL_IDS } from '@/shared/lib/toolIds';
import { MediaGallery } from '@/shared/components/MediaGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import type { GenerationsPaginatedResponse } from '@/shared/hooks/projects/useProjectGenerations';

interface JoinClipsResultsProps {
  videosData: GenerationsPaginatedResponse | undefined;
  videosLoading: boolean;
  videosFetching: boolean;
  projectAspectRatio: string | undefined;
  isMobile: boolean;
  deletingId: string | null;
  handleDeleteGeneration: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
}

export function JoinClipsResults({
  videosData,
  videosLoading,
  videosFetching,
  projectAspectRatio,
  isMobile,
  deletingId,
  handleDeleteGeneration,
  onToggleStar,
}: JoinClipsResultsProps) {
  const hasValidData = videosData?.items && videosData.items.length > 0;
  const isLoadingOrFetching = videosLoading || videosFetching;
  const shouldShowSkeleton = isLoadingOrFetching && !hasValidData;

  if (shouldShowSkeleton) {
    const skeletonCount = videosData?.items?.length || 6;
    return (
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-medium">Loading Results...</h2>
        <SkeletonGallery
          count={skeletonCount}
          columns={SKELETON_COLUMNS[3]}
          showControls
          projectAspectRatio={projectAspectRatio}
        />
      </div>
    );
  }

  if (hasValidData) {
    return (
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-medium">Previous Results ({videosData.items.length})</h2>
        <MediaGallery
          images={videosData.items || []}
          allShots={[]}
          onAddToLastShot={async () => false}
          onAddToLastShotWithoutPosition={async () => false}
          onDelete={handleDeleteGeneration}
          onToggleStar={onToggleStar}
          isDeleting={deletingId}
          currentToolType={TOOL_IDS.JOIN_CLIPS}
          defaultFilters={{ mediaType: 'video', toolTypeFilter: true, shotFilter: 'all' }}
          columnsPerRow={3}
          itemsPerPage={isMobile ? 20 : 12}
          config={{
            reducedSpacing: true,
            hidePagination: videosData.items.length <= (isMobile ? 20 : 12),
            hideBottomPagination: true,
            hideMediaTypeFilter: true,
            showShare: false,
          }}
        />
      </div>
    );
  }

  return null;
}
