import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { DndContext, closestCenter, type DragEndEvent, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Layers, Loader2, Video } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { usePortalMousedownGuard } from '@/shared/hooks/usePortalMousedownGuard';
import {
  ShotGroupContextMenu,
  type ShotGroupMenuState,
} from '@/tools/video-editor/components/TimelineEditor/ShotGroupContextMenu';
import { TrackLabelContent } from '@/tools/video-editor/components/TimelineEditor/TrackLabel';
import type { ShotGroup } from '@/tools/video-editor/hooks/useShotGroups';
import { useTimelineEditorData } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { TimeRuler } from '@/tools/video-editor/components/TimelineEditor/TimeRuler';
import { LABEL_WIDTH } from '@/tools/video-editor/lib/coordinate-utils';
import { snapResize } from '@/tools/video-editor/lib/snap-edges';
import { getSourceTime, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineCanvasHandle, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import type { DragSession } from '@/tools/video-editor/hooks/useClipDrag';
import type { MarqueeRect } from '@/tools/video-editor/hooks/useMarqueeSelect';

interface ScrollMetrics {
  scrollLeft: number;
  scrollTop: number;
}

type ResizeDir = 'left' | 'right';

interface ResizeOverride {
  start: number;
  end: number;
}

interface ResizeSession {
  pointerId: number;
  actionId: string;
  rowId: string;
  dir: ResizeDir;
  initialStart: number;
  initialEnd: number;
  initialClientX: number;
  minStart?: number;
  maxEnd?: number;
}

interface PositionedShotGroup {
  key: string;
  shotId: string;
  shotName: string;
  clipIds: string[];
  rowId: string;
  color: string;
  mode?: 'images' | 'video';
  hasFinalVideo: boolean;
  hasActiveTask: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimelineCanvasProps {
  rows: TimelineRow[];
  tracks: TrackDefinition[];
  scale: number;
  scaleWidth: number;
  scaleSplitCount: number;
  startLeft: number;
  rowHeight: number;
  minScaleCount: number;
  maxScaleCount: number;
  selectedTrackId: string | null;
  getActionRender?: (action: TimelineAction, row: TimelineRow, width: number) => ReactNode;
  onSelectTrack: (trackId: string) => void;
  onTrackChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onRemoveTrack: (trackId: string) => void;
  onTrackDragEnd: (event: DragEndEvent) => void;
  trackSensors: ReturnType<typeof useSensors>;
  onCursorDrag: (time: number) => void;
  onClickTimeArea: (time: number) => void;
  onActionResizeStart?: (params: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => void;
  onActionResizing?: (params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: ResizeDir }) => void;
  onActionResizeEnd?: (params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: ResizeDir }) => void;
  shotGroups?: ShotGroup[];
  finalVideoMap?: Map<string, unknown>;
  activeTaskClipIds?: Set<string>;
  onShotGroupNavigate?: (shotId: string) => void;
  onShotGroupGenerateVideo?: (shotId: string) => void;
  onShotGroupSwitchToFinalVideo?: (group: { shotId: string; clipIds: string[]; rowId: string }) => void;
  onShotGroupSwitchToImages?: (group: { shotId: string; rowId: string }) => void;
  onShotGroupUnpin?: (group: { shotId: string; trackId: string }) => void;
  onSelectClips?: (clipIds: string[]) => void;
  dragSessionRef?: MutableRefObject<DragSession | null>;
  onScroll?: (metrics: ScrollMetrics) => void;
  marqueeRect?: MarqueeRect | null;
  onEditAreaPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onAddTrack?: (kind: 'visual' | 'audio') => void;
  onAddTextAt?: (trackId: string, time: number) => void;
  unusedTrackCount?: number;
  onClearUnusedTracks?: () => void;
  newTrackDropLabel?: string | null;
}

const ACTION_VERTICAL_MARGIN = 4;
const CURSOR_WIDTH = 2;
const RESIZE_HANDLE_WIDTH = 8;
const MIN_ACTION_WIDTH_PX = 24;
const SNAP_THRESHOLD_PX = 8;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const buildGridBackground = (startLeft: number, scaleWidth: number, scaleSplitCount: number): string => {
  const splitWidth = scaleWidth / Math.max(scaleSplitCount, 1);
  // Vertical grid lines only — horizontal lines come from row borders
  return [
    `repeating-linear-gradient(to right, hsl(var(--border) / 0.55) 0, hsl(var(--border) / 0.55) 1px, transparent 1px, transparent ${scaleWidth}px)`,
    `repeating-linear-gradient(to right, hsl(var(--border) / 0.25) 0, hsl(var(--border) / 0.25) 1px, transparent 1px, transparent ${splitWidth}px)`,
  ].join(',');
};

const getAudioResizeLimits = (
  data: TimelineData | null,
  action: TimelineAction,
  row: TimelineRow,
  dir: ResizeDir,
): Pick<ResizeSession, 'minStart' | 'maxEnd'> => {
  if (!data) {
    return {};
  }

  const clipMeta = data.meta[action.id];
  if (!clipMeta || typeof clipMeta.hold === 'number') {
    return {};
  }

  const trackKind = data.tracks.find((track) => track.id === row.id)?.kind
    ?? data.tracks.find((track) => track.id === clipMeta.track)?.kind;
  if (trackKind !== 'audio') {
    return {};
  }

  const speed = clipMeta.speed ?? 1;
  if (speed <= 0) {
    return {};
  }

  const from = clipMeta.from ?? 0;
  const to = getSourceTime({ from, start: action.start, speed }, action.end);

  if (dir === 'left') {
    return {
      minStart: action.end - (to / speed),
    };
  }

  const assetDuration = clipMeta.asset
    ? data.resolvedConfig.registry[clipMeta.asset]?.duration ?? data.registry.assets[clipMeta.asset]?.duration
    : undefined;
  if (typeof assetDuration !== 'number') {
    return {};
  }

  return {
    maxEnd: action.start + Math.max(0, assetDuration - from) / speed,
  };
};

interface SortableRowProps {
  row: TimelineRow;
  track: TrackDefinition;
  rowHeight: number;
  startLeft: number;
  pixelsPerSecond: number;
  selectedTrackId: string | null;
  resizeClampedActionId: string | null;
  resizeOverrides: Readonly<Record<string, ResizeOverride>>;
  getActionRender?: (action: TimelineAction, row: TimelineRow, width: number) => ReactNode;
  onSelectTrack: (trackId: string) => void;
  onTrackChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onRemoveTrack: (trackId: string) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    action: TimelineAction,
    row: TimelineRow,
    dir: ResizeDir,
  ) => void;
  onResizePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeEnd: (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => void;
}

const EMPTY_RESIZE_OVERRIDES: Readonly<Record<string, ResizeOverride>> = Object.freeze({});

const SortableRow = React.memo(function SortableRow({
  row,
  track,
  rowHeight,
  startLeft,
  pixelsPerSecond,
  selectedTrackId,
  resizeClampedActionId,
  resizeOverrides,
  getActionRender,
  onSelectTrack,
  onTrackChange,
  onRemoveTrack,
  onResizePointerDown,
  onResizePointerMove,
  onResizeEnd,
}: SortableRowProps) {
  const sortable = useSortable({ id: `track-${track.id}` });
  const actionHeight = Math.max(12, rowHeight - ACTION_VERTICAL_MARGIN * 2);
  const style = {
    height: rowHeight,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
    // Rows must sit above the ::before gutter overlay (z-index 6) so that
    // track labels remain visible when dnd-kit applies transforms (which
    // create a new stacking context, trapping the label's local z-index).
    zIndex: 7,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className="relative border-b border-border/30"
      data-row-id={row.id}
      style={style}
    >
      <div
        className="absolute left-0 top-0 z-10 h-full border-r border-border bg-card"
        style={{ width: LABEL_WIDTH, position: 'sticky', left: 0 }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <TrackLabelContent
          track={track}
          isSelected={selectedTrackId === track.id}
          hasClips={row.actions.length > 0}
          onSelect={onSelectTrack}
          onChange={onTrackChange}
          onRemove={onRemoveTrack}
          dragListeners={sortable.listeners}
          dragAttributes={sortable.attributes}
        />
      </div>
      {row.actions.map((action) => {
        const override = resizeOverrides[action.id];
        const renderedAction = override ? { ...action, ...override } : action;
        const left = startLeft + renderedAction.start * pixelsPerSecond;
        const width = Math.max((renderedAction.end - renderedAction.start) * pixelsPerSecond, 1);

        return (
          <div
            key={action.id}
            className={cn(
              'group absolute',
              resizeClampedActionId === action.id && 'rounded-md ring-2 ring-amber-400/80 ring-offset-1 ring-offset-background',
            )}
            data-action-id={action.id}
            data-row-id={row.id}
            style={{
              left,
              top: ACTION_VERTICAL_MARGIN,
              width,
              height: actionHeight,
            }}
          >
            {getActionRender?.(renderedAction, row, width)}
            <div
              className="absolute inset-y-0 left-0 z-10 cursor-ew-resize rounded-l-sm border-l border-sky-300/10 bg-sky-300/0 transition-colors group-hover:bg-sky-300/10"
              style={{ width: RESIZE_HANDLE_WIDTH }}
              onPointerDown={(event) => onResizePointerDown(event, renderedAction, row, 'left')}
              onPointerMove={onResizePointerMove}
              onPointerUp={(event) => onResizeEnd(event, false)}
              onPointerCancel={(event) => onResizeEnd(event, true)}
            />
            <div
              className="absolute inset-y-0 right-0 z-10 cursor-ew-resize rounded-r-sm border-r border-sky-300/10 bg-sky-300/0 transition-colors group-hover:bg-sky-300/10"
              style={{ width: RESIZE_HANDLE_WIDTH }}
              onPointerDown={(event) => onResizePointerDown(event, renderedAction, row, 'right')}
              onPointerMove={onResizePointerMove}
              onPointerUp={(event) => onResizeEnd(event, false)}
              onPointerCancel={(event) => onResizeEnd(event, true)}
            />
          </div>
        );
      })}
    </div>
  );
});

SortableRow.displayName = 'SortableRow';

export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(function TimelineCanvas({
  rows,
  tracks,
  scale,
  scaleWidth,
  scaleSplitCount,
  startLeft,
  rowHeight,
  minScaleCount,
  maxScaleCount,
  selectedTrackId,
  getActionRender,
  onSelectTrack,
  onTrackChange,
  onRemoveTrack,
  onTrackDragEnd,
  trackSensors,
  onCursorDrag,
  onClickTimeArea,
  onActionResizeStart,
  onActionResizing,
  onActionResizeEnd,
  shotGroups = [],
  finalVideoMap,
  activeTaskClipIds,
  onShotGroupNavigate,
  onShotGroupGenerateVideo,
  onShotGroupSwitchToFinalVideo,
  onShotGroupSwitchToImages,
  onShotGroupUnpin,
  onSelectClips,
  dragSessionRef,
  onScroll,
  marqueeRect,
  onEditAreaPointerDown,
  onAddTrack,
  onAddTextAt,
  unusedTrackCount = 0,
  onClearUnusedTracks,
  newTrackDropLabel,
}: TimelineCanvasProps, ref) {
  const { pendingOpsRef, dataRef } = useTimelineEditorData();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const resizePreviewRef = useRef<Record<string, ResizeOverride>>({});
  const timeRef = useRef(0);
  const playRateRef = useRef(1);
  const scrollMetricsRef = useRef<ScrollMetrics>({ scrollLeft: 0, scrollTop: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [resizeClampedActionId, setResizeClampedActionId] = useState<string | null>(null);
  const [resizeOverrides, setResizeOverrides] = useState<Record<string, ResizeOverride>>({});
  const [shotGroupMenu, setShotGroupMenu] = useState<ShotGroupMenuState>(null);
  const shotGroupMenuRef = useRef<HTMLDivElement>(null);
  useRenderDiagnostic('TimelineCanvas');

  usePortalMousedownGuard(shotGroupMenuRef, Boolean(shotGroupMenu));

  useEffect(() => {
    if (!shotGroupMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shotGroupMenuRef.current && !shotGroupMenuRef.current.contains(e.target as Node)) {
        setShotGroupMenu(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShotGroupMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [shotGroupMenu]);

  const pixelsPerSecond = scaleWidth / Math.max(scale, Number.EPSILON);
  const minDuration = MIN_ACTION_WIDTH_PX / pixelsPerSecond;
  const actionHeight = Math.max(12, rowHeight - ACTION_VERTICAL_MARGIN * 2);
  const maxEnd = useMemo(() => rows.reduce(
    (currentMax, row) => row.actions.reduce((rowMax, action) => Math.max(rowMax, action.end), currentMax),
    0,
  ), [rows]);
  const derivedScaleCount = Math.ceil(maxEnd / Math.max(scale, Number.EPSILON)) + 1;
  const scaleCount = clamp(derivedScaleCount, minScaleCount, maxScaleCount);
  const totalWidth = startLeft + scaleCount * scaleWidth;
  const totalHeight = Math.max(rows.length * rowHeight, rowHeight);
  const rowActionMaps = useMemo(
    () => rows.map((row) => new Map(row.actions.map((action) => [action.id, action] as const))),
    [rows],
  );
  const hasResizeOverrides = Object.keys(resizeOverrides).length > 0;
  const rowResizeOverrides = useMemo(
    () => rows.map<Readonly<Record<string, ResizeOverride>>>((row) => {
      let overridesForRow: Record<string, ResizeOverride> | null = null;
      for (const action of row.actions) {
        const override = resizeOverrides[action.id];
        if (!override) {
          continue;
        }

        if (!overridesForRow) {
          overridesForRow = {};
        }
        overridesForRow[action.id] = override;
      }

      return overridesForRow ?? EMPTY_RESIZE_OVERRIDES;
    }),
    [resizeOverrides, rows],
  );
  const positionedShotGroups = useMemo(() => {
    const snapThresholdSeconds = SNAP_THRESHOLD_PX / pixelsPerSecond;

    return shotGroups.flatMap<PositionedShotGroup>((group) => {
      const row = rows[group.rowIndex];
      if (!row || row.id !== group.rowId) {
        return [];
      }

      const actionMap = rowActionMaps[group.rowIndex];
      const actions: TimelineAction[] = [];
      for (const clipId of group.clipIds) {
        const action = actionMap.get(clipId);
        if (!action) {
          return [];
        }

        const override = resizeOverrides[clipId];
        actions.push(override ? { ...action, ...override } : action);
      }

      if (actions.length === 0) {
        return [];
      }

      for (let index = 1; index < actions.length; index += 1) {
        const previous = actions[index - 1];
        const current = actions[index];
        if (current.start < previous.start || current.start - previous.end > snapThresholdSeconds) {
          return [];
        }
      }

      const first = actions[0];
      const last = actions[actions.length - 1];

      return [{
        key: `${group.shotId}:${group.rowId}:${group.clipIds.join(',')}`,
        shotId: group.shotId,
        shotName: group.shotName,
        clipIds: group.clipIds,
        rowId: group.rowId,
        color: group.color,
        mode: group.mode,
        hasFinalVideo: finalVideoMap?.has(group.shotId) ?? false,
        hasActiveTask: activeTaskClipIds ? group.clipIds.some((id) => activeTaskClipIds.has(id)) : false,
        left: startLeft + first.start * pixelsPerSecond,
        top: group.rowIndex * rowHeight + ACTION_VERTICAL_MARGIN,
        width: Math.max((last.end - first.start) * pixelsPerSecond, 1),
        height: actionHeight,
      }];
    });
  }, [actionHeight, activeTaskClipIds, finalVideoMap, pixelsPerSecond, resizeOverrides, rowActionMaps, rowHeight, rows, shotGroups, startLeft]);
  const hideShotGroups = dragSessionRef?.current !== null || hasResizeOverrides;
  const openShotGroupMenu = useCallback((
    x: number,
    y: number,
    group: Pick<PositionedShotGroup, 'shotId' | 'shotName' | 'clipIds' | 'rowId' | 'hasFinalVideo' | 'mode'>,
  ) => {
    setShotGroupMenu({ x, y, ...group, trackId: group.rowId } as NonNullable<ShotGroupMenuState>);
  }, []);

  const syncCursor = useCallback((time = timeRef.current) => {
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }

    const left = startLeft + time * pixelsPerSecond;
    cursor.style.transform = `translateX(${left}px)`;
  }, [pixelsPerSecond, startLeft]);

  const handleSetTime = useCallback((time: number) => {
    timeRef.current = Math.max(0, time);
    syncCursor(timeRef.current);
  }, [syncCursor]);

  useEffect(() => {
    syncCursor();
  }, [syncCursor]);

  useImperativeHandle(ref, () => ({
    get target() {
      return scrollContainerRef.current;
    },
    listener: null,
    isPlaying: false,
    isPaused: true,
    setTime: handleSetTime,
    getTime: () => timeRef.current,
    setPlayRate: (rate: number) => {
      playRateRef.current = rate;
    },
    getPlayRate: () => playRateRef.current,
    reRender: () => syncCursor(),
    play: ({ toTime }) => {
      if (typeof toTime === 'number') {
        handleSetTime(toTime);
      }
      return false;
    },
    pause: () => {},
    setScrollLeft: (value: number) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = Math.max(0, value);
      }
    },
  }), [handleSetTime, syncCursor]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const nextMetrics = {
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };

    scrollMetricsRef.current = nextMetrics;
    if (nextMetrics.scrollLeft !== scrollLeft) {
      setScrollLeft(nextMetrics.scrollLeft);
    }
    syncCursor();
    onScroll?.(nextMetrics);
  };

  const clearResizeOverride = useCallback((actionId: string) => {
    delete resizePreviewRef.current[actionId];
    setResizeOverrides((current) => {
      if (!(actionId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[actionId];
      return next;
    });
  }, []);

  const getResizeContext = useCallback((actionId: string, rowId: string) => {
    const row = rows.find((candidate) => candidate.id === rowId);
    const action = row?.actions.find((candidate) => candidate.id === actionId);
    if (!row || !action) {
      return null;
    }

    const override = resizePreviewRef.current[actionId] ?? resizeOverrides[actionId];
    return {
      row,
      action: override ? { ...action, ...override } : action,
    };
  }, [resizeOverrides, rows]);

  const updateResize = useCallback((session: ResizeSession, clientX: number) => {
    const deltaSeconds = (clientX - session.initialClientX) / pixelsPerSecond;
    let start = session.dir === 'left'
      ? clamp(session.initialStart + deltaSeconds, 0, session.initialEnd - minDuration)
      : session.initialStart;
    let end = session.dir === 'right'
      ? Math.max(session.initialStart + minDuration, session.initialEnd + deltaSeconds)
      : session.initialEnd;

    // Snap the resizing edge to sibling clip edges
    const row = rows.find((r) => r.id === session.rowId);
    if (row) {
      const snapThresholdS = SNAP_THRESHOLD_PX / pixelsPerSecond;
      const snapped = snapResize(start, end, session.dir, row.actions, session.actionId, snapThresholdS);
      start = snapped.start;
      end = snapped.end;
    }

    // Re-enforce min duration after snap
    if (end - start < minDuration) {
      if (session.dir === 'left') {
        start = end - minDuration;
      } else {
        end = start + minDuration;
      }
    }

    let resizeClamped = false;
    if (typeof session.minStart === 'number' && start < session.minStart) {
      start = session.minStart;
      resizeClamped = true;
    }
    if (typeof session.maxEnd === 'number' && end > session.maxEnd) {
      end = session.maxEnd;
      resizeClamped = true;
    }

    const context = getResizeContext(session.actionId, session.rowId);
    if (!context) {
      return;
    }

    const nextAction = {
      ...context.action,
      start,
      end,
    };

    resizePreviewRef.current[session.actionId] = { start, end };
    setResizeOverrides((current) => ({
      ...current,
      [session.actionId]: { start, end },
    }));
    setResizeClampedActionId((current) => (
      resizeClamped
        ? session.actionId
        : current === session.actionId
          ? null
          : current
    ));
    onActionResizing?.({
      action: nextAction,
      row: context.row,
      start,
      end,
      dir: session.dir,
    });
  }, [getResizeContext, minDuration, onActionResizing, pixelsPerSecond, rows]);

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    resizeSessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pendingOpsRef.current -= 1;
    setResizeClampedActionId((current) => (current === session.actionId ? null : current));
    const context = getResizeContext(session.actionId, session.rowId);
    if (!cancelled && context) {
      onActionResizeEnd?.({
        action: context.action,
        row: context.row,
        start: context.action.start,
        end: context.action.end,
        dir: session.dir,
      });
    }

    clearResizeOverride(session.actionId);
  }, [clearResizeOverride, getResizeContext, onActionResizeEnd]);

  const handleResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    action: TimelineAction,
    row: TimelineRow,
    dir: ResizeDir,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const resizeLimits = getAudioResizeLimits(dataRef.current, action, row, dir);
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      actionId: action.id,
      rowId: row.id,
      dir,
      initialStart: action.start,
      initialEnd: action.end,
      initialClientX: event.clientX,
      ...resizeLimits,
    };
    resizePreviewRef.current[action.id] = {
      start: action.start,
      end: action.end,
    };
    setResizeClampedActionId(null);
    setResizeOverrides((current) => ({
      ...current,
      [action.id]: {
        start: action.start,
        end: action.end,
      },
    }));
    onActionResizeStart?.({ action, row, dir });
    pendingOpsRef.current += 1;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [dataRef, onActionResizeStart]);

  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    updateResize(session, event.clientX);
  }, [updateResize]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-background/70">
      {unusedTrackCount > 0 && onClearUnusedTracks && (
        <button
          type="button"
          className="absolute left-0 top-0 z-20 flex h-[30px] items-center justify-center border-b border-r border-border bg-card/90 text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          style={{ width: LABEL_WIDTH }}
          onClick={onClearUnusedTracks}
        >
          Clear {unusedTrackCount} unused
        </button>
      )}
      <TimeRuler
        scale={scale}
        scaleWidth={scaleWidth}
        scaleSplitCount={scaleSplitCount}
        startLeft={startLeft}
        scrollLeft={scrollLeft}
        totalWidth={totalWidth}
        onClickTimeArea={onClickTimeArea}
        onCursorDrag={onCursorDrag}
      />
      <div
        ref={scrollContainerRef}
        className="timeline-canvas-edit-area timeline-scroll relative min-h-0 flex-1 overflow-auto overscroll-contain bg-background/70"
        style={{ '--label-width': `${LABEL_WIDTH}px` } as React.CSSProperties}
        onPointerDown={onEditAreaPointerDown}
        onScroll={handleScroll}
      >
        <div
          className="relative"
          style={{
            width: totalWidth,
            backgroundImage: buildGridBackground(startLeft, scaleWidth, scaleSplitCount),
            backgroundPosition: `${startLeft}px 0, ${startLeft}px 0`,
          }}
        >
          {marqueeRect && (
            <div
              className="pointer-events-none absolute z-30 border border-sky-400 bg-sky-400/10"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          )}
          {newTrackDropLabel?.includes('at top') && (
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-1 bg-sky-400/60" style={{ marginLeft: LABEL_WIDTH }} />
          )}
          {!hideShotGroups && positionedShotGroups.map((group) => (
            <React.Fragment key={group.key}>
              <div
                className="pointer-events-none absolute rounded-md border-2 border-solid transition-colors"
                style={{
                  left: group.left - 2,
                  top: group.top - 2,
                  width: group.width + 4,
                  height: group.height + 4,
                  zIndex: 1,
                  borderColor: `color-mix(in srgb, ${group.color} 60%, transparent)`,
                }}
              />
              <div
                className="absolute rounded-t-sm opacity-0 transition-opacity hover:opacity-100"
                title={group.shotName}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectClips?.(group.clipIds);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openShotGroupMenu(e.clientX, e.clientY, group);
                }}
                style={{
                  left: group.left,
                  top: group.top - 18,
                  width: group.width,
                  height: 18,
                  zIndex: 8,
                  pointerEvents: 'auto',
                  background: `color-mix(in srgb, ${group.color} 78%, transparent)`,
                }}
              >
                <span
                  className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-[10px] font-medium"
                  style={{ color: `color-mix(in srgb, white 92%, ${group.color})` }}
                >
                  {group.shotName}
                </span>
              </div>
              {group.hasFinalVideo && (
                <button
                  type="button"
                  className="absolute flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm transition-transform hover:scale-105 hover:bg-sky-400"
                  title="Final video available"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openShotGroupMenu(event.clientX, event.clientY, { ...group, hasFinalVideo: true });
                  }}
                  style={{
                    left: group.left + group.width - 10,
                    top: group.top + group.height / 2 - 10,
                    zIndex: 9,
                    pointerEvents: 'auto',
                  }}
                >
                  <Video className="h-3 w-3" />
                </button>
              )}
              {group.hasActiveTask && (
                <div
                  className="pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
                  title="Task in progress"
                  style={{
                    left: group.left + group.width - 10,
                    top: group.top + group.height / 2 - 10,
                    zIndex: 9,
                    backgroundColor: 'rgba(255,255,255,0.9)',
                  }}
                >
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: group.color }} />
                </div>
              )}
            </React.Fragment>
          ))}
          <ShotGroupContextMenu
            menu={shotGroupMenu}
            menuRef={shotGroupMenuRef}
            closeMenu={() => setShotGroupMenu(null)}
            onNavigate={onShotGroupNavigate}
            onGenerateVideo={onShotGroupGenerateVideo}
            onSwitchToFinalVideo={onShotGroupSwitchToFinalVideo}
            onSwitchToImages={onShotGroupSwitchToImages}
            onUnpinGroup={onShotGroupUnpin}
          />
          <DndContext
            sensors={trackSensors}
            collisionDetection={closestCenter}
            onDragEnd={onTrackDragEnd}
          >
            <SortableContext
              items={tracks.map((track) => `track-${track.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {tracks.map((track, index) => {
                const row = rows[index];
                if (!row) {
                  return null;
                }

                return (
                  <SortableRow
                    key={track.id}
                    row={row}
                    track={track}
                    rowHeight={rowHeight}
                    startLeft={startLeft}
                    pixelsPerSecond={pixelsPerSecond}
                    selectedTrackId={selectedTrackId}
                    resizeClampedActionId={resizeClampedActionId}
                    resizeOverrides={rowResizeOverrides[index] ?? EMPTY_RESIZE_OVERRIDES}
                    getActionRender={getActionRender}
                    onSelectTrack={onSelectTrack}
                    onTrackChange={onTrackChange}
                    onRemoveTrack={onRemoveTrack}
                    onResizePointerDown={handleResizePointerDown}
                    onResizePointerMove={handleResizePointerMove}
                    onResizeEnd={endResize}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
        {/* Footer: + Video / + Audio split buttons and draggable text tool — outside the grid background div */}
        <div className="relative flex border-t border-border bg-background/70" style={{ height: rowHeight, width: totalWidth }}>
          <div
            className="z-10 flex bg-card"
            style={{ width: LABEL_WIDTH, position: 'sticky', left: 0 }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {onAddTrack && (
              <>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-0.5 border-r border-border/50 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onAddTrack('visual')}
                >
                  + Video
                </button>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => onAddTrack('audio')}
                >
                  + Audio
                </button>
              </>
            )}
          </div>
          <div className="flex flex-1 items-center gap-2 px-2" style={{ position: 'sticky', left: LABEL_WIDTH }}>
            {newTrackDropLabel && newTrackDropLabel.includes('at bottom') ? (
              <div className="flex-1 h-1 rounded-full bg-sky-400/60 pointer-events-none" />
            ) : null}
          </div>
        </div>
        <div
          ref={cursorRef}
          className="pointer-events-none absolute inset-y-0 top-0 z-[5] bg-sky-400/95 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
          style={{
            width: CURSOR_WIDTH,
            transform: `translateX(${startLeft}px)`,
          }}
        />
      </div>
      {/* Floating tool buttons — bottom-left of timeline viewport */}
      {onAddTextAt && (
        <div className="pointer-events-none absolute bottom-4 z-30 flex gap-1.5" style={{ left: LABEL_WIDTH + 8 }}>
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('text-tool', 'true');
              event.dataTransfer.effectAllowed = 'copy';
            }}
            className="pointer-events-auto flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-sky-500/15 text-sky-400 ring-1 ring-sky-400/30 transition-all hover:bg-sky-500/25 hover:ring-sky-400/50 active:cursor-grabbing"
            title="Drag onto timeline to add text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
          </div>
          <div
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('effect-layer', 'true');
              event.dataTransfer.effectAllowed = 'copy';
            }}
            className="pointer-events-auto flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-violet-500/15 text-violet-400 ring-1 ring-violet-400/30 transition-all hover:bg-violet-500/25 hover:ring-violet-400/50 active:cursor-grabbing"
            title="Drag onto timeline to add an effect layer"
          >
            <Layers className="h-3 w-3" />
          </div>
        </div>
      )}
    </div>
  );
});
