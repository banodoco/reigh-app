/**
 * useNameEditing - Manages shot name editing state and handlers
 *
 * Handles the inline name editing UI state and keyboard/mouse interactions.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ShotEditorActions } from '../../state/useShotEditorState';
import { Shot } from '@/domains/generation/types';

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
  const syncedShotIdRef = useRef<string | null>(selectedShot?.id ?? null);

  // Sync editor name from shot data.
  // Hard reset only when switching to a different shot; otherwise do not
  // interrupt an active inline edit for the same shot.
  useEffect(() => {
    const nextShotId = selectedShot?.id ?? null;
    const nextShotName = selectedShot?.name || '';

    if (syncedShotIdRef.current !== nextShotId) {
      syncedShotIdRef.current = nextShotId;
      actions.setEditingNameValue(nextShotName);
      actions.setEditingName(false);
      return;
    }

    if (!state.isEditingName) {
      actions.setEditingNameValue(nextShotName);
    }
  }, [selectedShot?.id, selectedShot?.name, state.isEditingName, actions]);

  const handleNameClick = useCallback(() => {
    if (onUpdateShotName) {
      actions.setEditingNameValue(selectedShot?.name || '');
      actions.setEditingName(true);
    }
  }, [onUpdateShotName, selectedShot?.name, actions]);

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
