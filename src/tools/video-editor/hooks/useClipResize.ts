import { useCallback, useRef } from 'react';
import { buildRowTrackPatches } from '@/tools/video-editor/lib/coordinate-utils';
import { getSourceTime, type ClipMeta, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { resolveOverlaps } from '@/tools/video-editor/lib/resolve-overlaps';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

export interface UseClipResizeArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  applyTimelineEdit: UseTimelineDataResult['applyTimelineEdit'];
}

export interface UseClipResizeResult {
  onActionResizeStart: ({ action }: { action: TimelineAction }) => void;
  onActionResizeEnd: ({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => void;
}

export function useClipResize({
  dataRef,
  applyTimelineEdit,
}: UseClipResizeArgs): UseClipResizeResult {
  const resizeStartRef = useRef<Record<string, { start: number; from: number }>>({});
  const resizeTransactionIdRef = useRef<Record<string, string>>({});

  const onActionResizeStart = useCallback(({ action }: { action: TimelineAction }) => {
    if (action.id.startsWith('uploading-')) return;
    const clipMeta = dataRef.current?.meta[action.id];
    if (!clipMeta || typeof clipMeta.hold === 'number') {
      return;
    }

    resizeStartRef.current[action.id] = {
      start: action.start,
      from: clipMeta.from ?? 0,
    };
    resizeTransactionIdRef.current[action.id] = crypto.randomUUID();
  }, [dataRef]);

  const onActionResizeEnd = useCallback(({ action, row }: { action: TimelineAction; row: TimelineRow; dir: string }) => {
    if (action.id.startsWith('uploading-')) return;
    const current = dataRef.current;
    const clipMeta = current?.meta[action.id];
    if (!current || !clipMeta) {
      return;
    }

    const metaUpdates: Record<string, Partial<ClipMeta>> = {
      ...buildRowTrackPatches(current.rows),
      [action.id]: {
        track: row.id,
      },
    };

    if (typeof clipMeta.hold !== 'number') {
      const origin = resizeStartRef.current[action.id];
      if (origin && action.start !== origin.start) {
        metaUpdates[action.id] = {
          ...metaUpdates[action.id],
          from: Math.max(0, origin.from + (action.start - origin.start) * (clipMeta.speed ?? 1)),
        };
      }

      metaUpdates[action.id] = {
        ...metaUpdates[action.id],
        to: getSourceTime(
          {
            from: clipMeta.from ?? 0,
            start: action.start,
            speed: clipMeta.speed ?? 1,
          },
          action.end,
        ),
      };
    }

    let nextRows = current.rows.map((entry) => {
      if (entry.id !== row.id) {
        return entry;
      }

      return {
        ...entry,
        actions: entry.actions.map((candidate) => {
          return candidate.id === action.id
            ? { ...candidate, start: action.start, end: action.end }
            : candidate;
        }),
      };
    });

    // Trim the resized clip if it overlaps existing siblings
    const { rows: resolvedRows, metaPatches: overlapPatches } = resolveOverlaps(
      nextRows, row.id, action.id, current.meta,
    );

    applyTimelineEdit(
      resolvedRows,
      { ...metaUpdates, ...overlapPatches },
      undefined,
      undefined,
      { transactionId: resizeTransactionIdRef.current[action.id] },
    );
    delete resizeStartRef.current[action.id];
    delete resizeTransactionIdRef.current[action.id];
  }, [applyTimelineEdit, dataRef]);

  return {
    onActionResizeStart,
    onActionResizeEnd,
  };
}
