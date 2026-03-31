import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  getVisualTracks,
  splitClipAtPlayhead,
  updateClipInConfig,
} from '@/tools/video-editor/lib/editor-utils';
import {
  updateClipOrder,
} from '@/tools/video-editor/lib/coordinate-utils';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps';
import {
  getNextClipId,
  type ClipMeta,
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';

export interface UseClipEditingArgs {
  dataRef: MutableRefObject<TimelineData | null>;
  resolvedConfig: TimelineData['resolvedConfig'] | null;
  selectedClipId: string | null;
  selectedTrack: UseTimelineDataResult['selectedTrack'];
  currentTime: number;
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  applyTimelineEdit: UseTimelineDataResult['applyTimelineEdit'];
  applyResolvedConfigEdit: UseTimelineDataResult['applyResolvedConfigEdit'];
}

export interface UseClipEditingResult {
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
  handleUpdateClips: (clipIds: string[], patch: Partial<ClipMeta>) => void;
  handleUpdateClipsDeep: (clipIds: string[], patchFn: (existing: ClipMeta) => Partial<ClipMeta>) => void;
  handleDeleteClips: (clipIds: string[]) => void;
  handleDeleteClip: (clipId: string) => void;
  handleSelectedClipChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  handleResetClipPosition: () => void;
  handleResetClipsPosition: (clipIds: string[]) => void;
  handleSplitSelectedClip: () => void;
  handleSplitClipAtTime: (clipId: string, timeSeconds: number) => void;
  handleSplitClipsAtPlayhead: (clipIds: string[]) => void;
  handleToggleMuteClips: (clipIds: string[]) => void;
  handleToggleMute: () => void;
  handleAddText: () => void;
  handleAddTextAt: (trackId: string, time: number) => void;
}

export const DURATION_KEYS = ['speed', 'from', 'to', 'hold'] as const;

export function patchAffectsDuration(patch: Partial<ClipMeta>): boolean {
  return DURATION_KEYS.some((key) => key in patch);
}

export function recalcActionEnd(action: TimelineAction, merged: Partial<ClipMeta>): number {
  const speed = merged.speed ?? 1;
  const fallbackSourceDuration = Math.max(0, (action.end - action.start) * speed);
  const sourceDuration = typeof merged.hold === 'number'
    ? merged.hold
    : Math.max(
      0,
      (merged.to ?? fallbackSourceDuration + (merged.from ?? 0)) - (merged.from ?? 0),
    );

  return action.start + sourceDuration / speed;
}

export function useClipEditing({
  dataRef,
  resolvedConfig,
  selectedClipId,
  selectedTrack,
  currentTime,
  setSelectedClipId,
  setSelectedTrackId,
  applyTimelineEdit,
  applyResolvedConfigEdit,
}: UseClipEditingArgs): UseClipEditingResult {
  const currentTimeRef = useRef(currentTime);

  useLayoutEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit, dataRef]);

  const getValidClipIds = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return [];
    }

    const uniqueClipIds = new Set<string>();
    for (const clipId of clipIds) {
      if (clipId.startsWith('uploading-') || !current.meta[clipId]) {
        continue;
      }

      uniqueClipIds.add(clipId);
    }

    return [...uniqueClipIds];
  }, [dataRef]);

  const handleUpdateClips = useCallback((clipIds: string[], patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates = Object.fromEntries(
      validClipIds.map((clipId) => [clipId, patch]),
    ) as Record<string, Partial<ClipMeta>>;

    if (!patchAffectsDuration(patch)) {
      applyTimelineEdit(current.rows, metaUpdates);
      return;
    }

    const validClipIdSet = new Set(validClipIds);
    const nextRows = current.rows.map((row) => ({
      ...row,
      actions: row.actions.map((action) => {
        if (!validClipIdSet.has(action.id)) {
          return action;
        }

        const existing = current.meta[action.id];
        if (!existing) {
          return action;
        }

        return {
          ...action,
          end: recalcActionEnd(action, { ...existing, ...patch }),
        };
      }),
    }));

    applyTimelineEdit(nextRows, metaUpdates);
  }, [applyTimelineEdit, dataRef, getValidClipIds]);

  const handleUpdateClipsDeep = useCallback((
    clipIds: string[],
    patchFn: (existing: ClipMeta) => Partial<ClipMeta>,
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {};

    for (const clipId of validClipIds) {
      const existing = current.meta[clipId];
      if (!existing) {
        continue;
      }

      metaUpdates[clipId] = patchFn(existing);
    }

    if (Object.keys(metaUpdates).length === 0) {
      return;
    }

    applyTimelineEdit(current.rows, metaUpdates);
  }, [applyTimelineEdit, dataRef, getValidClipIds]);

  const handleDeleteClips = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const clipIdSet = new Set(getValidClipIds(clipIds));
    if (clipIdSet.size === 0) {
      return;
    }

    const nextRows = current.rows.map((row) => ({
      ...row,
      actions: row.actions.filter((action) => !clipIdSet.has(action.id)),
    }));
    applyTimelineEdit(nextRows, undefined, [...clipIdSet], undefined, { semantic: true });
  }, [applyTimelineEdit, dataRef, getValidClipIds]);

  const handleDeleteClip = useCallback((clipId: string) => {
    handleDeleteClips([clipId]);
  }, [handleDeleteClips]);

  const handleSelectedClipChange = useCallback((patch: Partial<ClipMeta> & { at?: number }) => {
    const current = dataRef.current;
    if (!current || !selectedClipId) {
      return;
    }

    const clipRow = current.rows.find((row) => row.actions.some((action) => action.id === selectedClipId));
    if (!clipRow) {
      return;
    }

    const { at: _at, ...metaPatch } = patch;
    const affectsDuration = patchAffectsDuration(metaPatch);
    const nextRows = current.rows.map((row) => {
      if (row.id !== clipRow.id || (patch.at === undefined && !affectsDuration)) {
        return row;
      }

      return {
        ...row,
        actions: row.actions.map((action) => {
          if (action.id !== selectedClipId) {
            return action;
          }

          const nextStart = patch.at ?? action.start;
          const nextAction = {
            ...action,
            start: nextStart,
            end: patch.at === undefined
              ? action.end
              : nextStart + (action.end - action.start),
          };

          if (!affectsDuration) {
            return nextAction;
          }

          const merged = { ...current.meta[selectedClipId], ...metaPatch };
          return {
            ...nextAction,
            end: recalcActionEnd(nextAction, merged),
          };
        }),
      };
    });

    applyTimelineEdit(nextRows, { [selectedClipId]: metaPatch });
  }, [applyTimelineEdit, dataRef, selectedClipId]);

  const handleResetClipPosition = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    const nextConfig = updateClipInConfig(resolvedConfig, selectedClipId, (clip) => ({
      ...clip,
      x: undefined,
      y: undefined,
      width: undefined,
      height: undefined,
      cropTop: undefined,
      cropBottom: undefined,
      cropLeft: undefined,
      cropRight: undefined,
    }));
    applyResolvedConfigEdit(nextConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleResetClipsPosition = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates = Object.fromEntries(
      validClipIds.map((clipId) => [clipId, {
        x: undefined,
        y: undefined,
        width: undefined,
        height: undefined,
        cropTop: undefined,
        cropBottom: undefined,
        cropLeft: undefined,
        cropRight: undefined,
      }]),
    ) as Record<string, Partial<ClipMeta>>;

    applyTimelineEdit(current.rows, metaUpdates);
  }, [applyTimelineEdit, dataRef, getValidClipIds]);

  const handleSplitSelectedClip = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    const splitResult = splitClipAtPlayhead(resolvedConfig, selectedClipId, currentTimeRef.current);
    if (!splitResult.nextSelectedClipId) {
      return;
    }

    applyResolvedConfigEdit(splitResult.config, { selectedClipId: splitResult.nextSelectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

  const handleSplitClipAtTime = useCallback((clipId: string, timeSeconds: number) => {
    if (!resolvedConfig) {
      return;
    }

    const splitResult = splitClipAtPlayhead(resolvedConfig, clipId, timeSeconds);
    if (!splitResult.nextSelectedClipId) {
      return;
    }

    applyResolvedConfigEdit(splitResult.config, { selectedClipId: splitResult.nextSelectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig]);

  const handleSplitClipsAtPlayhead = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current || !resolvedConfig) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const currentTime = currentTimeRef.current;
    const intersectingClipIds = new Set<string>();

    for (const row of current.rows) {
      for (const action of row.actions) {
        if (
          validClipIds.includes(action.id)
          && action.start <= currentTime
          && currentTime < action.end
        ) {
          intersectingClipIds.add(action.id);
        }
      }
    }

    if (intersectingClipIds.size === 0) {
      return;
    }

    let nextResolvedConfig = resolvedConfig;
    let didSplit = false;

    for (const clipId of validClipIds) {
      if (!intersectingClipIds.has(clipId)) {
        continue;
      }

      const splitResult = splitClipAtPlayhead(nextResolvedConfig, clipId, currentTime);
      if (!splitResult.nextSelectedClipId) {
        continue;
      }

      nextResolvedConfig = splitResult.config;
      didSplit = true;
    }

    if (!didSplit) {
      return;
    }

    applyResolvedConfigEdit(nextResolvedConfig);
  }, [applyResolvedConfigEdit, dataRef, getValidClipIds, resolvedConfig]);

  const handleToggleMuteClips = useCallback((clipIds: string[]) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const validClipIds = getValidClipIds(clipIds);
    if (validClipIds.length === 0) {
      return;
    }

    const metaUpdates = Object.fromEntries(
      validClipIds.map((clipId) => {
        const volume = current.meta[clipId]?.volume ?? 1;
        return [clipId, { volume: volume <= 0 ? 1 : 0 }];
      }),
    ) as Record<string, Partial<ClipMeta>>;

    applyTimelineEdit(current.rows, metaUpdates);
  }, [applyTimelineEdit, dataRef, getValidClipIds]);

  const handleToggleMute = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    handleToggleMuteClips([selectedClipId]);
  }, [handleToggleMuteClips, resolvedConfig, selectedClipId]);

  const handleAddText = useCallback(() => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const visualTrack = selectedTrack?.kind === 'visual'
      ? selectedTrack
      : getVisualTracks(current.resolvedConfig)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const textDuration = 5;
    const action: TimelineAction = {
      id: clipId,
      start: currentTimeRef.current,
      end: currentTimeRef.current + textDuration,
      effectId: `effect-${clipId}`,
    };
    const rowsWithClip = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    // Resolve overlaps so the text clip doesn't land on top of existing clips
    const { rows: nextRows, metaPatches } = resolveOverlaps(
      rowsWithClip, visualTrack.id, clipId, current.meta,
    );
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, {
      ...metaPatches,
      [clipId]: {
        track: visualTrack.id,
        clipType: 'text',
        text: {
          content: 'Double-click to edit',
          fontSize: 64,
          color: '#ffffff',
          align: 'center',
        },
        x: 120,
        y: 120,
        width: 640,
        height: 180,
        opacity: 1,
      },
    }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyTimelineEdit, dataRef, selectedTrack, setSelectedClipId, setSelectedTrackId]);

  const handleAddTextAt = useCallback((trackId: string, time: number) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    // Ensure the target track is visual; fall back to first visual track
    const targetTrack = current.tracks.find((t) => t.id === trackId);
    const visualTrack = targetTrack?.kind === 'visual'
      ? targetTrack
      : getVisualTracks(current.resolvedConfig)[0];
    if (!visualTrack) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const textDuration = 5;
    const action: TimelineAction = {
      id: clipId,
      start: Math.max(0, time),
      end: Math.max(0, time) + textDuration,
      effectId: `effect-${clipId}`,
    };
    const rowsWithClip = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    const { rows: nextRows, metaPatches } = resolveOverlaps(
      rowsWithClip, visualTrack.id, clipId, current.meta,
    );
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, {
      ...metaPatches,
      [clipId]: {
        track: visualTrack.id,
        clipType: 'text',
        text: {
          content: 'Double-click to edit',
          fontSize: 64,
          color: '#ffffff',
          align: 'center',
        },
        x: 120,
        y: 120,
        width: 640,
        height: 180,
        opacity: 1,
      },
    }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(visualTrack.id);
  }, [applyTimelineEdit, dataRef, setSelectedClipId, setSelectedTrackId]);

  return {
    onOverlayChange,
    handleUpdateClips,
    handleUpdateClipsDeep,
    handleDeleteClips,
    handleDeleteClip,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleResetClipsPosition,
    handleSplitSelectedClip,
    handleSplitClipAtTime,
    handleSplitClipsAtPlayhead,
    handleToggleMuteClips,
    handleToggleMute,
    handleAddText,
    handleAddTextAt,
  };
}
