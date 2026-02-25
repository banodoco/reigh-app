import React, { useEffect, useMemo, useState } from "react";
import { MediaLightboxFromAdapter, type MediaLightboxInputAdapter } from "@/shared/components/MediaLightbox";
import TaskDetailsModal from '@/shared/components/TaskDetailsModal';
import { GenerationRow, Shot } from "@/domains/generation/types";
import { Task } from "@/types/tasks";
import type { GeneratedImageWithMetadata } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import {
  buildTaskDetailsPayload,
  useGenerationNavigationController,
  useLightboxNavigationState,
  useShotAssociationState,
} from '../hooks/useMediaGalleryLightboxControllers';

interface MediaGalleryLightboxCoreContract {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  autoEnterEditMode?: boolean;
  onClose: () => void;
}

interface MediaGalleryLightboxNavigationContract {
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
}

interface MediaGalleryLightboxActionContract {
  onDelete?: (id: string) => Promise<void>;
  isDeleting?: string | boolean | null;
  onApplySettings?: (metadata: GenerationRow['metadata']) => void;
}

interface MediaGalleryLightboxShotWorkflowContract {
  simplifiedShotOptions: { id: string; name: string }[];
  selectedShotIdLocal: string;
  onShotChange: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
}

interface MediaGalleryLightboxUiStateContract {
  showTickForImageId: string | null;
  setShowTickForImageId: (id: string | null) => void;
  showTickForSecondaryImageId?: string | null;
  setShowTickForSecondaryImageId?: (id: string | null) => void;
}

interface MediaGalleryLightboxOptimisticContract {
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
}

interface MediaGalleryLightboxTaskModalContract {
  isMobile: boolean;
  showTaskDetailsModal: boolean;
  setShowTaskDetailsModal: (show: boolean) => void;
  selectedImageForDetails: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  onShowTaskDetails?: () => void;
}

interface MediaGalleryLightboxTaskDataContract {
  task?: Task | null;
  isLoadingTask?: boolean;
  taskError?: Error | null;
  inputImages?: string[];
  lightboxTaskMapping?: { taskId: string | null };
}

interface MediaGalleryLightboxIntegrationContract {
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  onNavigateToShot?: (shot: Shot) => void;
  toolTypeOverride?: string;
  setActiveLightboxIndex?: (index: number) => void;
}

interface MediaGalleryLightboxProps {
  core: MediaGalleryLightboxCoreContract;
  navigation: MediaGalleryLightboxNavigationContract;
  actions: MediaGalleryLightboxActionContract;
  shotWorkflow: MediaGalleryLightboxShotWorkflowContract;
  ui: MediaGalleryLightboxUiStateContract;
  optimistic?: MediaGalleryLightboxOptimisticContract;
  taskModal: MediaGalleryLightboxTaskModalContract;
  taskData: MediaGalleryLightboxTaskDataContract;
  integration: MediaGalleryLightboxIntegrationContract;
}

export const MediaGalleryLightbox: React.FC<MediaGalleryLightboxProps> = ({
  core,
  navigation,
  actions,
  shotWorkflow,
  ui,
  optimistic,
  taskModal,
  taskData,
  integration,
}) => {
  const {
    activeLightboxMedia,
    autoEnterEditMode = false,
    onClose,
  } = core;
  const {
    filteredImages,
    isServerPagination,
    serverPage,
    totalPages,
    onNext,
    onPrevious,
  } = navigation;
  const {
    onDelete,
    isDeleting,
    onApplySettings,
  } = actions;
  const {
    simplifiedShotOptions,
    selectedShotIdLocal,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
  } = shotWorkflow;
  const {
    showTickForImageId,
    setShowTickForImageId,
    showTickForSecondaryImageId,
    setShowTickForSecondaryImageId,
  } = ui;
  const {
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  } = optimistic ?? {};
  const {
    isMobile,
    showTaskDetailsModal,
    setShowTaskDetailsModal,
    selectedImageForDetails,
    setSelectedImageForDetails,
    onShowTaskDetails,
  } = taskModal;
  const {
    task,
    isLoadingTask,
    taskError,
    inputImages,
    lightboxTaskMapping,
  } = taskData;
  const {
    onCreateShot,
    onNavigateToShot,
    toolTypeOverride,
    setActiveLightboxIndex,
  } = integration;
  
  // Local shot selection is intentionally separate from parent gallery filters.
  const [lightboxSelectedShotId, setLightboxSelectedShotId] = useState<string | undefined>(
    selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined,
  );

  const effectiveAutoEnterEditMode = useMemo(() => {
    const fromMetadata = activeLightboxMedia?.metadata?.__autoEnterEditMode as boolean | undefined;
    return fromMetadata ?? autoEnterEditMode ?? false;
  }, [activeLightboxMedia?.metadata?.__autoEnterEditMode, autoEnterEditMode]);

  useEffect(() => {
    setLightboxSelectedShotId(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
  }, [selectedShotIdLocal]);

  const { hasNext, hasPrevious } = useLightboxNavigationState({
    activeLightboxMedia,
    filteredImages,
    isServerPagination,
    serverPage,
    totalPages,
  });

  // Get query client for direct cache access
  const queryClient = useQueryClient();
  
  // Subscribe to cache updates to force re-render when starred changes
  const [cacheVersion, setCacheVersion] = useState(0);
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
  
  const effectiveShotIdForOverride = lightboxSelectedShotId || (selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
  
  const {
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
  } = useShotAssociationState({
    sourceRecord,
    effectiveShotId: effectiveShotIdForOverride,
  });

  const {
    handleNavigateToGeneration,
    handleOpenExternalGeneration,
  } = useGenerationNavigationController({
    filteredImages,
    setActiveLightboxIndex,
  });

  const taskDetailsPayload = useMemo(() => buildTaskDetailsPayload({
    task,
    isLoadingTask,
    taskError,
    inputImages,
    taskId: lightboxTaskMapping?.taskId,
    onClose,
  }), [inputImages, isLoadingTask, lightboxTaskMapping?.taskId, onClose, task, taskError]);

  const lightboxAdapter = useMemo<MediaLightboxInputAdapter | null>(() => {
    if (!enhancedMedia) {
      return null;
    }

    return {
      core: {
        media: mediaForLightbox,
        onClose: () => {
          setLightboxSelectedShotId(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
          onClose();
        },
        shotId: selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined,
        toolTypeOverride,
      },
      navigation: {
        onNext,
        onPrevious,
        showNavigation: true,
        hasNext,
        hasPrevious,
        onNavigateToGeneration: handleNavigateToGeneration,
        onOpenExternalGeneration: handleOpenExternalGeneration,
      },
      shotWorkflow: {
        allShots: simplifiedShotOptions,
        selectedShotId: lightboxSelectedShotId || (selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined),
        onShotChange: (shotId) => {
          setLightboxSelectedShotId(shotId);
          onShotChange(shotId);
        },
        onAddToShot,
        onAddToShotWithoutPosition,
        onCreateShot,
        onNavigateToShot,
        positionedInSelectedShot,
        associatedWithoutPositionInSelectedShot,
      },
      actions: {
        onDelete,
        isDeleting: typeof isDeleting === 'string' || isDeleting == null ? isDeleting : undefined,
        onApplySettings,
        starred: enhancedMedia.starred ?? false,
        onMagicEdit: (imageUrl, prompt, numImages) => {
          normalizeAndPresentError(new Error('Magic edit action is not wired in MediaGalleryLightbox'), {
            context: 'MediaGalleryLightbox.onMagicEdit',
            showToast: false,
            logData: {
              imageUrl,
              prompt,
              numImages,
            },
          });
        },
      },
      taskDetails: {
        showTaskDetails: true,
        taskDetailsData: taskDetailsPayload,
        onShowTaskDetails: isMobile ? onShowTaskDetails : undefined,
      },
      visualState: {
        showTickForImageId,
        onShowTick: setShowTickForImageId,
        showTickForSecondaryImageId,
        onShowSecondaryTick: setShowTickForSecondaryImageId,
        optimisticPositionedIds,
        optimisticUnpositionedIds,
        onOptimisticPositioned,
        onOptimisticUnpositioned,
      },
      features: {
        showImageEditTools: !((activeLightboxMedia?.type || '').includes('video')),
        showDownload: true,
        showMagicEdit: true,
        initialEditActive: effectiveAutoEnterEditMode,
      },
    };
  }, [
    activeLightboxMedia?.type,
    associatedWithoutPositionInSelectedShot,
    enhancedMedia,
    effectiveAutoEnterEditMode,
    handleNavigateToGeneration,
    handleOpenExternalGeneration,
    hasNext,
    hasPrevious,
    isDeleting,
    isMobile,
    lightboxSelectedShotId,
    mediaForLightbox,
    onAddToShot,
    onAddToShotWithoutPosition,
    onApplySettings,
    onClose,
    onCreateShot,
    onNavigateToShot,
    onNext,
    onPrevious,
    onShotChange,
    onShowTaskDetails,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    positionedInSelectedShot,
    selectedShotIdLocal,
    setShowTickForImageId,
    setShowTickForSecondaryImageId,
    showTickForImageId,
    showTickForSecondaryImageId,
    simplifiedShotOptions,
    taskDetailsPayload,
    toolTypeOverride,
    onDelete,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  ]);


  return (
    <>
      {/* Main Lightbox Modal */}
      {lightboxAdapter && (
        <MediaLightboxFromAdapter adapter={lightboxAdapter} />
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
