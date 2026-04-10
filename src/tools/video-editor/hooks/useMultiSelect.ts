import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export interface SelectClipOptions {
  toggle?: boolean;
  preserveSelection?: boolean;
}

export interface UseMultiSelectResult {
  selectedClipIds: ReadonlySet<string>;
  selectedClipIdsRef: React.MutableRefObject<Set<string>>;
  additiveSelectionRef: React.MutableRefObject<boolean>;
  primaryClipId: string | null;
  selectClip: (clipId: string, opts?: SelectClipOptions) => void;
  selectClips: (clipIds: Iterable<string>) => void;
  addToSelection: (clipIds: Iterable<string>) => void;
  clearSelection: () => void;
  isClipSelected: (clipId: string) => boolean;
  pruneSelection: (validIds: Set<string>) => void;
}

const getFirstSetValue = (values: ReadonlySet<string>): string | null => {
  for (const value of values) {
    return value;
  }

  return null;
};

const getPrimaryClipId = (
  selectedClipIds: ReadonlySet<string>,
  preferredPrimaryClipId: string | null,
): string | null => {
  if (preferredPrimaryClipId && selectedClipIds.has(preferredPrimaryClipId)) {
    return preferredPrimaryClipId;
  }

  return getFirstSetValue(selectedClipIds);
};

const areSetsEqual = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
};

const buildSelectionSet = (clipIds: Iterable<string>): Set<string> => {
  const nextSelection = new Set<string>();

  for (const clipId of clipIds) {
    nextSelection.add(clipId);
  }

  return nextSelection;
};

export function useMultiSelect(): UseMultiSelectResult {
  const [selectedClipIdsState, setSelectedClipIdsState] = useState<Set<string>>(() => new Set());
  const [primaryClipIdState, setPrimaryClipIdState] = useState<string | null>(null);

  const selectedClipIdsRef = useRef<Set<string>>(selectedClipIdsState);
  const additiveSelectionRef = useRef(false);
  const primaryClipIdRef = useRef<string | null>(primaryClipIdState);

  useLayoutEffect(() => {
    selectedClipIdsRef.current = selectedClipIdsState;
    primaryClipIdRef.current = primaryClipIdState;
  }, [primaryClipIdState, selectedClipIdsState]);

  const commitSelection = useCallback((
    nextSelection: Set<string>,
    nextPrimaryClipId: string | null,
    nextIsAdditiveSelection: boolean,
  ) => {
    selectedClipIdsRef.current = nextSelection;
    additiveSelectionRef.current = nextIsAdditiveSelection;
    primaryClipIdRef.current = nextPrimaryClipId;
    setSelectedClipIdsState(nextSelection);
    setPrimaryClipIdState(nextPrimaryClipId);
  }, []);

  const clearSelection = useCallback(() => {
    if (selectedClipIdsRef.current.size === 0 && primaryClipIdRef.current === null) {
      return;
    }

    commitSelection(new Set(), null, false);
  }, [commitSelection]);

  const selectClip = useCallback((clipId: string, opts?: SelectClipOptions) => {
    if (opts?.preserveSelection && selectedClipIdsRef.current.has(clipId)) {
      return;
    }

    if (!opts?.toggle) {
      commitSelection(new Set([clipId]), clipId, false);
      return;
    }

    const nextSelection = new Set(selectedClipIdsRef.current);
    if (nextSelection.has(clipId)) {
      nextSelection.delete(clipId);
      commitSelection(
        nextSelection,
        getPrimaryClipId(
          nextSelection,
          primaryClipIdRef.current === clipId ? null : primaryClipIdRef.current,
        ),
        nextSelection.size > 1,
      );
      return;
    }

    nextSelection.add(clipId);
    commitSelection(nextSelection, clipId, nextSelection.size > 1);
  }, [commitSelection]);

  const selectClips = useCallback((clipIds: Iterable<string>) => {
    const nextSelection = buildSelectionSet(clipIds);
    commitSelection(nextSelection, getPrimaryClipId(nextSelection, null), false);
  }, [commitSelection]);

  const addToSelection = useCallback((clipIds: Iterable<string>) => {
    const nextSelection = new Set(selectedClipIdsRef.current);
    for (const clipId of clipIds) {
      nextSelection.add(clipId);
    }

    const nextPrimaryClipId = getPrimaryClipId(nextSelection, primaryClipIdRef.current);
    if (
      areSetsEqual(selectedClipIdsRef.current, nextSelection)
      && primaryClipIdRef.current === nextPrimaryClipId
    ) {
      return;
    }

    commitSelection(nextSelection, nextPrimaryClipId, nextSelection.size > 1);
  }, [commitSelection]);

  const isClipSelected = useCallback((clipId: string) => {
    return selectedClipIdsRef.current.has(clipId);
  }, []);

  const pruneSelection = useCallback((validIds: Set<string>) => {
    const nextSelection = new Set<string>();
    for (const clipId of selectedClipIdsRef.current) {
      if (validIds.has(clipId)) {
        nextSelection.add(clipId);
      }
    }

    const nextPrimaryClipId = getPrimaryClipId(nextSelection, primaryClipIdRef.current);
    if (
      areSetsEqual(selectedClipIdsRef.current, nextSelection)
      && primaryClipIdRef.current === nextPrimaryClipId
    ) {
      return;
    }

    commitSelection(nextSelection, nextPrimaryClipId, additiveSelectionRef.current && nextSelection.size > 1);
  }, [commitSelection]);

  return {
    selectedClipIds: selectedClipIdsState,
    selectedClipIdsRef,
    additiveSelectionRef,
    primaryClipId: primaryClipIdState,
    selectClip,
    selectClips,
    addToSelection,
    clearSelection,
    isClipSelected,
    pruneSelection,
  };
}
