import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { TimelineAction, TimelineRow } from '@xzdarcy/timeline-engine';
import {
  getVisualTracks,
  splitClipAtPlayhead,
  toggleClipMute,
  updateClipInConfig,
} from '@/tools/video-editor/lib/editor-utils';
import {
  buildRowTrackPatches,
  updateClipOrder,
} from '@/tools/video-editor/lib/coordinate-utils';
import {
  getNextClipId,
  type ClipMeta,
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';

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
  onChange: (nextRows: TimelineRow[]) => boolean | undefined;
  onOverlayChange: (actionId: string, patch: Partial<ClipMeta>) => void;
  handleDeleteClip: (clipId: string) => void;
  handleSelectedClipChange: (patch: Partial<ClipMeta> & { at?: number }) => void;
  handleResetClipPosition: () => void;
  handleSplitSelectedClip: () => void;
  handleSplitClipAtTime: (clipId: string, timeSeconds: number) => void;
  handleToggleMute: () => void;
  handleAddText: () => void;
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

  const onChange = useCallback((nextRows: TimelineRow[]) => {
    // With `movable: false`, the timeline library only reports resize-driven row updates here.
    applyTimelineEdit(nextRows, buildRowTrackPatches(nextRows));
    return undefined;
  }, [applyTimelineEdit]);

  const onOverlayChange = useCallback((actionId: string, patch: Partial<ClipMeta>) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    applyTimelineEdit(current.rows, { [actionId]: patch });
  }, [applyTimelineEdit, dataRef]);

  const handleDeleteClip = useCallback((clipId: string) => {
    if (clipId.startsWith('uploading-')) {
      return;
    }

    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextRows = current.rows.map((row) => ({
      ...row,
      actions: row.actions.filter((action) => action.id !== clipId),
    }));
    applyTimelineEdit(nextRows, undefined, [clipId]);
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [applyTimelineEdit, dataRef, selectedClipId, setSelectedClipId]);

  const handleSelectedClipChange = useCallback((patch: Partial<ClipMeta> & { at?: number }) => {
    const current = dataRef.current;
    if (!current || !selectedClipId) {
      return;
    }

    const clipRow = current.rows.find((row) => row.actions.some((action) => action.id === selectedClipId));
    if (!clipRow) {
      return;
    }

    const nextRows = current.rows.map((row) => {
      if (row.id !== clipRow.id || patch.at === undefined) {
        return row;
      }

      return {
        ...row,
        actions: row.actions.map((action) => {
          if (action.id !== selectedClipId) {
            return action;
          }

          const duration = action.end - action.start;
          return {
            ...action,
            start: patch.at,
            end: patch.at + duration,
          };
        }),
      };
    });

    const { at: _at, ...metaPatch } = patch;
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

  const handleToggleMute = useCallback(() => {
    if (!selectedClipId || !resolvedConfig) {
      return;
    }

    const nextConfig = toggleClipMute(resolvedConfig, selectedClipId);
    applyResolvedConfigEdit(nextConfig, { selectedClipId });
  }, [applyResolvedConfigEdit, resolvedConfig, selectedClipId]);

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
    const action: TimelineAction = {
      id: clipId,
      start: currentTimeRef.current,
      end: currentTimeRef.current + 5,
      effectId: `effect-${clipId}`,
    };
    const nextRows = current.rows.map((row) => (
      row.id === visualTrack.id
        ? { ...row, actions: [...row.actions, action] }
        : row
    ));
    const nextClipOrder = updateClipOrder(current.clipOrder, visualTrack.id, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, {
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

  return {
    onChange,
    onOverlayChange,
    handleDeleteClip,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleSplitSelectedClip,
    handleSplitClipAtTime,
    handleToggleMute,
    handleAddText,
  };
}
