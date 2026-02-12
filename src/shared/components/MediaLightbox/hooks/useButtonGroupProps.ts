/**
 * useButtonGroupProps Hook
 *
 * Centralizes the props for all four button group components (TopLeft, TopRight,
 * BottomLeft, BottomRight) to ensure consistency across layout branches.
 *
 * This prevents prop divergence bugs where one layout branch gets updated
 * but others don't.
 */

import { useMemo } from 'react';

interface UseButtonGroupPropsParams {
  // Shared base props
  isVideo: boolean;
  readOnly: boolean;
  isSpecialEditMode: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;
  mediaId: string;

  // TopLeft & BottomLeft - Edit mode
  handleEnterMagicEditMode: () => void;

  // TopRight - Download & Delete
  // NOTE: handleDownload is optional here because it requires media-specific logic
  // (variant selection, content type). Parent components (ImageLightbox/VideoLightbox)
  // MUST provide it when building the final buttonGroupProps.
  showDownload: boolean;
  handleDownload?: () => Promise<void>;
  isDownloading: boolean;
  onDelete?: (id: string) => void;
  handleDelete?: () => void;
  isDeleting?: string | null;
  onClose: () => void;

  // BottomLeft - Upscale
  isUpscaling: boolean;
  handleUpscale: () => Promise<void>;

  // BottomRight - Star & References
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending: boolean;
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
  handleAddToJoin?: () => void;
  isAddingToJoin?: boolean;
  addToJoinSuccess?: boolean;
  onGoToJoin?: () => void;
}

export function useButtonGroupProps({
  // Shared base props
  isVideo,
  readOnly,
  isSpecialEditMode,
  selectedProjectId,
  isCloudMode,
  mediaId,

  // TopLeft & BottomLeft
  handleEnterMagicEditMode,

  // TopRight
  showDownload,
  handleDownload,
  isDownloading,
  onDelete,
  handleDelete,
  isDeleting,
  onClose,

  // BottomLeft - Upscale
  isUpscaling,
  handleUpscale,

  // BottomRight
  localStarred,
  handleToggleStar,
  toggleStarPending,
  isAddingToReferences,
  addToReferencesSuccess,
  handleAddToReferences,
  handleAddToJoin,
  isAddingToJoin,
  addToJoinSuccess,
  onGoToJoin,
}: UseButtonGroupPropsParams) {
  return useMemo(() => ({
    topLeft: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      handleEnterMagicEditMode,
    },

    topRight: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      showDownload,
      handleDownload,
      isDownloading,
      onDelete,
      handleDelete,
      isDeleting,
      mediaId,
      onClose,
    },

    bottomLeft: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      handleEnterMagicEditMode,
      isUpscaling,
      handleUpscale,
      // Star button (moved from bottomRight)
      localStarred,
      handleToggleStar,
      toggleStarPending,
    },

    bottomRight: {
      isVideo,
      readOnly,
      isSpecialEditMode,
      selectedProjectId,
      isCloudMode,
      localStarred,
      handleToggleStar,
      toggleStarPending,
      isAddingToReferences,
      addToReferencesSuccess,
      handleAddToReferences,
      handleAddToJoin,
      isAddingToJoin,
      addToJoinSuccess,
      onGoToJoin,
    },
  }), [
    isVideo,
    readOnly,
    isSpecialEditMode,
    selectedProjectId,
    isCloudMode,
    mediaId,
    handleEnterMagicEditMode,
    showDownload,
    handleDownload,
    isDownloading,
    onDelete,
    handleDelete,
    isDeleting,
    onClose,
    isUpscaling,
    handleUpscale,
    localStarred,
    handleToggleStar,
    toggleStarPending,
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
    handleAddToJoin,
    isAddingToJoin,
    addToJoinSuccess,
    onGoToJoin,
  ]);
}
