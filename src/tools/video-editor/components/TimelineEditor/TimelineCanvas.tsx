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
  type RefObject,
  type UIEvent,
} from 'react';
import { TimeRuler } from '@/tools/video-editor/components/TimelineEditor/TimeRuler';
import { snapResize } from '@/tools/video-editor/lib/snap-edges';
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
  scale: number;
  scaleWidth: number;
  scaleSplitCount: number;
  startLeft: number;
  rowHeight: number;
  minScaleCount: number;
  maxScaleCount: number;
  getActionRender?: (action: TimelineAction, row: TimelineRow) => ReactNode;
  onCursorDrag: (time: number) => void;
  onClickTimeArea: (time: number) => void;
  onActionResizeStart?: (params: { action: TimelineAction; row: TimelineRow; dir: ResizeDir }) => void;
  onActionResizing?: (params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: ResizeDir }) => void;
  onActionResizeEnd?: (params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: ResizeDir }) => void;
  onScroll?: (metrics: ScrollMetrics) => void;
  trackLabelRef?: RefObject<HTMLElement | null>;
  marqueeRect?: MarqueeRect | null;
  onEditAreaPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onAddText?: () => void;
}

const ACTION_VERTICAL_MARGIN = 4;
const CURSOR_WIDTH = 2;
const RESIZE_HANDLE_WIDTH = 8;
const MIN_ACTION_WIDTH_PX = 24;
const SNAP_THRESHOLD_PX = 8;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const buildGridBackground = (startLeft: number, scaleWidth: number, scaleSplitCount: number, rowHeight: number): string => {
  const splitWidth = scaleWidth / Math.max(scaleSplitCount, 1);
  // Use theme-aware colors via hsl(var(--border)) and hsl(var(--background))
  return [
    `linear-gradient(to right, hsl(var(--background)) 0, hsl(var(--background)) ${startLeft}px, transparent ${startLeft}px)`,
    `repeating-linear-gradient(to right, hsl(var(--border) / 0.55) 0, hsl(var(--border) / 0.55) 1px, transparent 1px, transparent ${scaleWidth}px)`,
    `repeating-linear-gradient(to right, hsl(var(--border) / 0.25) 0, hsl(var(--border) / 0.25) 1px, transparent 1px, transparent ${splitWidth}px)`,
    `repeating-linear-gradient(to bottom, hsl(var(--border) / 0.5) 0, hsl(var(--border) / 0.5) 1px, transparent 1px, transparent ${rowHeight}px)`,
  ].join(',');
};

export const TimelineCanvas = forwardRef<TimelineCanvasHandle, TimelineCanvasProps>(function TimelineCanvas({
  rows,
  scale,
  scaleWidth,
  scaleSplitCount,
  startLeft,
  rowHeight,
  minScaleCount,
  maxScaleCount,
  getActionRender,
  onCursorDrag,
  onClickTimeArea,
  onActionResizeStart,
  onActionResizing,
  onActionResizeEnd,
  onScroll,
  trackLabelRef,
  marqueeRect,
  onEditAreaPointerDown,
  onAddText,
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
    setScrollTop: (value: number) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = Math.max(0, value);
      }
    },
  }), [handleSetTime, syncCursor]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const nextMetrics = {
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };

    scrollMetricsRef.current = nextMetrics;
    if (trackLabelRef?.current && trackLabelRef.current.scrollTop !== nextMetrics.scrollTop) {
      trackLabelRef.current.scrollTop = nextMetrics.scrollTop;
    }
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
    <div className="flex h-full min-h-0 flex-col bg-background/70">
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
        className="timeline-canvas-edit-area timeline-scroll relative min-h-0 flex-1 overflow-auto overscroll-contain"
        onPointerDown={onEditAreaPointerDown}
        onScroll={handleScroll}
      >
        <div
          className="relative"
          style={{
            width: totalWidth,
            height: totalHeight,
            minHeight: '100%',
            backgroundImage: buildGridBackground(startLeft, scaleWidth, scaleSplitCount, rowHeight),
            backgroundPosition: `${startLeft}px 0, ${startLeft}px 0, ${startLeft}px 0, 0 0`,
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
          {rows.map((row, rowIndex) => {
            const top = rowIndex * rowHeight;
            const actionHeight = Math.max(12, rowHeight - ACTION_VERTICAL_MARGIN * 2);

            return (
              <div
                key={row.id}
                className="absolute left-0 right-0"
                data-row-id={row.id}
                style={{ top, height: rowHeight }}
              >
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
                        onPointerDown={(event) => handleResizePointerDown(event, renderedAction, row, 'left')}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={(event) => endResize(event, false)}
                        onPointerCancel={(event) => endResize(event, true)}
                      />
                      <div
                        className="absolute inset-y-0 right-0 z-10 cursor-ew-resize rounded-r-sm border-r border-sky-300/10 bg-sky-300/0 transition-colors group-hover:bg-sky-300/10"
                        style={{ width: RESIZE_HANDLE_WIDTH }}
                        onPointerDown={(event) => handleResizePointerDown(event, renderedAction, row, 'right')}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={(event) => endResize(event, false)}
                        onPointerCancel={(event) => endResize(event, true)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          ref={cursorRef}
          className="pointer-events-none absolute inset-y-0 top-0 z-20 bg-sky-400/95 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
          style={{
            width: CURSOR_WIDTH,
            transform: `translateX(${startLeft}px)`,
          }}
        />
      </div>
    </div>
  );
});
