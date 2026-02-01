import { useCallback, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { useToast } from '@/shared/hooks/use-toast';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { getDisplayUrl } from '@/shared/lib/utils';
import { GeneratedImageWithMetadata, DisplayableMetadata } from '../index';

export interface UseMediaGalleryActionsProps {
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: DisplayableMetadata) => void;
  onAddToLastShot?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onToggleStar?: (id: string, starred: boolean) => void;
  activeLightboxMedia: GenerationRow | null;
  setActiveLightboxMedia: (media: GenerationRow | null) => void;
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
  offset?: number;
  optimisticDeletedCount: number;
  onPageBoundsExceeded?: (newLastPage: number) => void;
}

export interface UseMediaGalleryActionsReturn {
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
  onApplySettings,
  onAddToLastShot,
  onAddToLastShotWithoutPosition,
  onToggleStar,
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
  offset = 0,
  optimisticDeletedCount,
  onPageBoundsExceeded,
}: UseMediaGalleryActionsProps): UseMediaGalleryActionsReturn => {

  const { toast } = useToast();
  const { setLastAffectedShotId } = useLastAffectedShot();

  // Track in-flight delete operations for debouncing rapid deletions
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const refetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    console.log('[Delete] Delete initiated:', {
      imageId: imageId.substring(0, 8),
      isServerPagination
    });

    try {
      // 4. Delete on server
      if (onDelete) {
        await onDelete(imageId);
      }

      // 5. Trigger refetch (debounced 100ms to batch rapid deletions)
      if (isServerPagination && onBackfillRequest) {
        // Clear existing timeout
        if (refetchTimeoutRef.current) {
          clearTimeout(refetchTimeoutRef.current);
        }

        // Short debounce to batch rapid deletions
        refetchTimeoutRef.current = setTimeout(async () => {
          console.log('[BackfillV2] Triggering refetch after delete(s):', {
            pendingDeletes: pendingDeletesRef.current.size,
            serverPage
          });

          try {
            await onBackfillRequest();

            // Check page bounds after refetch
            // The new total is currentTotal minus all pending deletes
            const newTotal = currentTotal - pendingDeletesRef.current.size;
            const newTotalPages = Math.max(1, Math.ceil(newTotal / itemsPerPage));

            if (serverPage && serverPage > newTotalPages) {
              console.log('[BackfillV2] Page bounds exceeded, navigating to last page:', {
                currentPage: serverPage,
                newTotalPages,
                newTotal
              });
              onPageBoundsExceeded?.(newTotalPages);
            }
          } catch (error) {
            console.error('[BackfillV2] Refetch failed:', error);
            // Only clear on error - success case is handled by Grid when new data renders
            setIsBackfillLoading(false);
          }
          // Clear pending deletes after refetch attempt
          pendingDeletesRef.current.clear();
        }, 100); // 100ms debounce - fast but batches rapid clicks
      }

    } catch (error) {
      console.error('[BackfillV2] Delete failed, reverting:', error);

      // Revert optimistic state
      removeOptimisticDeleted(imageId);
      pendingDeletesRef.current.delete(imageId);

      // Hide skeleton if no more pending deletes
      if (pendingDeletesRef.current.size === 0) {
        setIsBackfillLoading(false);
      }

      toast({
        title: "Delete Failed",
        description: "Could not delete the image. Please try again.",
        variant: "destructive"
      });
    }
  }, [
    markOptimisticDeleted,
    markOptimisticDeletedWithBackfill,
    removeOptimisticDeleted,
    onDelete,
    activeLightboxMedia,
    setActiveLightboxMedia,
    toast,
    isServerPagination,
    serverPage,
    onBackfillRequest,
    itemsPerPage,
    setIsBackfillLoading,
    totalCount,
    offset,
    onPageBoundsExceeded
  ]);

  const handleOpenLightbox = useCallback((image: GeneratedImageWithMetadata, autoEnterEditMode = false) => {
    console.log('[CrossPageNav] 📸 handleOpenLightbox - opening image:', {
      imageId: image.id?.substring(0, 8),
      autoEnterEditMode,
      timestamp: Date.now(),
    });

    // Map GeneratedImageWithMetadata to GenerationRow for the lightbox
    const mediaRow: GenerationRow = {
      id: image.id,
      imageUrl: image.url,
      location: image.url,
      type: image.isVideo ? 'video_travel_output' : 'single_image',
      createdAt: image.createdAt || new Date().toISOString(),
      metadata: {
        ...image.metadata,
        __autoEnterEditMode: autoEnterEditMode,
        based_on: image.based_on,
      },
      thumbUrl: image.isVideo ? image.url : undefined,
      based_on: image.based_on,
    } as GenerationRow;

    setActiveLightboxMedia(mediaRow);
    setAutoEnterEditMode(autoEnterEditMode);
  }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  const handleCloseLightbox = useCallback(() => {
    console.log('[CrossPageNav] 🚪 handleCloseLightbox called');
    setActiveLightboxMedia(null);
    setAutoEnterEditMode(false);
  }, [setActiveLightboxMedia, setAutoEnterEditMode]);

  const handleDownloadImage = useCallback(async (rawUrl: string, filename: string, imageId?: string, isVideo?: boolean, originalContentType?: string) => {
    const currentDownloadId = imageId || filename;
    setDownloadingImageId(currentDownloadId);
    const accessibleImageUrl = getDisplayUrl(rawUrl);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', accessibleImageUrl, true);
      xhr.responseType = 'blob';

      xhr.onload = function() {
        if (this.status === 200) {
          const responseContentType = this.getResponseHeader('content-type');
          const blobContentType = originalContentType || responseContentType || (isVideo ? 'video/mp4' : 'image/png');
          const blob = new Blob([this.response], { type: blobContentType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;

          let fileExtension = blobContentType.split('/')[1];
          if (fileExtension) {
            fileExtension = fileExtension.split(';')[0].trim();
          }
          if (!fileExtension || fileExtension === 'octet-stream') {
            const urlWithoutParams = accessibleImageUrl.split('?')[0];
            const urlParts = urlWithoutParams.split('.');
            fileExtension = urlParts.length > 1 ? urlParts.pop()! : (isVideo ? 'mp4' : 'png');
          }
          const downloadFilename = filename.includes('.') ? filename : `${filename}.${fileExtension}`;
          a.download = downloadFilename;

          document.body.appendChild(a);
          a.click();
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast({ title: "Download Started", description: filename });
        } else {
          throw new Error(`Failed to fetch image: ${this.status} ${this.statusText}`);
        }
      };

      xhr.onerror = function() {
        throw new Error('Network request failed');
      };

      xhr.send();
    } catch (error) {
      console.error("Error downloading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Download Failed",
        description: `Could not download ${filename}. ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setDownloadingImageId(null);
    }
  }, [setDownloadingImageId, toast]);

  const handleShowTick = useCallback((imageId: string) => {
    setShowTickForImageId(imageId);
    if (mainTickTimeoutRef.current) clearTimeout(mainTickTimeoutRef.current);
    mainTickTimeoutRef.current = setTimeout(() => {
      setShowTickForImageId(null);
    }, 1000);
  }, [setShowTickForImageId, mainTickTimeoutRef]);

  const handleShowSecondaryTick = useCallback((imageId: string) => {
    setShowTickForSecondaryImageId(imageId);
    if (secondaryTickTimeoutRef.current) clearTimeout(secondaryTickTimeoutRef.current);
    secondaryTickTimeoutRef.current = setTimeout(() => {
      setShowTickForSecondaryImageId(null);
    }, 1000);
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

    const sortedImages = [...starredImages].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (dateA !== dateB) {
        return dateA - dateB;
      }

      return a.id.localeCompare(b.id);
    });

    setIsDownloadingStarred(true);

    try {
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();

      toast({
        title: "Starting download",
        description: `Processing ${sortedImages.length} starred images...`
      });

      for (let i = 0; i < sortedImages.length; i++) {
        const image = sortedImages[i];
        const accessibleImageUrl = getDisplayUrl(image.url);

        try {
          const response = await fetch(accessibleImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          const blob = await response.blob();

          let fileExtension = 'png';
          const contentType = blob.type || image.metadata?.content_type;

          if (contentType) {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              fileExtension = 'jpg';
            } else if (contentType.includes('png')) {
              fileExtension = 'png';
            } else if (contentType.includes('webp')) {
              fileExtension = 'webp';
            } else if (contentType.includes('gif')) {
              fileExtension = 'gif';
            } else if (image.isVideo) {
              if (contentType.includes('mp4')) {
                fileExtension = 'mp4';
              } else if (contentType.includes('webm')) {
                fileExtension = 'webm';
              } else {
                fileExtension = 'mp4';
              }
            }
          } else if (image.isVideo) {
            fileExtension = 'mp4';
          }

          const paddedNumber = String(i + 1).padStart(3, '0');
          const filename = `${paddedNumber}.${fileExtension}`;

          zip.file(filename, blob);

          if ((i + 1) % 5 === 0 || i === sortedImages.length - 1) {
            toast({
              title: "Processing images",
              description: `Processed ${i + 1}/${sortedImages.length} images...`
            });
          }
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          toast({
            title: "Image processing error",
            description: `Failed to process image ${i + 1}, continuing with others...`,
            variant: "destructive"
          });
        }
      }

      toast({
        title: "Creating zip file",
        description: "Finalizing download..."
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      a.download = `starred-images-${dateStr}.zip`;

      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download complete",
        description: `Successfully downloaded ${sortedImages.length} starred images.`
      });

    } catch (error) {
      console.error("Error downloading starred images:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Download failed",
        description: `Could not create zip file. ${errorMessage}`,
        variant: "destructive"
      });
    } finally {
      setIsDownloadingStarred(false);
    }
  }, [filteredImages, toast, setIsDownloadingStarred]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
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
