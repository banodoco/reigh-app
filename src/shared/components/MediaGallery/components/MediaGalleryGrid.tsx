import React from "react";
import { Filter, Sparkles } from "lucide-react";
import { SkeletonGallery } from "@/shared/components/ui/skeleton-gallery";
import { ProgressiveLoadingManager } from "@/shared/components/ProgressiveLoadingManager";
import { MediaGalleryItem } from "@/shared/components/MediaGalleryItem";
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';
import { useAdjacentPagePreloader } from '@/shared/hooks/useAdjacentPagePreloader';
import { GeneratedImageWithMetadata } from '../index';
import { parseRatio } from '@/shared/lib/aspectRatios';

interface MediaGalleryGridProps {
  // Data props
  images: GeneratedImageWithMetadata[];
  paginatedImages: GeneratedImageWithMetadata[];
  filteredImages: GeneratedImageWithMetadata[];

  // Layout props
  reducedSpacing?: boolean;
  whiteText?: boolean;
  gridColumnClasses: string;
  columnsPerRow?: number;
  projectAspectRatio?: string;

  // Loading props
  isLoading?: boolean;
  isGalleryLoading: boolean;
  isServerPagination: boolean;

  // Navigation completion - the SINGLE way to clear loading state
  clearNavigation: () => void;

  // Legacy props (kept for backwards compatibility, but prefer clearNavigation)
  setIsGalleryLoading?: (loading: boolean) => void;
  setLoadingButton?: (button: 'prev' | 'next' | null) => void;
  safetyTimeoutRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  
  // Progressive loading props
  effectivePage: number;
  isMobile: boolean;
  
  // Lightbox state
  isLightboxOpen?: boolean;
  
  // Preloading props
  enableAdjacentPagePreloading?: boolean;
  page: number;
  serverPage?: number;
  totalFilteredItems: number;
  itemsPerPage: number;
  /** @deprecated No longer needed - use generationFilters instead */
  onPrefetchAdjacentPages?: (prevPage: number | null, nextPage: number | null) => void;
  selectedProjectId?: string;
  /** Filters for generation queries - enables automatic preloading */
  generationFilters?: Record<string, unknown>;
  
  // Filter state for empty states
  hasFilters: boolean;
  
  // Backfill state
  isBackfillLoading?: boolean;
  setIsBackfillLoading?: (loading: boolean) => void;

  // Props for computing skeleton count dynamically
  totalCount?: number;
  offset?: number;
  optimisticDeletedCount?: number;
  
  // Pagination display state
  hideBottomPagination?: boolean;

  // MediaGalleryItem props - passing through all the props it needs
  [key: string]: unknown; // This allows passing through all other props
}

// Memoized grid component to prevent unnecessary re-renders from parent
const MediaGalleryGridInner: React.FC<MediaGalleryGridProps> = ({
  // Data props
  images,
  paginatedImages,
  filteredImages,

  // Layout props
  reducedSpacing = false,
  whiteText = false,
  gridColumnClasses,
  columnsPerRow = 5,
  projectAspectRatio,

  // Loading props
  isLoading = false,
  isGalleryLoading,
  isServerPagination,

  // Navigation completion - the SINGLE way to clear loading state
  clearNavigation,

  // Legacy props (kept for backwards compatibility)
  setIsGalleryLoading,
  setLoadingButton,
  safetyTimeoutRef,
  
  // Progressive loading props
  effectivePage,
  isMobile,
  
  // Lightbox state
  isLightboxOpen = false,
  
  // Preloading props
  enableAdjacentPagePreloading = true,
  page,
  serverPage,
  totalFilteredItems,
  itemsPerPage,
  onPrefetchAdjacentPages, // Deprecated - kept for backwards compatibility
  selectedProjectId,
  generationFilters,
  
  // Filter state
  hasFilters,
  
  // Backfill state
  isBackfillLoading = false,
  setIsBackfillLoading,

  // Props for computing skeleton count dynamically
  totalCount = 0,
  offset = 0,
  optimisticDeletedCount = 0,

  // Pagination display state
  hideBottomPagination = false,

  // Pass through all other props for MediaGalleryItem
  ...itemProps
}) => {

  // === SIMPLE PAGE CHANGE DETECTION ===
  // Create a signature for the current page to detect when new data arrives
  const pageSignature = React.useMemo(() => {
    if (paginatedImages.length === 0) return 'empty';
    const firstId = paginatedImages[0]?.id || 'none';
    const lastId = paginatedImages[paginatedImages.length - 1]?.id || 'none';
    return `${paginatedImages.length}-${firstId}-${lastId}`;
  }, [paginatedImages]);

  const prevPageSignatureRef = React.useRef<string>(pageSignature);
  // Store clearNavigation in a ref to avoid effect dependency issues
  const clearNavigationRef = React.useRef(clearNavigation);
  clearNavigationRef.current = clearNavigation;

  // When page data changes and we're loading, clear navigation immediately
  // This is the moment when the new page becomes visible
  React.useEffect(() => {
    if (prevPageSignatureRef.current !== pageSignature) {
      console.log(`[NAV_STATE] Page signature changed: ${prevPageSignatureRef.current} -> ${pageSignature}, isGalleryLoading: ${isGalleryLoading}`);
      prevPageSignatureRef.current = pageSignature;

      // If we were navigating, we've arrived - clear the loading state
      if (isGalleryLoading) {
        console.log(`[NAV_STATE] Clearing navigation - new page data arrived`);
        clearNavigationRef.current();
      }
    }
  }, [pageSignature, isGalleryLoading]);

  // Skeleton count: show enough to fill the gap from deleted items
  // When data arrives, gapCount becomes 0, but we keep 1 skeleton until timer clears isBackfillLoading
  const computedSkeletonCount = React.useMemo(() => {
    if (!isBackfillLoading || !isServerPagination) return 0;

    // Calculate optimistic total (server total minus pending deletes)
    const optimisticTotal = Math.max(0, totalCount - optimisticDeletedCount);

    // How many items should be on this page?
    const itemsAfterOffset = Math.max(0, optimisticTotal - offset);
    const expectedItems = Math.min(itemsPerPage, itemsAfterOffset);

    // How many items do we actually have?
    const actualItems = paginatedImages.length;

    // Gap = expected - actual, but always show at least 1 while loading
    // This ensures smooth transition: multiple skeletons during delete,
    // then 1 skeleton remains until image loads
    const gapCount = Math.max(0, expectedItems - actualItems);
    return Math.max(1, gapCount);
  }, [isBackfillLoading, isServerPagination, totalCount, optimisticDeletedCount, offset, itemsPerPage, paginatedImages.length]);

  // Calculate aspect ratio to match MediaGalleryItem exactly
  const skeletonAspectRatio = React.useMemo(() => {
    let padding = '100%'; // Default 1:1
    if (projectAspectRatio) {
      const ratio = parseRatio(projectAspectRatio);
      if (!isNaN(ratio)) {
        const calculated = (1 / ratio) * 100;
        const minPadding = 60;
        const maxPadding = 200;
        padding = `${Math.min(Math.max(calculated, minPadding), maxPadding)}%`;
      }
    }
    return padding;
  }, [projectAspectRatio]);

  // Show full skeleton gallery when loading new data
  if (isLoading) {
    // Match the gap classes used in the actual grid
    const skeletonGapClasses = reducedSpacing ? 'gap-2 sm:gap-4' : 'gap-4';

    return (
      <div className={reducedSpacing ? "" : "min-h-[400px]"}>
        <SkeletonGallery
          count={itemsPerPage}
          fixedColumns={columnsPerRow}
          gapClasses={skeletonGapClasses}
          whiteText={whiteText}
          showControls={false}
          projectAspectRatio={projectAspectRatio}
        />
      </div>
    );
  }

  // Adjacent page preloading - uses new unified hook when filters are provided
  // Falls back to legacy callback approach if generationFilters not provided
  useAdjacentPagePreloader({
    projectId: selectedProjectId || null,
    currentPage: isServerPagination ? (serverPage ?? 1) : page + 1, // Convert to 1-indexed
    itemsPerPage,
    filters: generationFilters,
    totalItems: totalFilteredItems,
    enabled: enableAdjacentPagePreloading && !!generationFilters, // Only enable if filters provided
    paused: isLightboxOpen,
  });

  return (
    <>
      {/* Gallery content wrapper with minimum height to prevent layout jump when there are images */}
      <div className={paginatedImages.length > 0 && !reducedSpacing && !hideBottomPagination ? "min-h-[400px] sm:min-h-[500px] lg:min-h-[600px]" : ""}>
        {/* No items match filters message */}
        {images.length > 0 && filteredImages.length === 0 && hasFilters && !isGalleryLoading && (
          <div className={`text-center py-10 mt-6 rounded-lg ${
            whiteText 
              ? "text-zinc-400 border-zinc-700 bg-zinc-800/50" 
              : "text-muted-foreground border bg-card shadow-sm"
          }`}>
            <Filter className={`mx-auto h-10 w-10 mb-3 opacity-60 ${whiteText ? "text-zinc-500" : ""}`} />
            <p className={`font-light ${whiteText ? "text-zinc-300" : ""}`}>No items match the current filters.</p>
            <p className={`text-sm ${whiteText ? "text-zinc-400" : ""}`}>Adjust the filters or clear the search to see all items.</p>
          </div>
        )}

        {/* No images generated yet message */}
        {images.length === 0 && !isGalleryLoading && (
           <div className={`text-center py-12 mt-8 rounded-lg ${
             whiteText 
               ? "text-zinc-400 border-zinc-700 bg-zinc-800/50" 
               : "text-muted-foreground border bg-card shadow-sm"
           }`}>
             <Sparkles className={`mx-auto h-10 w-10 mb-3 opacity-60 ${whiteText ? "text-zinc-500" : ""}`} />
             <p className={`font-light ${whiteText ? "text-zinc-300" : ""}`}>No images generated yet.</p>
             <p className={`text-sm ${whiteText ? "text-zinc-400" : ""}`}>Use the controls above to generate some images.</p>
           </div>
        )}

        {/* Images grid */}
        {paginatedImages.length > 0 && (
          <ProgressiveLoadingManager
            images={paginatedImages}
            page={effectivePage}
            enabled={true}
            isMobile={isMobile}
            isLightboxOpen={isLightboxOpen}
            instanceId={`gallery-${isServerPagination ? (serverPage || 1) : page}`}
            onImagesReady={() => {
              // Backfill loading is cleared by timer in useMediaGalleryActions
              // This callback can be used for other purposes if needed
            }}
          >
            {(showImageIndices) => (
              <div>
                <div
                  className={`grid ${reducedSpacing ? 'gap-2 sm:gap-4' : 'gap-4'} ${(reducedSpacing || hideBottomPagination) ? 'mb-0' : 'mb-12'}`}
                  style={{ gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))` }}
                  data-tour="gallery-grid"
                >
                  {paginatedImages.map((image, index) => {
                    const shouldShow = showImageIndices.has(index);
                    
                    // Use unified loading strategy system
                    const loadingStrategy = getImageLoadingStrategy(index, {
                      isMobile,
                      totalImages: paginatedImages.length,
                      isPreloaded: false // Will be checked inside the component
                    });
                    
                    // Debug logging disabled for performance (was causing excessive re-renders)
                    // if (index < 8 || (loadingStrategy.shouldLoadInInitialBatch && !shouldShow)) {
                    //   console.log(`[GalleryDebug] 🖼️ Image ${index} render:`, {
                    //     imageId: image.id?.substring(0, 8),
                    //     shouldShow,
                    //     batchGroup: loadingStrategy.batchGroup,
                    //     shouldLoadInInitialBatch: loadingStrategy.shouldLoadInInitialBatch,
                    //     showImageIndicesSize: showImageIndices.size,
                    //     showImageIndicesArray: Array.from(showImageIndices).slice(0, 10),
                    //     isGalleryLoading
                    //   });
                    // }
                    
                    return (
                      <MediaGalleryItem
                        key={image.id || `image-${index}`}
                        image={image}
                        index={index}
                        shouldLoad={shouldShow}
                        isPriority={loadingStrategy.shouldLoadInInitialBatch}
                        isGalleryLoading={isGalleryLoading}
                        isMobile={isMobile}
                        projectAspectRatio={projectAspectRatio}
                        {...itemProps}
                      />
                    );
                  })}

                  {/* Backfill skeletons at end of grid - match MediaGalleryItem structure exactly */}
                  {computedSkeletonCount > 0 && Array.from({ length: computedSkeletonCount }).map((_, idx) => (
                    <div key={`skeleton-${idx}`} className="relative group">
                      <div className="border rounded-lg overflow-hidden transition-all duration-200 relative bg-card">
                        <div className="relative w-full">
                          <div
                            style={{ paddingBottom: skeletonAspectRatio, minHeight: '120px' }}
                            className="relative bg-muted/50"
                          >
                            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-muted/30 animate-pulse">
                              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ProgressiveLoadingManager>
        )}
      </div>
    </>
  );
};

// Wrap in React.memo with default shallow comparison
// This prevents re-renders when parent re-renders but props are referentially equal
export const MediaGalleryGrid = React.memo(MediaGalleryGridInner);
