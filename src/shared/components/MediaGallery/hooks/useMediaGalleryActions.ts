import { useCallback, useRef, useEffect } from 'react';
import { useLastAffectedShot } from '@/shared/hooks/shots/useLastAffectedShot';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { GeneratedImageWithMetadata, DisplayableMetadata } from '../types';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { AddToShotHandler, AsyncImageDeleteHandler } from '@/shared/types/imageHandlers';
import { INTERACTION_TIMING } from '@/shared/lib/interactions/timing';
import { computeBackfillLastPage } from '@/shared/components/MediaGallery/services/backfillPolicy';
import {
  downloadSingleMedia,
  downloadStarredMediaArchive,
  DownloadServiceError,
} from '@/shared/components/MediaGallery/services/downloadService';

interface UseMediaGalleryActionsProps {
  onDelete?: AsyncImageDeleteHandler;
  onApplySettings?: (metadata: DisplayableMetadata | undefined) => void;
  onAddToLastShot?: AddToShotHandler;
  onAddToLastShotWithoutPosition?: AddToShotHandler;
  onToggleStar?: (id: string, starred: boolean) => void;
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  setActiveLightboxMedia: (media: GeneratedImageWithMetadata | null) => void;
  setAutoEnterEditMode: (value: boolean) => void;
  markOptimisticDeleted: (imageId: string) => void;
  markOptimisticDeletedWithBackfill: (imageId: string) => void;
  removeOptimisticDeleted: (imageId: string) => void;
  setDownloadingImageId: (id: string | null) => void;
  setShowTickForImageId: (id: string | null) => void;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  mainTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  secondaryTickTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  onBackfillRequest?: () => Promise<void>;
  serverPage?: number;
  itemsPerPage: number;
  isServerPagination: boolean;
  setIsBackfillLoading: (loading: boolean) => void;
  filteredImages: GeneratedImageWithMetadata[];
  setIsDownloadingStarred: (downloading: boolean) => void;
  setSelectedShotIdLocal: (shotId: string) => void;
  // New props for robust backfill
  totalCount?: number;
  optimisticDeletedCount: number;
  onPageBoundsExceeded?: (newLastPage: number) => void;
}

interface UseMediaGalleryActionsReturn {
  handleOptimisticDelete: (imageId: string) => Promise<void>;
  handleOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  handleCloseLightbox: () => void;
  handleDownloadImage: (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => Promise<void>;
  handleDownloadStarred: () => Promise<void>;
  handleShowTick: (imageId: string) => void;
  handleShowSecondaryTick: (imageId: string) => void;
  handleShotChange: (shotId: string) => void;
}

export const useMediaGalleryActions = ({
  onDelete,
  activeLightboxMedia,
  setActiveLightboxMedia,
  setAutoEnterEditMode,
  markOptimisticDeleted,
  markOptimisticDeletedWithBackfill,
  removeOptimisticDeleted,
  setDownloadingImageId,
  setShowTickForImageId,
  setShowTickForSecondaryImageId,
  mainTickTimeoutRef,
  secondaryTickTimeoutRef,
  onBackfillRequest,
  serverPage,
  itemsPerPage,
  isServerPagination,
  setIsBackfillLoading,
  filteredImages,
  setIsDownloadingStarred,
  setSelectedShotIdLocal,
  totalCount,
  onPageBoundsExceeded,
}: UseMediaGalleryActionsProps): UseMediaGalleryActionsReturn => {

  const { setLastAffectedShotId } = useLastAffectedShot();

  // Track in-flight delete operations for debouncing rapid deletions
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearLoadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Optimistic delete with skeleton placeholder at end of grid.
   *
   * Flow:
   * 1. Mark item as deleted (item disappears, others shift)
   * 2. Show skeleton at end of grid while waiting for backfill
   * 3. Call server delete
   * 4. On success: trigger immediate refetch (debounced 100ms for rapid deletes)
   * 5. On failure: revert optimistic state, hide skeleton, show error
   * 6. Check page bounds after refetch
   */
  const handleOptimisticDelete = useCallback(async (imageId: string) => {
    // Use combined action for atomic state update - both deleted mark AND backfill loading
    // in a single dispatch, ensuring skeleton appears in same render as item disappears
    if (isServerPagination) {
      markOptimisticDeletedWithBackfill(imageId);
    } else {
      markOptimisticDeleted(imageId);
    }
    pendingDeletesRef.current.add(imageId);

    // 3. Close lightbox if this image is open
    if (activeLightboxMedia?.id === imageId) {
      setActiveLightboxMedia(null);
    }

    try {
      // 4. Delete on server
      if (onDelete) {
        await onDelete(imageId);
      }

      // 5. Trigger refetch (debounced 100ms to batch rapid deletions)
      if (isServerPagination && onBackfillRequest) {
        // Clear existing timeouts (debounce and any pending clear)
        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current);
        }
        if (clearLoadingTimeoutRef.current) {
          clearTimeout(clearLoadingTimeoutRef.current);
        }

        // Short debounce to batch rapid deletions
        refetchTimeoutRef.current = setTimeout(async () => {

          try {
            await onBackfillRequest();

            // Check page bounds after refetch
            const newLastPage = computeBackfillLastPage(
              totalCount,
              pendingDeletesRef.current.size,
              itemsPerPage,
            );

            if (serverPage && serverPage > newLastPage) {
              onPageBoundsExceeded?.(newLastPage);
            }

            // Clear backfill loading after a short delay to allow image to load
            // The skeleton stays visible during this time, then fades out
            // Use ref so this can be cancelled if more deletes happen
            clearLoadingTimeoutRef.current = setTimeout(() => {
              setIsBackfillLoading(false);
              clearLoadingTimeoutRef.current = null;
            }, INTERACTION_TIMING.galleryBackfillLoadingClearMs);
          } catch (error) {
            normalizeAndPresentError(error, { context: 'useMediaGalleryActions', showToast: false });
            setIsBackfillLoading(false);
          }
          // Clear pending deletes after refetch attempt
          pendingDeletesRef.current.clear();
        }, INTERACTION_TIMING.galleryDeleteRefetchDebounceMs);
      }

    } catch (error) {
      normalizeAndPresentError(error, { context: 'useMediaGalleryActions', toastTitle: 'Delete Failed' });

      // Revert optimistic state
      removeOptimisticDeleted(imageId);
      pendingDeletesRef.current.delete(imageId);

      // Hide skeleton if no more pending deletes
      if (pendingDeletesRef.current.size === 0) {
        setIsBackfillLoading(false);
      }
    }
  }, [
    markOptimisticDeleted,
    markOptimisticDeletedWithBackfill,
    removeOptimisticDeleted,
    onDelete,
    activeLightboxMedia,
    setActiveLightboxMedia,
    isServerPagination,
    serverPage,
    onBackfillRequest,
    itemsPerPage,
    setIsBackfillLoading,
    totalCount,
    onPageBoundsExceeded
  ]);

  const handleOpenLightbox = useCallback((image: GeneratedImageWithMetadata, autoEnterEditMode = false) => {
    const generationId = getGenerationId(image);

    setActiveLightboxMedia({
      ...image,
      generation_id: image.generation_id ?? generationId ?? undefined,
      location: image.location ?? image.url,
      type: image.type ?? (image.isVideo ? 'video_travel_output' : 'single_image'),
      metadata: {
        ...image.metadata,
        __autoEnterEditMode: autoEnterEditMode,
        based_on: image.based_on,
      },
    });
    setAutoEnterEditMode(autoEnterEditMode);
  }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  const handleCloseLightbox = useCallback(() => {
    setActiveLightboxMedia(null);
    setAutoEnterEditMode(false);
  }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  const handleDownloadImage = useCallback(async (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => {
    const currentDownloadId = imageId || filename;
    setDownloadingImageId(currentDownloadId);

    try {
      await downloadSingleMedia({
        rawUrl,
        filename,
        isVideo,
        originalContentType,
      });
      toast({ title: "Download Started", description: filename });
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useMediaGalleryActions.handleDownloadImage',
        toastTitle: 'Download Failed',
        ...(error instanceof DownloadServiceError ? {
          logData: {
            code: error.code,
            status: error.status,
            statusText: error.statusText,
            url: error.url,
          },
        } : {}),
      });
    } finally {
      setDownloadingImageId(null);
    }
  }, [setDownloadingImageId]);

  const handleShowTick = useCallback((imageId: string) => {
    setShowTickForImageId(imageId);
    if (mainTickTimeoutRef.current) clearTimeout(mainTickTimeoutRef.current);
    mainTickTimeoutRef.current = setTimeout(() => {
      setShowTickForImageId(null);
    }, INTERACTION_TIMING.galleryTickResetMs);
  }, [setShowTickForImageId, mainTickTimeoutRef]);

  const handleShowSecondaryTick = useCallback((imageId: string) => {
    setShowTickForSecondaryImageId(imageId);
    if (secondaryTickTimeoutRef.current) clearTimeout(secondaryTickTimeoutRef.current);
    secondaryTickTimeoutRef.current = setTimeout(() => {
      setShowTickForSecondaryImageId(null);
    }, INTERACTION_TIMING.galleryTickResetMs);
  }, [setShowTickForSecondaryImageId, secondaryTickTimeoutRef]);

  const handleShotChange = useCallback((shotId: string) => {
    setLastAffectedShotId(shotId);
    setSelectedShotIdLocal(shotId);
    setShowTickForImageId(null);
  }, [setLastAffectedShotId, setSelectedShotIdLocal, setShowTickForImageId]);

  const handleDownloadStarred = useCallback(async () => {
    const starredImages = filteredImages.filter(image => image.starred);

    if (starredImages.length === 0) {
      toast({
        title: "No starred images",
        description: "No starred images found to download.",
        variant: "destructive"
      });
      return;
    }

    setIsDownloadingStarred(true);

    try {
      toast({
        title: "Starting download",
        description: `Processing ${starredImages.length} starred images...`
      });
      await downloadStarredMediaArchive({
        images: starredImages,
        onProgress: (processed, total) => {
          if (processed % 5 === 0 || processed === total) {
            toast({
              title: "Processing images",
              description: `Processed ${processed}/${total} images...`
            });
          }
        },
      });

      toast({
        title: "Download complete",
        description: `Successfully downloaded ${starredImages.length} starred images.`
      });

    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useMediaGalleryActions.handleDownloadStarred',
        toastTitle: 'Download failed',
        ...(error instanceof DownloadServiceError ? {
          logData: {
            code: error.code,
            status: error.status,
            statusText: error.statusText,
            url: error.url,
          },
        } : {}),
      });
    } finally {
      setIsDownloadingStarred(false);
    }
  }, [filteredImages, setIsDownloadingStarred]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
      if (clearLoadingTimeoutRef.current) {
        clearTimeout(clearLoadingTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleOptimisticDelete,
    handleOpenLightbox,
    handleCloseLightbox,
    handleDownloadImage,
    handleDownloadStarred,
    handleShowTick,
    handleShowSecondaryTick,
    handleShotChange,
  };
};
