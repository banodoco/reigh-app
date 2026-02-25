import { useState, useEffect, useCallback } from "react";
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GeneratedImageWithMetadata } from "../../MediaGallery/types";

interface UseMediaGalleryItemStateProps {
  image: GeneratedImageWithMetadata;
  onCreateShot?: (name: string, files: File[]) => Promise<void>;
}

interface UseMediaGalleryItemStateReturn {
  // Star state
  localStarred: boolean;
  setLocalStarred: (starred: boolean) => void;
  isTogglingStar: boolean;
  setIsTogglingStar: (toggling: boolean) => void;

  // UI state
  isInfoOpen: boolean;
  setIsInfoOpen: (open: boolean) => void;
  isShotSelectorOpen: boolean;
  setIsShotSelectorOpen: (open: boolean) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  settingsApplied: boolean;
  setSettingsApplied: (applied: boolean) => void;

  // Shot creation modal
  isCreateShotModalOpen: boolean;
  setIsCreateShotModalOpen: (open: boolean) => void;
  isCreatingShot: boolean;
  handleCreateShot: (name: string, files: File[]) => Promise<void>;
}

interface UseShotCreationStateArgs {
  onCreateShot?: (name: string, files: File[]) => Promise<void>;
}

function useShotCreationState({
  onCreateShot,
}: UseShotCreationStateArgs) {
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState<boolean>(false);
  const [isCreatingShot, setIsCreatingShot] = useState<boolean>(false);

  const handleCreateShot = useCallback(async (shotName: string, files: File[]) => {
    if (!onCreateShot) return;

    setIsCreatingShot(true);
    try {
      await onCreateShot(shotName, files);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'MediaGalleryItem.handleCreateShot',
        toastTitle: 'Error Creating Shot',
      });
    } finally {
      setIsCreatingShot(false);
    }
  }, [onCreateShot]);

  return {
    isCreateShotModalOpen,
    setIsCreateShotModalOpen,
    isCreatingShot,
    handleCreateShot,
  };
}

/**
 * Hook to consolidate local UI state for MediaGalleryItem
 */
export function useMediaGalleryItemState({
  image,
  onCreateShot,
}: UseMediaGalleryItemStateProps): UseMediaGalleryItemStateReturn {
  // Star state
  const [isTogglingStar, setIsTogglingStar] = useState<boolean>(false);
  const [localStarred, setLocalStarred] = useState<boolean>(image.starred ?? false);

  // Sync local starred state when image changes or when image.starred updates from parent
  useEffect(() => {
    setLocalStarred(image.starred ?? false);
  }, [image.id, image.starred]);

  // UI state
  const [isInfoOpen, setIsInfoOpen] = useState<boolean>(false);
  const [isShotSelectorOpen, setIsShotSelectorOpen] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [settingsApplied, setSettingsApplied] = useState<boolean>(false);

  const shotCreationState = useShotCreationState({ onCreateShot });

  return {
    // Star state
    localStarred,
    setLocalStarred,
    isTogglingStar,
    setIsTogglingStar,

    // UI state
    isInfoOpen,
    setIsInfoOpen,
    isShotSelectorOpen,
    setIsShotSelectorOpen,
    isDragging,
    setIsDragging,
    settingsApplied,
    setSettingsApplied,

    // Shot creation modal
    isCreateShotModalOpen: shotCreationState.isCreateShotModalOpen,
    setIsCreateShotModalOpen: shotCreationState.setIsCreateShotModalOpen,
    isCreatingShot: shotCreationState.isCreatingShot,
    handleCreateShot: shotCreationState.handleCreateShot,
  };
}
