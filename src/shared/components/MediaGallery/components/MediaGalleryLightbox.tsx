import React, { useMemo, useState } from "react";
import { MediaLightbox } from "@/domains/media-lightbox/MediaLightbox";
import { TaskDetailsModal } from '@/shared/components/TaskDetails/TaskDetailsModal';
import { GenerationRow, Shot } from "@/domains/generation/types";
import { Task } from "@/types/tasks";
import type { GeneratedImageWithMetadata } from '../types';
import type { LightboxActionHandlers } from '@/domains/media-lightbox/types';
import {
  buildTaskDetailsPayload,
  useGenerationNavigationController,
  useLightboxNavigationState,
  useShotAssociationState,
} from '../hooks/useMediaGalleryLightboxControllers';

export interface MediaGalleryLightboxSession {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  autoEnterEditMode?: boolean;
  onClose: () => void;
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
  onNext: () => void;
  onPrevious: () => void;
  onDelete?: LightboxActionHandlers['onDelete'];
  isDeleting?: LightboxActionHandlers['isDeleting'];
  onApplySettings?: LightboxActionHandlers['onApplySettings'];
  simplifiedShotOptions: { id: string; name: string }[];
  selectedShotIdLocal: string;
  onShotChange: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  showTickForImageId: string | null;
  setShowTickForImageId: (id: string | null) => void;
  showTickForSecondaryImageId?: string | null;
  setShowTickForSecondaryImageId?: (id: string | null) => void;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  isMobile: boolean;
  showTaskDetailsModal: boolean;
  setShowTaskDetailsModal: (show: boolean) => void;
  selectedImageForDetails: GeneratedImageWithMetadata | null;
  setSelectedImageForDetails: (image: GeneratedImageWithMetadata | null) => void;
  onShowTaskDetails?: () => void;
  task?: Task | null;
  isLoadingTask?: boolean;
  taskError?: Error | null;
  inputImages?: string[];
  lightboxTaskMapping?: { taskId: string | null };
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  onNavigateToShot?: (shot: Shot) => void;
  toolTypeOverride?: string;
  setActiveLightboxIndex?: (index: number) => void;
}

interface MediaGalleryLightboxProps {
  session: MediaGalleryLightboxSession;
}

export const MediaGalleryLightbox: React.FC<MediaGalleryLightboxProps> = ({
  session,
}) => {
  const {
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
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    isMobile,
    showTaskDetailsModal,
    setShowTaskDetailsModal,
    selectedImageForDetails,
    setSelectedImageForDetails,
    onShowTaskDetails,
    task,
    isLoadingTask,
    taskError,
    inputImages,
    lightboxTaskMapping,
    onCreateShot,
    onNavigateToShot,
    toolTypeOverride,
    setActiveLightboxIndex,
  } = session;
  
  // Local shot override is intentionally separate from parent gallery filters.
  const [lightboxShotOverrideId, setLightboxShotOverrideId] = useState<string | null>(null);
  const selectedShotIdFromGallery = selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined;

  const effectiveAutoEnterEditMode = useMemo(() => {
    const fromMetadata = activeLightboxMedia?.metadata?.__autoEnterEditMode as boolean | undefined;
    return fromMetadata ?? autoEnterEditMode ?? false;
  }, [activeLightboxMedia?.metadata?.__autoEnterEditMode, autoEnterEditMode]);

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
  
  const selectedShotIdForLightbox = lightboxShotOverrideId ?? selectedShotIdFromGallery;
  const effectiveShotIdForOverride = selectedShotIdForLightbox;
  
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

  const handleLightboxClose = () => {
    setLightboxShotOverrideId(null);
    onClose();
  };

  const handleLightboxShotChange = (shotId: string) => {
    setLightboxShotOverrideId(shotId);
    onShotChange(shotId);
  };

  return (
    <>
      {/* Main Lightbox Modal */}
      {enhancedMedia && (
        <MediaLightbox
          media={mediaForLightbox}
          onClose={handleLightboxClose}
          shotId={selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined}
          toolTypeOverride={toolTypeOverride}
          navigation={{
            onNext,
            onPrevious,
            showNavigation: true,
            hasNext,
            hasPrevious,
          }}
          onNavigateToGeneration={handleNavigateToGeneration}
          onOpenExternalGeneration={handleOpenExternalGeneration}
          shotWorkflow={{
            allShots: simplifiedShotOptions,
            selectedShotId: selectedShotIdForLightbox,
            onShotChange: handleLightboxShotChange,
            onAddToShot,
            onAddToShotWithoutPosition,
            onCreateShot,
            onNavigateToShot,
            positionedInSelectedShot,
            associatedWithoutPositionInSelectedShot,
            onShowTick: setShowTickForImageId,
            onShowSecondaryTick: setShowTickForSecondaryImageId,
            optimisticPositionedIds,
            optimisticUnpositionedIds,
            onOptimisticPositioned,
            onOptimisticUnpositioned,
          }}
          actions={{
            onDelete,
            isDeleting,
            onApplySettings,
            starred: enhancedMedia.starred ?? false,
          }}
          features={{
            showTaskDetails: true,
            showImageEditTools: !((activeLightboxMedia?.type || '').includes('video')),
            showDownload: true,
            showMagicEdit: false,
            initialEditActive: effectiveAutoEnterEditMode,
          }}
          taskDetailsData={taskDetailsPayload}
          showTickForImageId={showTickForImageId}
          showTickForSecondaryImageId={showTickForSecondaryImageId}
          videoProps={{ onShowTaskDetails: isMobile ? onShowTaskDetails : undefined }}
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
