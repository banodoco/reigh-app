import { useCallback, useMemo } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { addTrack } from '@/tools/video-editor/lib/editor-utils';
import { DEFAULT_VIDEO_TRACKS } from '@/tools/video-editor/lib/defaults';
import type { TrackDefinition, TrackKind } from '@/tools/video-editor/types';
import { moveClipBetweenTracks } from '@/tools/video-editor/lib/coordinate-utils';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';

export interface UseTimelineTrackManagementArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  resolvedConfig: TimelineData['resolvedConfig'] | null;
  selectedClipId: string | null;
  setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  applyTimelineEdit: UseTimelineDataResult['applyTimelineEdit'];
  applyResolvedConfigEdit: UseTimelineDataResult['applyResolvedConfigEdit'];
}

export interface UseTimelineTrackManagementResult {
  handleAddTrack: (kind: TrackKind) => void;
  handleTrackPopoverChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  handleMoveTrack: (activeId: string, overId: string) => void;
  handleRemoveTrack: (trackId: string) => void;
  handleClearUnusedTracks: () => void;
  unusedTrackCount: number;
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number, transactionId?: string) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number) => void;
  moveSelectedClipToTrack: (direction: 'up' | 'down') => void;
  moveSelectedClipsToTrack: (direction: 'up' | 'down', selectedClipIds: ReadonlySet<string>) => void;
}

export function reorderTracksByDirection(
  tracks: TrackDefinition[],
  trackId: string,
  direction: -1 | 1,
): TrackDefinition[] {
  const index = tracks.findIndex((track) => track.id === trackId);
  if (index < 0) {
    return tracks;
  }

  const trackKind = tracks[index]?.kind;
  let targetIndex = index + direction;
  while (
    targetIndex >= 0 &&
    targetIndex < tracks.length &&
    tracks[targetIndex]?.kind !== trackKind
  ) {
    targetIndex += direction;
  }

  if (targetIndex < 0 || targetIndex >= tracks.length) {
    return tracks;
  }

  const nextTracks = [...tracks];
  [nextTracks[index], nextTracks[targetIndex]] = [nextTracks[targetIndex], nextTracks[index]];
  return nextTracks;
}

export function moveTrackWithinKind(
  tracks: TrackDefinition[],
  activeId: string,
  overId: string,
): TrackDefinition[] {
  const activeIndex = tracks.findIndex((track) => track.id === activeId);
  const overIndex = tracks.findIndex((track) => track.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return tracks;
  }

  return arrayMove(tracks, activeIndex, overIndex);
}

export function useTimelineTrackManagement({
  dataRef,
  resolvedConfig,
  selectedClipId,
  setSelectedTrackId,
  applyTimelineEdit,
  applyResolvedConfigEdit,
}: UseTimelineTrackManagementArgs): UseTimelineTrackManagementResult {
  const moveClipToRow = useCallback((
    clipId: string,
    targetRowId: string,
    newStartTime?: number,
    transactionId?: string,
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceRow = current.rows.find((row) => row.actions.some((action) => action.id === clipId));
    const targetRow = current.rows.find((row) => row.id === targetRowId);
    if (!sourceRow || !targetRow) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === sourceRow.id);
    const targetTrack = current.tracks.find((track) => track.id === targetRow.id);
    const action = sourceRow.actions.find((candidate) => candidate.id === clipId);
    if (!sourceTrack || !targetTrack || !action || sourceTrack.kind !== targetTrack.kind) {
      return;
    }

    const duration = action.end - action.start;
    const nextStart = typeof newStartTime === 'number' ? Math.max(0, newStartTime) : action.start;
    const nextAction = { ...action, start: nextStart, end: nextStart + duration };
    const placedRows = current.rows.map((row) => {
      if (sourceRow.id === targetRow.id && row.id === sourceRow.id) {
        return {
          ...row,
          actions: row.actions.map((candidate) => (candidate.id === clipId ? nextAction : candidate)),
        };
      }

      if (row.id === sourceRow.id) {
        return { ...row, actions: row.actions.filter((candidate) => candidate.id !== clipId) };
      }

      if (row.id === targetRow.id) {
        return { ...row, actions: [...row.actions, nextAction] };
      }

      return row;
    });

    // Trim the moved clip if it overlaps existing siblings
    const { rows: resolvedRows, metaPatches } = resolveOverlaps(
      placedRows, targetRow.id, clipId, current.meta,
    );

    const nextClipOrder = moveClipBetweenTracks(current.clipOrder, clipId, sourceRow.id, targetRow.id);
    applyTimelineEdit(
      resolvedRows,
      { [clipId]: { track: targetRow.id }, ...metaPatches },
      undefined,
      nextClipOrder,
      { transactionId },
    );
  }, [applyTimelineEdit, dataRef]);

  const createTrackAndMoveClip = useCallback((clipId: string, kind: TrackKind, newStartTime?: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const sourceClip = current.resolvedConfig.clips.find((clip) => clip.id === clipId);
    const sourceTrack = sourceClip ? current.resolvedConfig.tracks.find((track) => track.id === sourceClip.track) : null;
    if (!sourceClip || !sourceTrack || sourceTrack.kind !== kind) {
      return;
    }

    const nextResolvedConfigBase = addTrack(current.resolvedConfig, kind);
    const newTrack = nextResolvedConfigBase.tracks.find((track) => {
      return !current.resolvedConfig.tracks.some((existingTrack) => existingTrack.id === track.id);
    }) ?? nextResolvedConfigBase.tracks[nextResolvedConfigBase.tracks.length - 1];
    if (!newTrack) {
      return;
    }

    const nextResolvedConfig = {
      ...nextResolvedConfigBase,
      clips: nextResolvedConfigBase.clips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        return {
          ...clip,
          at: typeof newStartTime === 'number' ? Math.max(0, newStartTime) : clip.at,
          track: newTrack.id,
        };
      }),
    };

    applyResolvedConfigEdit(nextResolvedConfig, {
      selectedClipId: clipId,
      selectedTrackId: newTrack.id,
    });
  }, [applyResolvedConfigEdit, dataRef]);

  const moveSelectedClipToTrack = useCallback((direction: 'up' | 'down') => {
    const current = dataRef.current;
    if (!current || !selectedClipId) {
      return;
    }

    const currentRowIndex = current.rows.findIndex((row) => row.actions.some((action) => action.id === selectedClipId));
    if (currentRowIndex < 0) {
      return;
    }

    const sourceTrack = current.tracks.find((track) => track.id === current.rows[currentRowIndex]?.id);
    if (!sourceTrack) {
      return;
    }

    let targetRowIndex = currentRowIndex;
    while (true) {
      targetRowIndex += direction === 'up' ? -1 : 1;
      if (targetRowIndex < 0 || targetRowIndex >= current.rows.length) {
        return;
      }

      const targetTrack = current.tracks.find((track) => track.id === current.rows[targetRowIndex]?.id);
      if (targetTrack?.kind === sourceTrack.kind) {
        moveClipToRow(selectedClipId, targetTrack.id);
        setSelectedTrackId(targetTrack.id);
        return;
      }
    }
  }, [dataRef, moveClipToRow, selectedClipId, setSelectedTrackId]);

  const moveSelectedClipsToTrack = useCallback((
    direction: 'up' | 'down',
    selectedClipIds: ReadonlySet<string>,
  ) => {
    const current = dataRef.current;
    if (!current || selectedClipIds.size === 0) {
      return;
    }

    const trackById = new Map(current.tracks.map((track) => [track.id, track]));
    const groupsByRow = new Map<string, { clipIds: string[]; rowIndex: number; kind: TrackKind }>();

    current.rows.forEach((row, rowIndex) => {
      const sourceTrack = trackById.get(row.id);
      if (!sourceTrack) {
        return;
      }

      const rowClipIds = row.actions
        .map((action) => action.id)
        .filter((clipId) => selectedClipIds.has(clipId));
      if (rowClipIds.length === 0) {
        return;
      }

      groupsByRow.set(row.id, {
        clipIds: rowClipIds,
        rowIndex,
        kind: sourceTrack.kind,
      });
    });

    if (groupsByRow.size === 0) {
      return;
    }

    const plannedMoves: Array<{ clipId: string; targetRowId: string }> = [];

    for (const kind of ['visual', 'audio'] as const) {
      const kindGroups = [...groupsByRow.values()].filter((group) => group.kind === kind);
      if (kindGroups.length === 0) {
        continue;
      }

      const kindMoves: Array<{ clipId: string; targetRowId: string }> = [];
      let isBlocked = false;

      for (const group of kindGroups) {
        let targetRowIndex = group.rowIndex;
        let targetRowId: string | null = null;

        while (true) {
          targetRowIndex += direction === 'up' ? -1 : 1;
          if (targetRowIndex < 0 || targetRowIndex >= current.rows.length) {
            isBlocked = true;
            break;
          }

          const targetTrack = trackById.get(current.rows[targetRowIndex]?.id ?? '');
          if (targetTrack?.kind === kind) {
            targetRowId = targetTrack.id;
            break;
          }
        }

        if (isBlocked || !targetRowId) {
          isBlocked = true;
          break;
        }

        for (const clipId of group.clipIds) {
          kindMoves.push({ clipId, targetRowId });
        }
      }

      if (!isBlocked) {
        plannedMoves.push(...kindMoves);
      }
    }

    if (plannedMoves.length === 0) {
      return;
    }

    const transactionId = crypto.randomUUID();

    for (const move of plannedMoves) {
      moveClipToRow(move.clipId, move.targetRowId, undefined, transactionId);
    }

    const primaryMove = selectedClipId
      ? plannedMoves.find((move) => move.clipId === selectedClipId)
      : plannedMoves[0];
    if (primaryMove) {
      setSelectedTrackId(primaryMove.targetRowId);
    }
  }, [dataRef, moveClipToRow, selectedClipId, setSelectedTrackId]);

  const handleAddTrack = useCallback((kind: TrackKind) => {
    if (!resolvedConfig) {
      return;
    }

    const nextResolvedConfig = addTrack(resolvedConfig, kind);
    const nextTrack = nextResolvedConfig.tracks[nextResolvedConfig.tracks.length - 1] ?? null;
    applyResolvedConfigEdit(nextResolvedConfig, { selectedTrackId: nextTrack?.id ?? null });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleTrackPopoverChange = useCallback((trackId: string, patch: Partial<TrackDefinition>) => {
    if (!resolvedConfig) {
      return;
    }

    const nextConfig = {
      ...resolvedConfig,
      tracks: resolvedConfig.tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track)),
    };
    applyResolvedConfigEdit(nextConfig, { selectedTrackId: trackId });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleMoveTrack = useCallback((activeId: string, overId: string) => {
    if (!resolvedConfig) {
      return;
    }

    const nextTracks = moveTrackWithinKind(resolvedConfig.tracks, activeId, overId);
    if (nextTracks === resolvedConfig.tracks) {
      return;
    }

    applyResolvedConfigEdit({ ...resolvedConfig, tracks: nextTracks }, { selectedTrackId: activeId });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleRemoveTrack = useCallback((trackId: string) => {
    if (!resolvedConfig) {
      return;
    }

    const track = resolvedConfig.tracks.find((entry) => entry.id === trackId);
    if (!track) {
      return;
    }

    const sameKind = resolvedConfig.tracks.filter((entry) => entry.kind === track.kind);
    if (sameKind.length <= 1) {
      return;
    }

    const nextConfig = {
      ...resolvedConfig,
      tracks: resolvedConfig.tracks.filter((entry) => entry.id !== trackId),
      clips: resolvedConfig.clips.filter((clip) => clip.track !== trackId),
    };
    applyResolvedConfigEdit(nextConfig, { selectedTrackId: null, semantic: true });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const unusedTrackCount = useMemo(() => {
    if (!resolvedConfig) {
      return 0;
    }

    const tracksWithClips = new Set(resolvedConfig.clips.map((clip) => clip.track));
    const defaultTrackIds = new Set(DEFAULT_VIDEO_TRACKS.map((track) => track.id));

    // Count how many tracks would actually be removed (matching handleClearUnusedTracks logic).
    // We always keep at least one track per kind, even if it's empty.
    let keptEmptyVisual = false;
    let keptEmptyAudio = false;
    let removable = 0;

    for (const track of resolvedConfig.tracks) {
      if (defaultTrackIds.has(track.id) || tracksWithClips.has(track.id)) {
        continue;
      }

      if (track.kind === 'visual' && !keptEmptyVisual) {
        const hasVisualWithClips = resolvedConfig.tracks.some((t) => t.kind === 'visual' && tracksWithClips.has(t.id));
        if (!hasVisualWithClips) {
          keptEmptyVisual = true;
          continue;
        }
      }

      if (track.kind === 'audio' && !keptEmptyAudio) {
        const hasAudioWithClips = resolvedConfig.tracks.some((t) => t.kind === 'audio' && tracksWithClips.has(t.id));
        if (!hasAudioWithClips) {
          keptEmptyAudio = true;
          continue;
        }
      }

      removable++;
    }

    return removable;
  }, [resolvedConfig]);

  const handleClearUnusedTracks = useCallback(() => {
    if (!resolvedConfig || unusedTrackCount === 0) {
      return;
    }

    const tracksWithClips = new Set(resolvedConfig.clips.map((clip) => clip.track));
    const defaultTrackIds = new Set(DEFAULT_VIDEO_TRACKS.map((track) => track.id));
    const visualWithClips = resolvedConfig.tracks.filter((track) => track.kind === 'visual' && tracksWithClips.has(track.id));
    const audioWithClips = resolvedConfig.tracks.filter((track) => track.kind === 'audio' && tracksWithClips.has(track.id));

    const nextTracks = resolvedConfig.tracks.filter((track) => {
      if (defaultTrackIds.has(track.id)) {
        return true;
      }

      if (tracksWithClips.has(track.id)) {
        return true;
      }

      if (track.kind === 'visual' && visualWithClips.length === 0) {
        visualWithClips.push(track);
        return true;
      }

      if (track.kind === 'audio' && audioWithClips.length === 0) {
        audioWithClips.push(track);
        return true;
      }

      return false;
    });

    applyResolvedConfigEdit({ ...resolvedConfig, tracks: nextTracks }, { selectedTrackId: null, semantic: true });
  }, [applyResolvedConfigEdit, resolvedConfig, unusedTrackCount]);

  return {
    handleAddTrack,
    handleTrackPopoverChange,
    handleMoveTrack,
    handleRemoveTrack,
    handleClearUnusedTracks,
    unusedTrackCount,
    moveClipToRow,
    createTrackAndMoveClip,
    moveSelectedClipToTrack,
    moveSelectedClipsToTrack,
  };
}
