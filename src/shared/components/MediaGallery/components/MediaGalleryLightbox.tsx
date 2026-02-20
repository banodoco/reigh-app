import React, { useMemo, useEffect } from "react";
import MediaLightbox from "@/shared/components/MediaLightbox";
import TaskDetailsModal from '@/shared/components/TaskDetailsModal';
import { GenerationRow, Shot } from "@/types/shots";
import { Task } from "@/types/tasks";
import type { GeneratedImageWithMetadata } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { usePrefetchTaskData } from '@/shared/hooks/useTaskPrefetch';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

interface MediaGalleryLightboxStateProps {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  autoEnterEditMode?: boolean;
  onClose: () => void;
}

interface MediaGalleryLightboxNavigationProps {
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
}

interface MediaGalleryLightboxActionsProps {
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: string | boolean | null;
  onApplySettings?: (metadata: GenerationRow['metadata']) => void;
}

interface MediaGalleryLightboxShotManagementProps {
  simplifiedShotOptions: { id: string; name: string }[];
  selectedShotIdLocal: string;
  onShotChange: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

interface MediaGalleryLightboxUiStateProps {
  showTickForImageId: string | null;
  setShowTickForImageId: (id: string | null) => void;
  showTickForSecondaryImageId?: string | null;
  setShowTickForSecondaryImageId?: (id: string | null) => void;
}

interface MediaGalleryLightboxOptimisticProps {
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
}

interface MediaGalleryLightboxTaskModalStateProps {
  isMobile: boolean;
  showTaskDetailsModal: boolean;
  setShowTaskDetailsModal: (show: boolean) => void;
  selectedImageForDetails: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  onShowTaskDetails?: () => void;
}

interface MediaGalleryLightboxTaskDataProps {
  task?: Task | null;
  isLoadingTask?: boolean;
  taskError?: Error | null;
  inputImages?: string[];
  lightboxTaskMapping?: { taskId: string | null };
}

interface MediaGalleryLightboxIntegrationProps {
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  onNavigateToShot?: (shot: Shot) => void;
  toolTypeOverride?: string;
  setActiveLightboxIndex?: (index: number) => void;
}

type MediaGalleryLightboxProps =
  & MediaGalleryLightboxStateProps
  & MediaGalleryLightboxNavigationProps
  & MediaGalleryLightboxActionsProps
  & MediaGalleryLightboxShotManagementProps
  & MediaGalleryLightboxUiStateProps
  & MediaGalleryLightboxOptimisticProps
  & MediaGalleryLightboxTaskModalStateProps
  & MediaGalleryLightboxTaskDataProps
  & MediaGalleryLightboxIntegrationProps;

export const MediaGalleryLightbox: React.FC<MediaGalleryLightboxProps> = ({
  activeLightboxMedia,
  autoEnterEditMode = false,
  onClose,
  filteredImages,
  isServerPagination,
  serverPage,
  totalPages,
  onNext,
  onPrevious,
  onDelete,
  isDeleting,
  onApplySettings,
  simplifiedShotOptions,
  selectedShotIdLocal,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  showTickForImageId,
  setShowTickForImageId,
  showTickForSecondaryImageId,
  setShowTickForSecondaryImageId,
  // Optimistic updates
  optimisticPositionedIds,
  optimisticUnpositionedIds,
  onOptimisticPositioned,
  onOptimisticUnpositioned,
  isMobile,
  showTaskDetailsModal,
  setShowTaskDetailsModal,
  selectedImageForDetails,
  setSelectedImageForDetails,
  task,
  isLoadingTask,
  taskError,
  inputImages,
  lightboxTaskMapping,
  onShowTaskDetails,
  onCreateShot,
  onNavigateToShot,
  toolTypeOverride,
  setActiveLightboxIndex,
}) => {
  
  // Local state for shot selector dropdown (separate from the shot being viewed)
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = React.useState<string | undefined>(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
  
  // Extract autoEnterEditMode from media metadata (more reliable than separate state)
  const effectiveAutoEnterEditMode = React.useMemo(() => {
    const fromMetadata = activeLightboxMedia?.metadata?.__autoEnterEditMode as boolean | undefined;
    const result = fromMetadata ?? autoEnterEditMode ?? false;
    
    return result;
  }, [activeLightboxMedia?.metadata?.__autoEnterEditMode, autoEnterEditMode]);
  
  
  // Calculate navigation availability for MediaLightbox
  const { hasNext, hasPrevious } = useMemo(() => {
    if (!activeLightboxMedia) return { hasNext: false, hasPrevious: false };
    
    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    
    if (isServerPagination) {
      // For server pagination, consider page boundaries
      const currentServerPage = serverPage || 1;
      const isOnLastItemOfPage = currentIndex === filteredImages.length - 1;
      const isOnFirstItemOfPage = currentIndex === 0;
      const hasNextPage = currentServerPage < totalPages;
      const hasPrevPage = currentServerPage > 1;
      
      return {
        hasNext: !isOnLastItemOfPage || hasNextPage,
        hasPrevious: !isOnFirstItemOfPage || hasPrevPage
      };
    } else {
      // For client pagination, use existing logic
      return {
        hasNext: currentIndex < filteredImages.length - 1,
        hasPrevious: currentIndex > 0
      };
    }
  }, [activeLightboxMedia, filteredImages, isServerPagination, serverPage, totalPages]);

  const starredValue = useMemo(() => {
    const foundImage = filteredImages.find(img => img.id === activeLightboxMedia?.id);
    const starred = foundImage?.starred || false;
    return starred;
  }, [filteredImages, activeLightboxMedia?.id]);

  // Prefetch task data for adjacent items so navigation is instant
  const prefetchTaskData = usePrefetchTaskData();

  // Prefetch task data for previous and next items when lightbox opens or current item changes
  useEffect(() => {
    if (!activeLightboxMedia) return;

    const currentIndex = filteredImages.findIndex(img => img.id === activeLightboxMedia.id);
    if (currentIndex === -1) return;

    // Prefetch previous item
    if (currentIndex > 0) {
      const prevItem = filteredImages[currentIndex - 1];
      const prevGenerationId = getGenerationId(prevItem);
      if (prevGenerationId) {
        prefetchTaskData(prevGenerationId);
      }
    }

    // Prefetch next item
    if (currentIndex < filteredImages.length - 1) {
      const nextItem = filteredImages[currentIndex + 1];
      const nextGenerationId = getGenerationId(nextItem);
      if (nextGenerationId) {
        prefetchTaskData(nextGenerationId);
      }
    }

    // Prefetch current item too (in case it wasn't prefetched on hover)
    const currentGenerationId = getGenerationId(filteredImages[currentIndex]);
    if (currentGenerationId) {
      prefetchTaskData(currentGenerationId);
    }
  }, [activeLightboxMedia, filteredImages, prefetchTaskData]);

  // Get query client for direct cache access
  const queryClient = useQueryClient();
  
  // Subscribe to cache updates to force re-render when starred changes
  const [cacheVersion, setCacheVersion] = React.useState(0);
  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Only trigger on mutations that might affect starred state
      if (event.type === 'updated' && event.query.queryKey[0] === unifiedGenerationQueryKeys.all[0]) {
        setCacheVersion(v => v + 1);
      }
    });
    return unsubscribe;
  }, [queryClient]);
  
  // Enhance media object with starred field - subscribe to React Query cache for real-time updates
  const enhancedMedia = useMemo(() => {
    if (!activeLightboxMedia) return null;
    void cacheVersion;
    
    // First, try to find in filteredImages (normal case)
    let foundImage = filteredImages.find(img => img.id === activeLightboxMedia.id);
    
    // If not found or starred is undefined, check React Query cache directly
    // This ensures we get the latest optimistically-updated values
    if (!foundImage || foundImage.starred === undefined) {
      const queries = queryClient.getQueriesData({ queryKey: unifiedGenerationQueryKeys.all });
      for (const [, data] of queries) {
        if (data && typeof data === 'object' && 'items' in data) {
          const cacheItem = (data as { items: GeneratedImageWithMetadata[] }).items.find((g: GeneratedImageWithMetadata) => g.id === activeLightboxMedia.id);
          if (cacheItem) {
            foundImage = cacheItem;
            break;
          }
        }
      }
    }
    
    const starred = foundImage?.starred || false;
    
    // Clean up internal flags from metadata before passing to MediaLightbox
    const { __autoEnterEditMode, ...cleanMetadata } = activeLightboxMedia.metadata || {};
    
    return {
      ...activeLightboxMedia,
      starred,
      metadata: cleanMetadata
    };
  }, [activeLightboxMedia, filteredImages, queryClient, cacheVersion]);

  const mediaForLightbox = useMemo<GenerationRow | undefined>(() => {
    if (!enhancedMedia) return undefined;
    return {
      ...enhancedMedia,
      location: enhancedMedia.location ?? enhancedMedia.url,
      timeline_frame: enhancedMedia.timeline_frame ?? undefined,
    } as unknown as GenerationRow;
  }, [enhancedMedia]);

  // Compute positioned/associated state from gallery source record (mirrors MediaGalleryItem logic)
  const sourceRecord = useMemo(() => {
    const found = filteredImages.find(img => img.id === activeLightboxMedia?.id);
    return found;
  }, [filteredImages, activeLightboxMedia?.id]);
  
  // Use lightboxSelectedShotId (the dropdown selection) instead of selectedShotIdLocal (the gallery filter)
  // This ensures the override updates when the user changes the shot in the lightbox dropdown
  const effectiveShotIdForOverride = lightboxSelectedShotId || (selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
  
  const positionedInSelectedShot = useMemo(() => {
    if (!sourceRecord || !effectiveShotIdForOverride) {
      return undefined;
    }
    
    let result: boolean;
    if (sourceRecord.shot_id === effectiveShotIdForOverride) {
      result = sourceRecord.position !== null && sourceRecord.position !== undefined;
      return result;
    }
    
    const shotAssociations = sourceRecord.all_shot_associations;
    if (Array.isArray(shotAssociations)) {
      const matchedAssociation = shotAssociations.find(assoc => assoc.shot_id === effectiveShotIdForOverride);
      result = !!(matchedAssociation && matchedAssociation.position !== null && matchedAssociation.position !== undefined);
      return result;
    }
    
    return false;
  }, [sourceRecord, effectiveShotIdForOverride]);
  
  const associatedWithoutPositionInSelectedShot = useMemo(() => {
    if (!sourceRecord || !effectiveShotIdForOverride) {
      return undefined;
    }
    
    let result: boolean;
    if (sourceRecord.shot_id === effectiveShotIdForOverride) {
      result = sourceRecord.position === null || sourceRecord.position === undefined;
      return result;
    }
    
    const shotAssociations = sourceRecord.all_shot_associations;
    if (Array.isArray(shotAssociations)) {
      const matchedAssociation = shotAssociations.find(assoc => assoc.shot_id === effectiveShotIdForOverride);
      result = !!(matchedAssociation && (matchedAssociation.position === null || matchedAssociation.position === undefined));
      return result;
    }
    
    return false;
  }, [sourceRecord, effectiveShotIdForOverride]);

  // Handle navigation to a specific generation by ID
  const handleNavigateToGeneration = React.useCallback((generationId: string) => {
    
    // Find the generation in the filtered images
    const index = filteredImages.findIndex(img => img.id === generationId);
    
    if (index !== -1) {
      
      if (setActiveLightboxIndex) {
        setActiveLightboxIndex(index);
      } else {
        handleError(new Error('setActiveLightboxIndex is not available'), { context: 'handleNavigateToGeneration' });
      }
    } else {
      handleError(new Error(`Generation ${generationId.substring(0, 8)} not found in current filtered set (${filteredImages.length} items)`), { context: 'handleNavigateToGeneration' });
      // External generation IDs are handled via handleOpenExternalGeneration.
    }
  }, [filteredImages, setActiveLightboxIndex]);

  // Handle opening external generation (not in current filtered list)
  const handleOpenExternalGeneration = React.useCallback(async (generationId: string, _derivedContext?: string[]) => {

    // First try to find in current filtered images
    const index = filteredImages.findIndex(img => img.id === generationId);
    if (index !== -1 && setActiveLightboxIndex) {
      setActiveLightboxIndex(index);
      return;
    }

    // Not in filtered images, fetch from Supabase and open it directly

    try {
      const { data, error } = await supabase
        .from('generations')
        .select(`
          *,
          shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
        `)
        .eq('id', generationId)
        .single();

      if (error) throw error;

      if (data) {

        // Transform to GeneratedImageWithMetadata format
        // Database uses 'params' field for metadata
        // Type the raw Supabase row with fields we access
        const row = data as Record<string, unknown>;
        const params = (row.params as Record<string, unknown>) || {};
        const basedOnValue = (row.based_on as string | null) || (params?.based_on as string | null) || null;
        const shotGenerations = (row.shot_generations as Array<{ shot_id: string; timeline_frame: number | null }>) || [];

        // Database fields: location (full image), thumbnail_url (thumb)
        const imageUrl = (row.location as string) || (row.thumbnail_url as string);
        const thumbUrl = (row.thumbnail_url as string) || (row.location as string);

        const transformedData: GeneratedImageWithMetadata = {
          id: data.id,
          url: imageUrl,
          thumbUrl,
          prompt: (params?.prompt as string) || '',
          metadata: params as GeneratedImageWithMetadata['metadata'],
          createdAt: data.created_at,
          starred: data.starred || false,
          isVideo: !!(row.video_url),
          // Include based_on for lineage navigation
          based_on: basedOnValue,
          // Add shot associations
          shot_id: shotGenerations[0]?.shot_id,
        };
        
        // Check if already in filtered images (e.g., from a previous navigation)
        const existingIndex = filteredImages.findIndex(img => img.id === transformedData.id);
        if (existingIndex !== -1) {
          // Already exists, just navigate to it
          if (setActiveLightboxIndex) {
            setActiveLightboxIndex(existingIndex);
          }
        } else {
          // Add to filtered images temporarily so navigation works
          // Note: This modifies the array in place, which is not ideal but works within
          // the current architecture. A better solution would be to pass a dedicated
          // callback for opening external generations.
          filteredImages.push(transformedData);
          
          // Navigate to the newly added item (last index)
          if (setActiveLightboxIndex) {
            setActiveLightboxIndex(filteredImages.length - 1);
          }
        }
      } else {
        toast.error('Generation not found');
      }
    } catch (error) {
      handleError(error, { context: 'MediaGalleryLightbox', toastTitle: 'Failed to load generation' });
    }
  }, [filteredImages, setActiveLightboxIndex]);


  return (
    <>
      {/* Main Lightbox Modal */}
      {enhancedMedia && (
        <MediaLightbox
          media={mediaForLightbox}
          autoEnterInpaint={effectiveAutoEnterEditMode}
          onClose={() => {
            // Reset dropdown to current shot when closing
            setLightboxSelectedShotId(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
            onClose();
          }}
          onNext={onNext}
          onPrevious={onPrevious}
          showNavigation={true}
          showImageEditTools={!((activeLightboxMedia?.type || '').includes('video'))}
          showDownload={true}
          showMagicEdit={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          allShots={simplifiedShotOptions}
          selectedShotId={lightboxSelectedShotId || (selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined)}
          shotId={selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined}
          onShotChange={(shotId) => {
            setLightboxSelectedShotId(shotId);
            onShotChange(shotId);
          }}
          onAddToShot={onAddToShot}
          onAddToShotWithoutPosition={onAddToShotWithoutPosition}
          onDelete={onDelete}
          isDeleting={typeof isDeleting === 'string' || isDeleting == null ? isDeleting : undefined}
          onApplySettings={onApplySettings}
          showTickForImageId={showTickForImageId}
          onShowTick={setShowTickForImageId}
          showTickForSecondaryImageId={showTickForSecondaryImageId}
          onShowSecondaryTick={setShowTickForSecondaryImageId}
          optimisticPositionedIds={optimisticPositionedIds}
          optimisticUnpositionedIds={optimisticUnpositionedIds}
          onOptimisticPositioned={onOptimisticPositioned}
          onOptimisticUnpositioned={onOptimisticUnpositioned}
          starred={starredValue}
          onMagicEdit={(imageUrl, prompt, numImages) => {
            handleError(new Error('Magic edit action is not wired in MediaGalleryLightbox'), {
              context: 'MediaGalleryLightbox.onMagicEdit',
              showToast: false,
              logData: { imageUrl, prompt, numImages },
            });
          }}
          // Task details functionality - now shown on all devices including mobile
          showTaskDetails={true}
          taskDetailsData={{
            task: task ?? null,
            isLoading: isLoadingTask ?? false,
            error: taskError ?? null,
            inputImages: inputImages ?? [],
            taskId: lightboxTaskMapping?.taskId || null,
            onApplySettingsFromTask: undefined,
            onClose: onClose
          }}
          onShowTaskDetails={isMobile ? onShowTaskDetails : undefined}
          onCreateShot={onCreateShot}
          onNavigateToShot={onNavigateToShot}
          toolTypeOverride={toolTypeOverride}
          positionedInSelectedShot={positionedInSelectedShot}
          associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
          onNavigateToGeneration={handleNavigateToGeneration}
          onOpenExternalGeneration={handleOpenExternalGeneration}
        />
      )}

      {/* Mobile Task Details Modal */}
      {selectedImageForDetails && showTaskDetailsModal && (
        <TaskDetailsModal
          open={showTaskDetailsModal}
          onOpenChange={(open) => {
            if (!open) {
              setShowTaskDetailsModal(false);
              setSelectedImageForDetails(null);
            }
          }}
          generationId={selectedImageForDetails.id}
        />
      )}
    </>
  );
};
