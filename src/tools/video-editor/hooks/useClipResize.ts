import { useCallback, useRef } from 'react';
import { buildRowTrackPatches } from '@/tools/video-editor/lib/coordinate-utils';
import { getSourceTime, type ClipMeta, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps';
import type { TimelineApplyEdit } from '@/tools/video-editor/hooks/timeline-state-types';
import type { TrackKind } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

type ResizeDir = 'left' | 'right';

interface ResizeStartState {
  start: number;
  from: number;
  to: number;
  speed: number;
  trackKind: TrackKind;
  assetDuration?: number;
}

export interface UseClipResizeArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  applyEdit: TimelineApplyEdit;
}

export interface UseClipResizeResult {
  onActionResizeStart: ({ action, row }: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => void;
  onActionResizeEnd: ({ action, row }: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => void;
}

const getTrackKind = (
  current: TimelineData,
  rowId: string,
  fallbackTrackId?: string,
): TrackKind => {
  return current.tracks.find((track) => track.id === rowId)?.kind
    ?? current.tracks.find((track) => track.id === fallbackTrackId)?.kind
    ?? 'visual';
};

const getAssetDuration = (
  current: TimelineData,
  clipMeta: ClipMeta,
): number | undefined => {
  if (!clipMeta.asset) {
    return undefined;
  }

  return current.resolvedConfig.registry[clipMeta.asset]?.duration
    ?? current.registry.assets[clipMeta.asset]?.duration;
};

const getResolvedAction = (
  rows: TimelineRow[],
  rowId: string,
  actionId: string,
): TimelineAction | undefined => {
  return rows
    .find((candidate) => candidate.id === rowId)
    ?.actions.find((candidate) => candidate.id === actionId);
};

export function useClipResize({
  dataRef,
  applyEdit,
}: UseClipResizeArgs): UseClipResizeResult {
  const resizeStartRef = useRef<Record<string, ResizeStartState>>({});
  const resizeTransactionIdRef = useRef<Record<string, string>>({});

  const onActionResizeStart = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => {
    if (action.id.startsWith('uploading-')) return;
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta || typeof clipMeta.hold === 'number') {
      return;
    }

    const from = clipMeta.from ?? 0;
    const speed = clipMeta.speed ?? 1;

    resizeStartRef.current[action.id] = {
      start: action.start,
      from,
      to: getSourceTime({ from, start: action.start, speed }, action.end),
      speed,
      trackKind: getTrackKind(current, row.id, clipMeta.track),
      assetDuration: getAssetDuration(current, clipMeta),
    };
    resizeTransactionIdRef.current[action.id] = crypto.randomUUID();
  }, [dataRef]);

  const onActionResizeEnd = useCallback(({ action, row, dir }: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => {
    if (action.id.startsWith('uploading-')) return;
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta) {
      return;
    }

    const fallbackFrom = clipMeta.from ?? 0;
    const fallbackSpeed = clipMeta.speed ?? 1;
    const origin = resizeStartRef.current[action.id] ?? {
      start: action.start,
      from: fallbackFrom,
      to: getSourceTime({ from: fallbackFrom, start: action.start, speed: fallbackSpeed }, action.end),
      speed: fallbackSpeed,
      trackKind: getTrackKind(current, row.id, clipMeta.track),
      assetDuration: getAssetDuration(current, clipMeta),
    };

    let clampedStart = action.start;
    let clampedEnd = action.end;
    if (origin.trackKind === 'audio') {
      if (dir === 'left') {
        const minStart = action.end - (origin.to / origin.speed);
        clampedStart = Math.max(action.start, minStart);
      } else if (typeof origin.assetDuration === 'number') {
        const maxEnd = action.start + Math.max(0, origin.assetDuration - origin.from) / origin.speed;
        clampedEnd = Math.min(action.end, maxEnd);
      }
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {
      ...buildRowTrackPatches(current.rows),
      [action.id]: {
        track: row.id,
      },
    };

    const nextRows = current.rows.map((entry) => {
      if (entry.id !== row.id) {
        return entry;
      }

      return {
        ...entry,
        actions: entry.actions.map((candidate) => {
          return candidate.id === action.id
            ? { ...candidate, start: clampedStart, end: clampedEnd }
            : candidate;
        }),
      };
    });

    // Trim the resized clip if it overlaps existing siblings
    const { rows: resolvedRows, metaPatches: overlapPatches, adjustments: _adjustments } = resolveOverlaps(
      nextRows, row.id, action.id, current.meta,
    );

    const resolvedAction = getResolvedAction(resolvedRows, row.id, action.id);
    const resolvedMetaUpdates = {
      ...metaUpdates,
      ...overlapPatches,
    };

    if (resolvedAction && typeof clipMeta.hold !== 'number') {
      const resolvedStart = resolvedAction.start;
      const resolvedEnd = resolvedAction.end;
      const resolvedDuration = resolvedEnd - resolvedStart;

      if (resolvedDuration > 0) {
        if (origin.trackKind === 'visual') {
          if (dir === 'left') {
            const from = Math.max(0, origin.from + (resolvedStart - origin.start) * origin.speed);
            resolvedMetaUpdates[action.id] = {
              ...resolvedMetaUpdates[action.id],
              from,
              to: origin.to,
              speed: (origin.to - from) / resolvedDuration,
            };
          } else {
            resolvedMetaUpdates[action.id] = {
              ...resolvedMetaUpdates[action.id],
              from: origin.from,
              to: origin.to,
              speed: (origin.to - origin.from) / resolvedDuration,
            };
          }
        } else {
          const from = Math.max(0, origin.from + (resolvedStart - origin.start) * origin.speed);
          const unclampedTo = from + resolvedDuration * origin.speed;
          resolvedMetaUpdates[action.id] = {
            ...resolvedMetaUpdates[action.id],
            from,
            to: typeof origin.assetDuration === 'number'
              ? Math.min(origin.assetDuration, unclampedTo)
              : unclampedTo,
          };
        }
      }
    }

    applyEdit({
      type: 'rows',
      rows: resolvedRows,
      metaUpdates: resolvedMetaUpdates,
    }, { transactionId: resizeTransactionIdRef.current[action.id] });
    delete resizeStartRef.current[action.id];
    delete resizeTransactionIdRef.current[action.id];
  }, [applyEdit, dataRef]);

  return {
    onActionResizeStart,
    onActionResizeEnd,
  };
}
