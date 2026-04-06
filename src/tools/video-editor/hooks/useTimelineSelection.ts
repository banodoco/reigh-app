import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useDerivedTimeline } from '@/tools/video-editor/hooks/useDerivedTimeline';
import {
  useMultiSelect,
  type SelectClipOptions,
  type UseMultiSelectResult,
} from '@/tools/video-editor/hooks/useMultiSelect';
import type {
  TimelineResolvedConfig,
  TimelineSelectedClip,
  TimelineSelectedTrack,
  TimelineSetSelectedClipId,
} from '@/tools/video-editor/hooks/timeline-state-types';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';

export interface UseTimelineSelectionArgs {
  data: TimelineData | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  setSelectedClipId: TimelineSetSelectedClipId;
  clearGallerySelection: () => void;
  registerPeerClear: (clearPeerSelection: (() => void) | null) => void;
}

export interface UseTimelineSelectionResult {
  selectedClipIds: UseMultiSelectResult['selectedClipIds'];
  selectedClipIdsRef: UseMultiSelectResult['selectedClipIdsRef'];
  primaryClipId: UseMultiSelectResult['primaryClipId'];
  selectedClip: TimelineSelectedClip;
  selectedTrack: TimelineSelectedTrack;
  selectedClipHasPredecessor: boolean;
  resolvedConfig: TimelineResolvedConfig;
  addToSelection: UseMultiSelectResult['addToSelection'];
  clearSelection: UseMultiSelectResult['clearSelection'];
  isClipSelected: UseMultiSelectResult['isClipSelected'];
  pruneSelection: UseMultiSelectResult['pruneSelection'];
  selectClip: UseMultiSelectResult['selectClip'];
  selectClips: UseMultiSelectResult['selectClips'];
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
}

const getFirstSelectedClipId = (clipIds: ReadonlySet<string>): string | null => {
  for (const clipId of clipIds) {
    return clipId;
  }

  return null;
};

const getPrimaryClipId = (
  clipIds: ReadonlySet<string>,
  preferredClipId: string | null,
): string | null => {
  if (preferredClipId && clipIds.has(preferredClipId)) {
    return preferredClipId;
  }

  return getFirstSelectedClipId(clipIds);
};

export function useTimelineSelection({
  data,
  selectedClipId,
  selectedTrackId,
  setSelectedClipId: setSelectionState,
  clearGallerySelection,
  registerPeerClear,
}: UseTimelineSelectionArgs): UseTimelineSelectionResult {
  const multiSelect = useMultiSelect();
  const {
    addToSelection: addToSelectionState,
    clearSelection: clearSelectionState,
    isClipSelected,
    primaryClipId,
    pruneSelection,
    selectClip: selectClipState,
    selectClips: selectClipsState,
    selectedClipIds,
    selectedClipIdsRef,
  } = multiSelect;
  const selectionDerived = useDerivedTimeline(data, primaryClipId, selectedTrackId);

  const selectClip = useCallback((clipId: string, opts?: SelectClipOptions) => {
    if (!opts?.toggle) {
      clearGallerySelection();
    }

    let nextPrimaryClipId: string | null = clipId;

    if (opts?.toggle) {
      const nextSelection = new Set(selectedClipIdsRef.current);
      if (nextSelection.has(clipId)) {
        nextSelection.delete(clipId);
        nextPrimaryClipId = getPrimaryClipId(
          nextSelection,
          primaryClipId === clipId ? null : primaryClipId,
        );
      }
    }

    selectClipState(clipId, opts);
    setSelectionState(nextPrimaryClipId);
  }, [clearGallerySelection, primaryClipId, selectClipState, selectedClipIdsRef, setSelectionState]);

  const selectClips = useCallback((clipIds: Iterable<string>) => {
    clearGallerySelection();

    const nextSelection = new Set<string>();
    for (const clipId of clipIds) {
      nextSelection.add(clipId);
    }

    selectClipsState(nextSelection);
    setSelectionState(getPrimaryClipId(nextSelection, null));
  }, [clearGallerySelection, selectClipsState, setSelectionState]);

  const addToSelection = useCallback((clipIds: Iterable<string>) => {
    const nextSelection = new Set(selectedClipIdsRef.current);
    const nextClipIds = new Set<string>();
    for (const clipId of clipIds) {
      nextSelection.add(clipId);
      nextClipIds.add(clipId);
    }

    addToSelectionState(nextClipIds);
    setSelectionState(getPrimaryClipId(nextSelection, primaryClipId));
  }, [addToSelectionState, primaryClipId, selectedClipIdsRef, setSelectionState]);

  const clearSelection = useCallback(() => {
    clearGallerySelection();
    clearSelectionState();
    setSelectionState(null);
  }, [clearGallerySelection, clearSelectionState, setSelectionState]);

  const clearTimelineOnly = useCallback(() => {
    clearSelectionState();
    setSelectionState(null);
  }, [clearSelectionState, setSelectionState]);

  useEffect(() => {
    registerPeerClear(clearTimelineOnly);
    return () => {
      registerPeerClear(null);
    };
  }, [clearTimelineOnly, registerPeerClear]);

  const setSelectedClipId = useCallback<Dispatch<SetStateAction<string | null>>>((updater) => {
    const nextClipId = typeof updater === 'function'
      ? updater(primaryClipId)
      : updater;

    if (nextClipId === null) {
      clearSelection();
      return;
    }

    selectClip(nextClipId);
  }, [clearSelection, primaryClipId, selectClip]);

  useLayoutEffect(() => {
    if (!selectedClipId || selectedClipId === primaryClipId) {
      return;
    }

    clearGallerySelection();
    selectClipState(selectedClipId);
  }, [clearGallerySelection, primaryClipId, selectClipState, selectedClipId]);

  return {
    selectedClipIds,
    selectedClipIdsRef,
    primaryClipId,
    selectedClip: selectionDerived.selectedClip,
    selectedTrack: selectionDerived.selectedTrack,
    selectedClipHasPredecessor: selectionDerived.selectedClipHasPredecessor,
    resolvedConfig: selectionDerived.resolvedConfig,
    addToSelection,
    clearSelection,
    isClipSelected,
    pruneSelection,
    selectClip,
    selectClips,
    setSelectedClipId,
  };
}
