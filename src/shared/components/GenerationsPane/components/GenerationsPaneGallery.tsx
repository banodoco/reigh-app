import React from 'react';
import { MediaGallery, type GalleryFilterState } from '@/shared/components/MediaGallery';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';

type MediaGalleryProps = React.ComponentProps<typeof MediaGallery>;

interface GenerationsPaneLayoutModel {
  columns: number;
  itemsPerPage: number;
}

interface GenerationsPaneLoadingModel {
  isLoading: boolean;
  expectedItemCount?: number;
}

interface GenerationsPanePageModel {
  page: number;
  totalCount: number;
}

interface GenerationsPaneGalleryModel {
  items: MediaGalleryProps['images'];
  onDelete: NonNullable<MediaGalleryProps['onDelete']>;
  onToggleStar: NonNullable<MediaGalleryProps['onToggleStar']>;
  isDeleting: boolean;
  allShots: NonNullable<MediaGalleryProps['allShots']>;
  lastShotId?: string;
  filters: GalleryFilterState;
  onFiltersChange: (newFilters: GalleryFilterState) => void;
  onAddToShot: NonNullable<MediaGalleryProps['onAddToLastShot']>;
  onAddToShotWithoutPosition: NonNullable<MediaGalleryProps['onAddToLastShotWithoutPosition']>;
  onServerPageChange: NonNullable<MediaGalleryProps['onServerPageChange']>;
  generationFilters: MediaGalleryProps['generationFilters'];
  currentViewingShotId?: string;
  onCreateShot: NonNullable<MediaGalleryProps['onCreateShot']>;
}

export interface GenerationsPaneGalleryProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  projectAspectRatio?: string;
  layout: GenerationsPaneLayoutModel;
  loading: GenerationsPaneLoadingModel;
  pagination: GenerationsPanePageModel;
  error: Error | null;
  gallery: GenerationsPaneGalleryModel;
}

export function GenerationsPaneGallery({
  containerRef,
  projectAspectRatio,
  layout,
  loading,
  pagination,
  error,
  gallery,
}: GenerationsPaneGalleryProps): React.ReactElement {
  return (
    <div
      ref={containerRef}
      className="flex-grow px-1 sm:px-3 overflow-y-auto overscroll-contain flex flex-col"
      style={{ WebkitOverflowScrolling: 'touch' }}
      data-tour="gallery-section"
    >
      {loading.isLoading && gallery.items.length === 0 && (
        <SkeletonGallery
          count={loading.expectedItemCount ?? layout.itemsPerPage}
          fixedColumns={layout.columns}
          gapClasses="gap-2 sm:gap-4"
          darkSurface
          showControls={false}
          projectAspectRatio={projectAspectRatio}
          className="space-y-0 pb-4 pt-2"
        />
      )}

      {error && <p className="text-red-500 text-center">Error: {error.message}</p>}

      {gallery.items.length > 0 && (
        <div className={loading.isLoading ? 'opacity-60 pointer-events-none transition-opacity duration-200' : ''}>
          <MediaGallery
            images={gallery.items}
            onDelete={gallery.onDelete}
            onToggleStar={gallery.onToggleStar}
            isDeleting={gallery.isDeleting}
            allShots={gallery.allShots}
            lastShotId={gallery.lastShotId}
            filters={gallery.filters}
            onFiltersChange={gallery.onFiltersChange}
            columnsPerRow={layout.columns}
            onAddToLastShot={(targetShotId, generationId, imageUrl, thumbUrl) => {
              return gallery.onAddToShot(targetShotId, generationId, imageUrl, thumbUrl);
            }}
            onAddToLastShotWithoutPosition={(targetShotId, generationId, imageUrl, thumbUrl) => {
              return gallery.onAddToShotWithoutPosition(targetShotId, generationId, imageUrl, thumbUrl);
            }}
            offset={(pagination.page - 1) * layout.itemsPerPage}
            totalCount={pagination.totalCount}
            itemsPerPage={layout.itemsPerPage}
            className="space-y-0 pb-8"
            config={{
              darkSurface: true,
              reducedSpacing: true,
              hidePagination: true,
              hideTopFilters: true,
              showShare: false,
            }}
            serverPage={pagination.page}
            onServerPageChange={gallery.onServerPageChange}
            generationFilters={gallery.generationFilters}
            currentViewingShotId={gallery.currentViewingShotId}
            onCreateShot={gallery.onCreateShot}
          />
        </div>
      )}

      {gallery.items.length === 0 && !loading.isLoading && (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          No generations found for this project.
        </div>
      )}
    </div>
  );
}
