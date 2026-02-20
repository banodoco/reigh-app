import { useState, useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { GenerationRow } from '@/types/shots';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

interface UseBatchOperationsProps {
  currentImages: GenerationRow[];
  onImageDelete: (id: string) => void;
  onBatchImageDelete?: (ids: string[]) => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setMobileSelectedIds: Dispatch<SetStateAction<string[]>>;
  setLastSelectedIndex: (index: number | null) => void;
}

export function useBatchOperations({
  currentImages,
  onImageDelete,
  onBatchImageDelete,
  onSelectionChange,
  setSelectedIds,
  setMobileSelectedIds,
  setLastSelectedIndex
}: UseBatchOperationsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [skipConfirmationNextTimeVisual, setSkipConfirmationNextTimeVisual] = useState(false);
  const currentDialogSkipChoiceRef = useRef(false);
  const currentImageIdSet = useMemo(
    () => new Set(currentImages.map((image) => image.id)),
    [currentImages],
  );
  
  const { value: imageDeletionSettings, update: updateImageDeletionSettings } = 
    useUserUIState('imageDeletion', { skipConfirmation: false });
  const effectiveImageDeletionSettings = imageDeletionSettings ?? { skipConfirmation: false };
  
  // Sync visual state with database state when it loads
  useEffect(() => {
    if (effectiveImageDeletionSettings.skipConfirmation) {
      setSkipConfirmationNextTimeVisual(true);
      currentDialogSkipChoiceRef.current = true;
    }
  }, [effectiveImageDeletionSettings.skipConfirmation]);
  
  // Batch delete function
  const performBatchDelete = useCallback((ids: string[]) => {
    const existingIds = ids.filter((id) => currentImageIdSet.has(id));
    if (existingIds.length === 0) return;
    
    // Clear selection and UI state for immediate feedback
    setMobileSelectedIds([]);
    setSelectedIds([]);
    setLastSelectedIndex(null);
    setConfirmOpen(false);
    setPendingDeleteIds([]);
    onSelectionChange?.(false);
    
    // Use batch delete handler if available, otherwise fall back to individual deletes
    if (onBatchImageDelete) {
      onBatchImageDelete(existingIds);
    } else {
      existingIds.forEach(id => onImageDelete(id));
    }
  }, [onImageDelete, onBatchImageDelete, currentImageIdSet, setMobileSelectedIds, setSelectedIds, setLastSelectedIndex, onSelectionChange]);
  
  // Individual delete function that clears selection if needed
  const handleIndividualDelete = useCallback((id: string) => {
    if (!currentImageIdSet.has(id)) return;

    
    // Clear selection if the deleted item was selected
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    setMobileSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    
    // Execute deletion
    onImageDelete(id);
  }, [onImageDelete, currentImageIdSet, setSelectedIds, setMobileSelectedIds]);
  
  // Handle batch delete request
  const handleBatchDelete = useCallback((ids: string[]) => {
    setPendingDeleteIds([...ids]);
    
    if (effectiveImageDeletionSettings.skipConfirmation) {
      performBatchDelete(ids);
    } else {
      setConfirmOpen(true);
    }
  }, [effectiveImageDeletionSettings.skipConfirmation, performBatchDelete]);
  
  return {
    confirmOpen,
    setConfirmOpen,
    pendingDeleteIds,
    setPendingDeleteIds,
    skipConfirmationNextTimeVisual,
    currentDialogSkipChoiceRef,
    imageDeletionSettings: effectiveImageDeletionSettings,
    updateImageDeletionSettings,
    performBatchDelete,
    handleIndividualDelete,
    handleBatchDelete
  };
}
