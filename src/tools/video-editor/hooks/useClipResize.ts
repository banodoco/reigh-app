import { useCallback, useRef } from 'react';
import type { TimelineAction, TimelineRow } from '@xzdarcy/timeline-engine';
import { buildRowTrackPatches } from '@/tools/video-editor/lib/coordinate-utils';
import { getSourceTime, type ClipMeta, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';

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

    const nextRows = current.rows.map((entry) => {
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

    applyTimelineEdit(nextRows, metaUpdates);
    delete resizeStartRef.current[action.id];
  }, [applyTimelineEdit, dataRef]);

  return {
    onActionResizeStart,
    onActionResizeEnd,
  };
}
