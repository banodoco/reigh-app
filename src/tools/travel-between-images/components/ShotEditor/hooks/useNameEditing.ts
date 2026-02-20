/**
 * useNameEditing - Manages shot name editing state and handlers
 *
 * Handles the inline name editing UI state and keyboard/mouse interactions.
 */

import { useCallback, useEffect } from 'react';
import type { ShotEditorActions } from '../state/useShotEditorState';
import { Shot } from '@/types/shots';

interface UseNameEditingProps {
  selectedShot: Shot | undefined;
  state: {
    isEditingName: boolean;
    editingName: string;
  };
  actions: ShotEditorActions;
  onUpdateShotName?: (name: string) => void;
}

interface UseNameEditingReturn {
  handleNameClick: () => void;
  handleNameSave: () => void;
  handleNameCancel: (e?: React.MouseEvent) => void;
  handleNameKeyDown: (e: React.KeyboardEvent) => void;
}

export function useNameEditing({
  selectedShot,
  state,
  actions,
  onUpdateShotName,
}: UseNameEditingProps): UseNameEditingReturn {
  // Update editing name when selected shot changes
  useEffect(() => {
    actions.setEditingNameValue(selectedShot?.name || '');
    actions.setEditingName(false);
  }, [selectedShot?.id, selectedShot?.name, actions]);

  const handleNameClick = useCallback(() => {
    if (onUpdateShotName) {
      actions.setEditingName(true);
    }
  }, [onUpdateShotName, actions]);

  const handleNameSave = useCallback(() => {
    if (onUpdateShotName && state.editingName.trim() && state.editingName.trim() !== selectedShot?.name) {
      onUpdateShotName(state.editingName.trim());
    }
    actions.setEditingName(false);
  }, [onUpdateShotName, state.editingName, selectedShot?.name, actions]);

  const handleNameCancel = useCallback((e?: React.MouseEvent) => {
    // Prevent event propagation to avoid clicking elements that appear after layout change
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    actions.setEditingNameValue(selectedShot?.name || '');

    // Set transition flag to temporarily disable navigation buttons
    actions.setTransitioningFromNameEdit(true);

    // Add a small delay before hiding the editing mode to prevent click-through
    // to elements that appear in the same position
    setTimeout(() => {
      actions.setEditingName(false);
      // Clear transition flag after a slightly longer delay to ensure UI has settled
      setTimeout(() => {
        actions.setTransitioningFromNameEdit(false);
      }, 200);
    }, 100);
  }, [selectedShot?.name, actions]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  }, [handleNameSave, handleNameCancel]);

  return {
    handleNameClick,
    handleNameSave,
    handleNameCancel,
    handleNameKeyDown,
  };
}
