import { useMemo } from 'react';
import type { MediaGalleryLightboxSession } from '../components/MediaGalleryLightbox';

interface MediaGalleryLightboxSessionStateHook {
  state: {
    activeLightboxMedia: MediaGalleryLightboxSession['activeLightboxMedia'];
    autoEnterEditMode: boolean;
    selectedShotIdLocal: string;
    showTickForImageId: string | null;
    showTickForSecondaryImageId: string | null;
    optimisticPositionedIds: Set<string>;
    optimisticUnpositionedIds: Set<string>;
    showTaskDetailsModal: boolean;
    selectedImageForDetails: MediaGalleryLightboxSession['selectedImageForDetails'];
  };
  setShowTickForImageId: (id: string | null) => void;
  setShowTickForSecondaryImageId: (id: string | null) => void;
  setShowTaskDetailsModal: (show: boolean) => void;
  setSelectedImageForDetails: (
    image: MediaGalleryLightboxSession['selectedImageForDetails']
  ) => void;
  markOptimisticPositioned: (imageId: string, shotId: string) => void;
  markOptimisticUnpositioned: (imageId: string, shotId: string) => void;
}

interface MediaGalleryLightboxSessionActionsHook {
  handleCloseLightbox: MediaGalleryLightboxSession['onClose'];
  handleOptimisticDelete: NonNullable<MediaGalleryLightboxSession['onDelete']>;
  handleShotChange: NonNullable<MediaGalleryLightboxSession['onShotChange']>;
}

interface MediaGalleryLightboxSessionFiltersHook {
  filteredImages: MediaGalleryLightboxSession['filteredImages'];
}

interface MediaGalleryLightboxSessionPaginationHook {
  isServerPagination: boolean;
  totalPages: number;
}

interface UseMediaGalleryLightboxSessionParams {
  stateHook: MediaGalleryLightboxSessionStateHook;
  actionsHook: MediaGalleryLightboxSessionActionsHook;
  filtersHook: MediaGalleryLightboxSessionFiltersHook;
  paginationHook: MediaGalleryLightboxSessionPaginationHook;
  serverPage?: number;
  handleNextImage: () => void;
  handlePreviousImage: () => void;
  handleSetActiveLightboxIndex: (index: number) => void;
  lightboxDeletingId: string | null;
  onApplySettings?: MediaGalleryLightboxSession['onApplySettings'];
  simplifiedShotOptions: MediaGalleryLightboxSession['simplifiedShotOptions'];
  onAddToLastShot?: MediaGalleryLightboxSession['onAddToShot'];
  onAddToLastShotWithoutPosition?: MediaGalleryLightboxSession['onAddToShotWithoutPosition'];
  isMobile: boolean;
  task: MediaGalleryLightboxSession['task'];
  taskDetailsLoading: boolean;
  taskError: MediaGalleryLightboxSession['taskError'];
  inputImages: NonNullable<MediaGalleryLightboxSession['inputImages']>;
  lightboxTaskMapping: MediaGalleryLightboxSession['lightboxTaskMapping'];
  onCreateShot?: MediaGalleryLightboxSession['onCreateShot'];
  handleNavigateToShot: NonNullable<MediaGalleryLightboxSession['onNavigateToShot']>;
  handleShowTaskDetails: NonNullable<MediaGalleryLightboxSession['onShowTaskDetails']>;
  currentToolType?: string;
  showDelete: boolean;
}

export function useMediaGalleryLightboxSession(params: UseMediaGalleryLightboxSessionParams): MediaGalleryLightboxSession {
  const {
    stateHook,
    actionsHook,
    filtersHook,
    paginationHook,
    serverPage,
    handleNextImage,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    lightboxDeletingId,
    onApplySettings,
    simplifiedShotOptions,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    isMobile,
    task,
    taskDetailsLoading,
    taskError,
    inputImages,
    lightboxTaskMapping,
    onCreateShot,
    handleNavigateToShot,
    handleShowTaskDetails,
    currentToolType,
    showDelete,
  } = params;

  return useMemo<MediaGalleryLightboxSession>(() => ({
    activeLightboxMedia: stateHook.state.activeLightboxMedia,
    autoEnterEditMode: stateHook.state.autoEnterEditMode,
    onClose: actionsHook.handleCloseLightbox,
    filteredImages: filtersHook.filteredImages,
    isServerPagination: paginationHook.isServerPagination,
    serverPage,
    totalPages: paginationHook.totalPages,
    onNext: handleNextImage,
    onPrevious: handlePreviousImage,
    onDelete: showDelete ? actionsHook.handleOptimisticDelete : undefined,
    isDeleting: lightboxDeletingId,
    onApplySettings,
    simplifiedShotOptions,
    selectedShotIdLocal: stateHook.state.selectedShotIdLocal,
    onShotChange: actionsHook.handleShotChange,
    onAddToShot: onAddToLastShot,
    onAddToShotWithoutPosition: onAddToLastShotWithoutPosition,
    showTickForImageId: stateHook.state.showTickForImageId,
    setShowTickForImageId: stateHook.setShowTickForImageId,
    showTickForSecondaryImageId: stateHook.state.showTickForSecondaryImageId,
    setShowTickForSecondaryImageId: stateHook.setShowTickForSecondaryImageId,
    optimisticPositionedIds: stateHook.state.optimisticPositionedIds,
    optimisticUnpositionedIds: stateHook.state.optimisticUnpositionedIds,
    onOptimisticPositioned: stateHook.markOptimisticPositioned,
    onOptimisticUnpositioned: stateHook.markOptimisticUnpositioned,
    isMobile,
    showTaskDetailsModal: stateHook.state.showTaskDetailsModal,
    setShowTaskDetailsModal: stateHook.setShowTaskDetailsModal,
    selectedImageForDetails: stateHook.state.selectedImageForDetails,
    setSelectedImageForDetails: stateHook.setSelectedImageForDetails,
    onShowTaskDetails: handleShowTaskDetails,
    task,
    isLoadingTask: taskDetailsLoading,
    taskError,
    inputImages,
    lightboxTaskMapping,
    onCreateShot,
    onNavigateToShot: handleNavigateToShot,
    toolTypeOverride: currentToolType,
    setActiveLightboxIndex: handleSetActiveLightboxIndex,
  }), [
    actionsHook.handleCloseLightbox,
    actionsHook.handleOptimisticDelete,
    actionsHook.handleShotChange,
    currentToolType,
    filtersHook.filteredImages,
    handleNavigateToShot,
    handleNextImage,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    handleShowTaskDetails,
    inputImages,
    isMobile,
    lightboxDeletingId,
    lightboxTaskMapping,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onApplySettings,
    onCreateShot,
    paginationHook.isServerPagination,
    paginationHook.totalPages,
    serverPage,
    showDelete,
    simplifiedShotOptions,
    stateHook.markOptimisticPositioned,
    stateHook.markOptimisticUnpositioned,
    stateHook.setSelectedImageForDetails,
    stateHook.setShowTaskDetailsModal,
    stateHook.setShowTickForImageId,
    stateHook.setShowTickForSecondaryImageId,
    stateHook.state.activeLightboxMedia,
    stateHook.state.autoEnterEditMode,
    stateHook.state.optimisticPositionedIds,
    stateHook.state.optimisticUnpositionedIds,
    stateHook.state.selectedImageForDetails,
    stateHook.state.selectedShotIdLocal,
    stateHook.state.showTaskDetailsModal,
    stateHook.state.showTickForImageId,
    stateHook.state.showTickForSecondaryImageId,
    task,
    taskDetailsLoading,
    taskError,
  ]);
}
