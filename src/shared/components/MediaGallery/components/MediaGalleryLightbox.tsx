import React, { useEffect, useMemo, useState } from "react";
import MediaLightbox, { type MediaLightboxProps } from "@/shared/components/MediaLightbox/MediaLightbox";
import TaskDetailsModal from '@/shared/components/TaskDetailsModal';
import { GenerationRow, Shot } from "@/domains/generation/types";
import { Task } from "@/types/tasks";
import type { GeneratedImageWithMetadata } from '../types';
import type { LightboxActionHandlers } from '@/shared/components/MediaLightbox/types';
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
  onDelete?: LightboxActionHandlers['onDelete'];
  isDeleting?: LightboxActionHandlers['isDeleting'];
  onApplySettings?: LightboxActionHandlers['onApplySettings'];
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

export interface LightboxSessionModel {
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

interface MediaGalleryLightboxProps {
  session: LightboxSessionModel;
}

export const MediaGalleryLightbox: React.FC<MediaGalleryLightboxProps> = ({
  session,
}) => {
  const {
    core,
    navigation,
    actions,
    shotWorkflow,
    ui,
    optimistic,
    taskModal,
    taskData,
    integration,
  } = session;
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

  // Build lightbox media from explicit gallery state only (no cache side-channel subscriptions).
  const enhancedMedia = useMemo(() => {
    if (!activeLightboxMedia) return null;
    const sourceMedia = filteredImages.find((img) => img.id === activeLightboxMedia.id) ?? activeLightboxMedia;
    const sourceMetadata = sourceMedia.metadata ?? activeLightboxMedia.metadata ?? {};
    const { __autoEnterEditMode, ...cleanMetadata } = sourceMetadata;

    return {
      ...activeLightboxMedia,
      ...sourceMedia,
      starred: sourceMedia.starred ?? activeLightboxMedia.starred ?? false,
      // Internal-only metadata flags do not cross the lightbox boundary.
      metadata: cleanMetadata,
    };
  }, [activeLightboxMedia, filteredImages]);

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

  const lightboxProps = useMemo<MediaLightboxProps | null>(() => {
    if (!enhancedMedia) {
      return null;
    }

    return {
      media: mediaForLightbox,
      onClose: () => {
        setLightboxSelectedShotId(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
        onClose();
      },
      shotId: selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined,
      toolTypeOverride,
      onNext,
      onPrevious,
      showNavigation: true,
      hasNext,
      hasPrevious,
      onNavigateToGeneration: handleNavigateToGeneration,
      onOpenExternalGeneration: handleOpenExternalGeneration,
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
      onDelete,
      isDeleting,
      onApplySettings,
      starred: enhancedMedia.starred ?? false,
      showTaskDetails: true,
      taskDetailsData: taskDetailsPayload,
      onShowTaskDetails: isMobile ? onShowTaskDetails : undefined,
      showTickForImageId,
      onShowTick: setShowTickForImageId,
      showTickForSecondaryImageId,
      onShowSecondaryTick: setShowTickForSecondaryImageId,
      optimisticPositionedIds,
      optimisticUnpositionedIds,
      onOptimisticPositioned,
      onOptimisticUnpositioned,
      showImageEditTools: !((activeLightboxMedia?.type || '').includes('video')),
      showDownload: true,
      showMagicEdit: false,
      initialEditActive: effectiveAutoEnterEditMode,
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
      {lightboxProps && (
        <MediaLightbox {...lightboxProps} />
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
