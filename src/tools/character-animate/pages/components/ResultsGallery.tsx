
import { MediaGallery } from '@/shared/components/MediaGallery';
import { SKELETON_COLUMNS } from '@/shared/components/MediaGallery/utils';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import type { GenerationsPaginatedResponse } from '@/shared/hooks/projects/useProjectGenerations';

interface ResultsGalleryProps {
  data: GenerationsPaginatedResponse | undefined;
  loading: boolean;
  fetching: boolean;
  videosViewJustEnabled: boolean;
  projectAspectRatio: string | undefined;
  deletingId: string | null;
  isMobile: boolean;
  onDelete: (id: string) => void;
  onToggleStar: (id: string, starred: boolean) => void;
}

export function ResultsGallery(props: ResultsGalleryProps) {
  const {
    data,
    loading,
    fetching,
    videosViewJustEnabled,
    projectAspectRatio,
    deletingId,
    isMobile,
    onDelete,
    onToggleStar,
  } = props;

  const hasValidData = !!(data?.items && data.items.length > 0);
  const isLoadingOrFetching = loading || fetching;
  const shouldShowSkeleton = (isLoadingOrFetching || videosViewJustEnabled) && hasValidData;

  if (shouldShowSkeleton && data?.items) {
    return (
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-medium">Previous Results ({data.items.length})</h2>
        <SkeletonGallery
          count={data.items.length}
          columns={SKELETON_COLUMNS[3]}
          showControls={true}
          projectAspectRatio={projectAspectRatio}
        />
      </div>
    );
  }

  if (hasValidData && data?.items) {
    return (
      <div className="space-y-4 pt-4 border-t">
        <h2 className="text-xl font-medium">Previous Results ({data.items.length})</h2>
        <MediaGallery
          images={data.items}
          allShots={[]}
          onAddToLastShot={async () => false}
          onAddToLastShotWithoutPosition={async () => false}
          onDelete={onDelete}
          onToggleStar={onToggleStar}
          isDeleting={deletingId}
          currentToolType={TOOL_IDS.CHARACTER_ANIMATE}
          defaultFilters={{ mediaType: 'video', toolTypeFilter: true, shotFilter: 'all' }}
          currentToolTypeName="Animate Characters"
          columnsPerRow={3}
          itemsPerPage={isMobile ? 20 : 12}
          config={{
            reducedSpacing: true,
            hidePagination: data.items.length <= (isMobile ? 20 : 12),
          }}
        />
      </div>
    );
  }

  if (!isLoadingOrFetching) {
    return (
      <div className="text-sm text-muted-foreground text-center pt-4 border-t">
        No animations yet. Create your first one above!
      </div>
    );
  }

  return null;
}
