import React, { useMemo } from "react";
import { MediaLightbox } from "@/domains/media-lightbox/MediaLightbox";
import { TaskDetailsModal } from '@/shared/components/TaskDetails/TaskDetailsModal';
import { GenerationRow, Shot } from "@/domains/generation/types";
import { Task } from "@/types/tasks";
import type { GeneratedImageWithMetadata } from '../types';
import type { LightboxActionHandlers } from '@/domains/media-lightbox/types';
import type { TaskDetailsData } from '@/shared/lib/taskDetails/taskDetailsContract';

export interface MediaGalleryLightboxSession {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  lightboxMedia: GenerationRow | null;
  autoEnterEditMode?: boolean;
  onClose: () => void;
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
  handleNavigateToGeneration: (generationId: string) => void;
  handleOpenExternalGeneration: (generationId: string, derivedContext?: string[]) => Promise<void>;
  onDelete?: LightboxActionHandlers['onDelete'];
  isDeleting?: LightboxActionHandlers['isDeleting'];
  onApplySettings?: LightboxActionHandlers['onApplySettings'];
  simplifiedShotOptions: { id: string; name: string }[];
  selectedShotIdLocal: string;
  selectedShotIdForLightbox?: string;
  onShotChange: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
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
  taskDetailsData: TaskDetailsData | null;
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
    lightboxMedia,
    autoEnterEditMode = false,
    onClose,
    onNext,
    onPrevious,
    hasNext,
    hasPrevious,
    handleNavigateToGeneration,
    handleOpenExternalGeneration,
    onDelete,
    isDeleting,
    onApplySettings,
    simplifiedShotOptions,
    selectedShotIdLocal,
    selectedShotIdForLightbox,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
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
    taskDetailsData,
    onCreateShot,
    onNavigateToShot,
    toolTypeOverride,
  } = session;

  const effectiveAutoEnterEditMode = useMemo(() => {
    const fromMetadata = activeLightboxMedia?.metadata?.__autoEnterEditMode as boolean | undefined;
    return fromMetadata ?? autoEnterEditMode ?? false;
  }, [activeLightboxMedia?.metadata?.__autoEnterEditMode, autoEnterEditMode]);

  return (
    <>
      {/* Main Lightbox Modal */}
      {lightboxMedia && (
        <MediaLightbox
          media={lightboxMedia}
          onClose={onClose}
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
            onShotChange,
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
            starred: lightboxMedia.starred ?? false,
          }}
          features={{
            showTaskDetails: true,
            showImageEditTools: !((activeLightboxMedia?.type || '').includes('video')),
            showDownload: true,
            showMagicEdit: false,
            initialEditActive: effectiveAutoEnterEditMode,
          }}
          taskDetailsData={taskDetailsData ?? undefined}
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
