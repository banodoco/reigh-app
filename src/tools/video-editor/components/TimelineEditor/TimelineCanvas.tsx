import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { DndContext, closestCenter, type DragEndEvent, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Layers } from 'lucide-react';
import { TrackLabelContent } from '@/tools/video-editor/components/TimelineEditor/TrackLabel';
import { TimeRuler } from '@/tools/video-editor/components/TimelineEditor/TimeRuler';
import { LABEL_WIDTH } from '@/tools/video-editor/lib/coordinate-utils';
import { snapResize } from '@/tools/video-editor/lib/snap-edges';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineCanvasHandle, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
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
  getActionRender?: (action: TimelineAction, row: TimelineRow) => ReactNode;
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

interface SortableRowProps {
  row: TimelineRow;
  track: TrackDefinition;
  rowHeight: number;
  startLeft: number;
  pixelsPerSecond: number;
  selectedTrackId: string | null;
  resizeOverrides: Record<string, ResizeOverride>;
  getActionRender?: (action: TimelineAction, row: TimelineRow) => ReactNode;
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

function SortableRow({
  row,
  track,
  rowHeight,
  startLeft,
  pixelsPerSecond,
  selectedTrackId,
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
            className="group absolute"
            data-action-id={action.id}
            data-row-id={row.id}
            style={{
              left,
              top: ACTION_VERTICAL_MARGIN,
              width,
              height: actionHeight,
            }}
          >
            {getActionRender?.(renderedAction, row)}
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
}

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
  onScroll,
  marqueeRect,
  onEditAreaPointerDown,
  onAddTrack,
  onAddTextAt,
  unusedTrackCount = 0,
  onClearUnusedTracks,
  newTrackDropLabel,
}: TimelineCanvasProps, ref) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const resizePreviewRef = useRef<Record<string, ResizeOverride>>({});
  const timeRef = useRef(0);
  const playRateRef = useRef(1);
  const scrollMetricsRef = useRef<ScrollMetrics>({ scrollLeft: 0, scrollTop: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [resizeOverrides, setResizeOverrides] = useState<Record<string, ResizeOverride>>({});

  const pixelsPerSecond = scaleWidth / Math.max(scale, Number.EPSILON);
  const minDuration = MIN_ACTION_WIDTH_PX / pixelsPerSecond;
  const maxEnd = useMemo(() => rows.reduce(
    (currentMax, row) => row.actions.reduce((rowMax, action) => Math.max(rowMax, action.end), currentMax),
    0,
  ), [rows]);
  const derivedScaleCount = Math.ceil(maxEnd / Math.max(scale, Number.EPSILON)) + 1;
  const scaleCount = clamp(derivedScaleCount, minScaleCount, maxScaleCount);
  const totalWidth = startLeft + scaleCount * scaleWidth;
  const totalHeight = Math.max(rows.length * rowHeight, rowHeight);

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

    resizeSessionRef.current = {
      pointerId: event.pointerId,
      actionId: action.id,
      rowId: row.id,
      dir,
      initialStart: action.start,
      initialEnd: action.end,
      initialClientX: event.clientX,
    };
    resizePreviewRef.current[action.id] = {
      start: action.start,
      end: action.end,
    };
    setResizeOverrides((current) => ({
      ...current,
      [action.id]: {
        start: action.start,
        end: action.end,
      },
    }));
    onActionResizeStart?.({ action, row, dir });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, [onActionResizeStart]);

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
                    resizeOverrides={resizeOverrides}
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
            {newTrackDropLabel ? (
              <div className="flex-1 rounded-md border border-dashed border-sky-400/40 bg-sky-950/45 py-3 pointer-events-none" />
            ) : onAddTextAt ? (
              <>
                <div
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text-tool', 'true');
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-sky-500/15 text-sky-400 ring-1 ring-sky-400/30 transition-all hover:bg-sky-500/25 hover:ring-sky-400/50 active:cursor-grabbing"
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
                  className="flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-violet-500/15 text-violet-400 ring-1 ring-violet-400/30 transition-all hover:bg-violet-500/25 hover:ring-violet-400/50 active:cursor-grabbing"
                  title="Drag onto timeline to add an effect layer"
                >
                  <Layers className="h-3 w-3" />
                </div>
              </>
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
    </div>
  );
});
