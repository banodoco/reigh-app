import type { TrackDefinition, TrackKind } from '@/tools/video-editor/types';
import type { ClipMeta, ClipOrderMap } from '@/tools/video-editor/lib/timeline-data';

export const ROW_HEIGHT = 36;
export const SCALE_SECONDS = 5;
export const LABEL_WIDTH = 144;
export const TIMELINE_START_LEFT = LABEL_WIDTH;

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

export const formatTime = (time: number): string => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  const ms = Math.floor((time % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const updateClipOrder = (
  current: ClipOrderMap,
  trackId: string,
  update: (ids: string[]) => string[],
): ClipOrderMap => {
  return {
    ...current,
    [trackId]: update(current[trackId] ?? []),
  };
};

export const buildTrackClipOrder = (
  tracks: TrackDefinition[],
  clipOrder: ClipOrderMap,
  removedIds: string[] = [],
): ClipOrderMap => {
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      (clipOrder[track.id] ?? []).filter((clipId) => !removedIds.includes(clipId)),
    ]),
  );
};

export const moveClipBetweenTracks = (
  clipOrder: ClipOrderMap,
  clipId: string,
  sourceTrackId: string,
  targetTrackId: string,
): ClipOrderMap => {
  if (sourceTrackId === targetTrackId) {
    return clipOrder;
  }

  return {
    ...clipOrder,
    [sourceTrackId]: (clipOrder[sourceTrackId] ?? []).filter((id) => id !== clipId),
    [targetTrackId]: [...(clipOrder[targetTrackId] ?? []).filter((id) => id !== clipId), clipId],
  };
};

export const getCompatibleTrackId = (
  tracks: TrackDefinition[],
  desiredTrackId: string | undefined,
  assetKind: TrackKind,
  selectedTrackId: string | null,
): string | null => {
  const compatibleTracks = tracks.filter((track) => track.kind === assetKind);
  if (compatibleTracks.length === 0) {
    return null;
  }

  if (desiredTrackId) {
    const exact = compatibleTracks.find((track) => track.id === desiredTrackId);
    if (exact) return exact.id;
    // Desired track is incompatible — fall through to find another compatible one
  }

  if (selectedTrackId) {
    const selected = compatibleTracks.find((track) => track.id === selectedTrackId);
    if (selected) {
      return selected.id;
    }
  }

  return compatibleTracks[0].id;
};

export const buildRowTrackPatches = (
  rows: { id: string; actions: { id: string }[] }[],
): Record<string, Partial<ClipMeta>> => {
  const patches: Record<string, Partial<ClipMeta>> = {};
  for (const row of rows) {
    for (const action of row.actions) {
      patches[action.id] = { track: row.id };
    }
  }

  return patches;
};

export const rawRowIndexFromY = (
  clientY: number,
  containerTop: number,
  scrollTop: number,
  rowHeight: number,
): number => {
  const relativeY = clientY - containerTop + scrollTop;
  // Allow negative values so callers can detect "above all rows"
  return Math.floor(relativeY / rowHeight);
};

export interface DropTargetResult {
  kind: 'track' | 'create' | 'reject';
  trackId?: string;
}

export const resolveDropTarget = (
  tracks: TrackDefinition[],
  rowIndex: number,
  rowCount: number,
  sourceKind: TrackKind,
): DropTargetResult => {
  if (rowIndex >= rowCount) {
    return { kind: 'create' };
  }
  const targetTrack = tracks[rowIndex];
  if (!targetTrack || targetTrack.kind !== sourceKind) {
    return { kind: 'reject' };
  }
  return { kind: 'track', trackId: targetTrack.id };
};
