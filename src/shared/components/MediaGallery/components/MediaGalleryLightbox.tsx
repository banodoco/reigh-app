import React, { useEffect, useMemo, useState } from "react";
import MediaLightbox from "@/shared/components/MediaLightbox/MediaLightbox";
import TaskDetailsModal from '@/shared/components/TaskDetails/TaskDetailsModal';
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

  const selectedShotIdForLightbox = lightboxSelectedShotId
    || (selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);

  const handleLightboxClose = () => {
    setLightboxSelectedShotId(selectedShotIdLocal !== 'all' ? selectedShotIdLocal : undefined);
    onClose();
  };

  const handleLightboxShotChange = (shotId: string) => {
    setLightboxSelectedShotId(shotId);
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
          onNext={onNext}
          onPrevious={onPrevious}
          showNavigation={true}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
          onNavigateToGeneration={handleNavigateToGeneration}
          onOpenExternalGeneration={handleOpenExternalGeneration}
          allShots={simplifiedShotOptions}
          selectedShotId={selectedShotIdForLightbox}
          onShotChange={handleLightboxShotChange}
          onAddToShot={onAddToShot}
          onAddToShotWithoutPosition={onAddToShotWithoutPosition}
          onCreateShot={onCreateShot}
          onNavigateToShot={onNavigateToShot}
          positionedInSelectedShot={positionedInSelectedShot}
          associatedWithoutPositionInSelectedShot={associatedWithoutPositionInSelectedShot}
          onDelete={onDelete}
          isDeleting={isDeleting}
          onApplySettings={onApplySettings}
          starred={enhancedMedia.starred ?? false}
          showTaskDetails={true}
          taskDetailsData={taskDetailsPayload}
          onShowTaskDetails={isMobile ? onShowTaskDetails : undefined}
          showTickForImageId={showTickForImageId}
          onShowTick={setShowTickForImageId}
          showTickForSecondaryImageId={showTickForSecondaryImageId}
          onShowSecondaryTick={setShowTickForSecondaryImageId}
          optimisticPositionedIds={optimisticPositionedIds}
          optimisticUnpositionedIds={optimisticUnpositionedIds}
          onOptimisticPositioned={onOptimisticPositioned}
          onOptimisticUnpositioned={onOptimisticUnpositioned}
          showImageEditTools={!((activeLightboxMedia?.type || '').includes('video'))}
          showDownload={true}
          showMagicEdit={false}
          initialEditActive={effectiveAutoEnterEditMode}
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
