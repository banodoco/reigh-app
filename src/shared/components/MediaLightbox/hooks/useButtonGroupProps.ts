import { useMemo } from 'react';

interface SharedButtonGroupContext {
  isVideo: boolean;
  readOnly: boolean;
  isSpecialEditMode: boolean;
  selectedProjectId: string | undefined;
  isCloudMode: boolean;
}

interface TopLeftButtonGroupInput {
  handleEnterMagicEditMode: () => void;
}

interface TopRightButtonGroupInput {
  showDownload: boolean;
  handleDownload?: () => Promise<void>;
  isDownloading: boolean;
  onDelete?: (id: string) => void;
  handleDelete?: () => void;
  isDeleting?: string | null;
  onClose: () => void;
}

interface BottomLeftButtonGroupInput {
  handleEnterMagicEditMode: () => void;
  isUpscaling: boolean;
  handleUpscale: () => Promise<void>;
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending: boolean;
}

interface BottomRightButtonGroupInput {
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

interface UseButtonGroupPropsParams {
  shared: SharedButtonGroupContext;
  mediaId: string;
  topLeft: TopLeftButtonGroupInput;
  topRight: TopRightButtonGroupInput;
  bottomLeft: BottomLeftButtonGroupInput;
  bottomRight: BottomRightButtonGroupInput;
}

function buildTopLeftProps(
  shared: SharedButtonGroupContext,
  input: TopLeftButtonGroupInput,
) {
  return {
    isVideo: shared.isVideo,
    readOnly: shared.readOnly,
    isSpecialEditMode: shared.isSpecialEditMode,
    selectedProjectId: shared.selectedProjectId,
    isCloudMode: shared.isCloudMode,
    handleEnterMagicEditMode: input.handleEnterMagicEditMode,
  };
}

function buildTopRightProps(
  shared: SharedButtonGroupContext,
  mediaId: string,
  input: TopRightButtonGroupInput,
) {
  return {
    isVideo: shared.isVideo,
    readOnly: shared.readOnly,
    isSpecialEditMode: shared.isSpecialEditMode,
    selectedProjectId: shared.selectedProjectId,
    isCloudMode: shared.isCloudMode,
    showDownload: input.showDownload,
    handleDownload: input.handleDownload,
    isDownloading: input.isDownloading,
    onDelete: input.onDelete,
    handleDelete: input.handleDelete,
    isDeleting: input.isDeleting,
    mediaId,
    onClose: input.onClose,
  };
}

function buildBottomLeftProps(
  shared: SharedButtonGroupContext,
  input: BottomLeftButtonGroupInput,
) {
  return {
    isVideo: shared.isVideo,
    readOnly: shared.readOnly,
    isSpecialEditMode: shared.isSpecialEditMode,
    selectedProjectId: shared.selectedProjectId,
    isCloudMode: shared.isCloudMode,
    handleEnterMagicEditMode: input.handleEnterMagicEditMode,
    isUpscaling: input.isUpscaling,
    handleUpscale: input.handleUpscale,
    localStarred: input.localStarred,
    handleToggleStar: input.handleToggleStar,
    toggleStarPending: input.toggleStarPending,
  };
}

function buildBottomRightProps(
  shared: SharedButtonGroupContext,
  input: BottomRightButtonGroupInput,
) {
  return {
    isVideo: shared.isVideo,
    readOnly: shared.readOnly,
    isSpecialEditMode: shared.isSpecialEditMode,
    selectedProjectId: shared.selectedProjectId,
    isCloudMode: shared.isCloudMode,
    localStarred: input.localStarred,
    handleToggleStar: input.handleToggleStar,
    toggleStarPending: input.toggleStarPending,
    isAddingToReferences: input.isAddingToReferences,
    addToReferencesSuccess: input.addToReferencesSuccess,
    handleAddToReferences: input.handleAddToReferences,
    handleAddToJoin: input.handleAddToJoin,
    isAddingToJoin: input.isAddingToJoin,
    addToJoinSuccess: input.addToJoinSuccess,
    onGoToJoin: input.onGoToJoin,
  };
}

export function useButtonGroupProps(params: UseButtonGroupPropsParams) {
  return useMemo(() => {
    return {
      topLeft: buildTopLeftProps(params.shared, params.topLeft),
      topRight: buildTopRightProps(params.shared, params.mediaId, params.topRight),
      bottomLeft: buildBottomLeftProps(params.shared, params.bottomLeft),
      bottomRight: buildBottomRightProps(params.shared, params.bottomRight),
    };
  }, [params]);
}

export type ButtonGroupProps = ReturnType<typeof useButtonGroupProps>;
