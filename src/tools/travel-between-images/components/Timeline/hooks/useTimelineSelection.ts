import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * useTimelineSelection - Multi-select functionality for Timeline
 *
 * Supports both desktop (click to toggle) and tablet (tap to toggle) interactions.
 * Selection does NOT change item positions - only drag/move operations bundle selected items.
 *
 * Features:
 * - Click/tap to toggle selection (no modifier keys needed)
 * - Selection bar appears after 200ms delay when 1+ items selected
 * - Lock selection during drag operations
 * - Clear selection on demand
 */

interface UseTimelineSelectionProps {
  /** Whether selection is enabled (disabled in readOnly mode) */
  isEnabled: boolean;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
}

interface UseTimelineSelectionReturn {
  /** Currently selected item IDs */
  selectedIds: string[];
  /** Whether to show the selection action bar (delayed by 200ms) */
  showSelectionBar: boolean;
  /** Check if a specific item is selected */
  isSelected: (id: string) => boolean;
  /** Toggle selection for an item (add if not selected, remove if selected) */
  toggleSelection: (id: string) => void;
  /** Add an item to selection */
  addToSelection: (id: string) => void;
  /** Remove an item from selection */
  removeFromSelection: (id: string) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select multiple items at once */
  setSelection: (ids: string[]) => void;
  /** Lock selection (prevent changes during drag) */
  lockSelection: () => void;
  /** Unlock selection */
  unlockSelection: () => void;
  /** Whether selection is currently locked */
  isLocked: boolean;
}

export const useTimelineSelection = ({
  isEnabled,
  onSelectionChange,
}: UseTimelineSelectionProps): UseTimelineSelectionReturn => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  // Use ref for lock state so callbacks always read the latest value
  // (avoids stale closure when toggleSelection fires between unlock and React re-render)
  const isLockedRef = useRef(false);

  const selectionBarTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Show/hide selection bar with 200ms delay
  useEffect(() => {
    if (selectionBarTimerRef.current) {
      clearTimeout(selectionBarTimerRef.current);
    }

    if (selectedIds.length > 0 && isEnabled) {
      // Delay showing the bar by 200ms
      selectionBarTimerRef.current = setTimeout(() => {
        setShowSelectionBar(true);
      }, 200);
    } else {
      // Hide immediately when no selection
      setShowSelectionBar(false);
    }

    return () => {
      if (selectionBarTimerRef.current) {
        clearTimeout(selectionBarTimerRef.current);
      }
    };
  }, [selectedIds.length, isEnabled]);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [selectedIds, onSelectionChange]);

  // Clear selection when disabled
  useEffect(() => {
    if (!isEnabled && selectedIds.length > 0) {
      setSelectedIds([]);
    }
  }, [isEnabled, selectedIds.length]);

  const isSelected = useCallback((id: string): boolean => {
    return selectedIds.includes(id);
  }, [selectedIds]);

  const toggleSelection = useCallback((id: string) => {
    if (!isEnabled || isLockedRef.current) return;

    setSelectedIds(prev => {
      const isSelected = prev.includes(id);
      return isSelected ? prev.filter(s => s !== id) : [...prev, id];
    });
  }, [isEnabled]);

  const addToSelection = useCallback((id: string) => {
    if (!isEnabled || isLockedRef.current) return;

    setSelectedIds(prev => {
      if (prev.includes(id)) return prev;
      console.log('[TimelineSelection] Adding to selection:', id.substring(0, 8));
      return [...prev, id];
    });
  }, [isEnabled]);

  const removeFromSelection = useCallback((id: string) => {
    if (!isEnabled || isLockedRef.current) return;

    setSelectedIds(prev => {
      if (!prev.includes(id)) return prev;
      console.log('[TimelineSelection] Removing from selection:', id.substring(0, 8));
      return prev.filter(selectedId => selectedId !== id);
    });
  }, [isEnabled]);

  const clearSelection = useCallback(() => {
    console.log('[TimelineSelection] Clearing selection');
    setSelectedIds([]);
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    if (!isEnabled || isLockedRef.current) return;
    console.log('[TimelineSelection] Setting selection:', ids.map(id => id.substring(0, 8)));
    setSelectedIds(ids);
  }, [isEnabled]);

  const lockSelection = useCallback(() => {
    console.log('[TimelineSelection] Locking selection');
    isLockedRef.current = true;
  }, []);

  const unlockSelection = useCallback(() => {
    console.log('[TimelineSelection] Unlocking selection');
    isLockedRef.current = false;
  }, []);

  return {
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    addToSelection,
    removeFromSelection,
    clearSelection,
    setSelection,
    lockSelection,
    unlockSelection,
    isLocked: isLockedRef.current,
  };
};
