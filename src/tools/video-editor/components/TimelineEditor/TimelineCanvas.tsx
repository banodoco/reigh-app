import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { DndContext, closestCenter, type DragEndEvent, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Ellipsis, Layers, Loader2, RefreshCw, Video } from 'lucide-react';
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
import { notifyInteractionEndIfIdle } from '@/tools/video-editor/lib/interaction-state';
import {
  shouldExpandTouchTrimHandles,
  type TimelineDeviceClass,
  type TimelineGestureOwner,
  type TimelineInputModality,
  type TimelineInteractionMode,
} from '@/tools/video-editor/lib/mobile-interaction-model';
import {
  applyClipEdgeMove,
  snapBoundaryToSiblings,
  type ClipEdgeResizeContext,
  type ClipEdgeResizeUpdate,
  type FreeClipEdgeResizeContext,
  type ResizeDir,
} from '@/tools/video-editor/lib/resize-math';
import { getSourceTime, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';
import { useTimelineScale } from '@/tools/video-editor/hooks/useTimelineScale';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineCanvasHandle, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import type { DragSession } from '@/tools/video-editor/hooks/useClipDrag';
import type { ClipEdgeResizeEndTarget, ClipEdgeResizeSession } from '@/tools/video-editor/hooks/useClipResize';
import type { MarqueeRect } from '@/tools/video-editor/hooks/useMarqueeSelect';

interface ScrollMetrics {
  scrollLeft: number;
  scrollTop: number;
}

interface ResizeOverride {
  start: number;
  end: number;
}

interface ResizeActivationState {
  pointerId: number;
  startClientX: number;
  target: HTMLDivElement;
  isActive: boolean;
  claimedOwnership: boolean;
}

interface PositionedShotGroup {
  key: string;
  shotId: string;
  shotName: string;
  clipIds: string[];
  start: number;
  end: number;
  rowId: string;
  color: string;
  mode?: 'images' | 'video';
  hasFinalVideo: boolean;
  hasStaleVideo: boolean;
  hasActiveTask: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TimelineCanvasProps {
  rows: TimelineRow[];
  tracks: TrackDefinition[];
  deviceClass: TimelineDeviceClass;
  inputModality: TimelineInputModality;
  interactionMode: TimelineInteractionMode;
  gestureOwner: TimelineGestureOwner;
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
  setInputModalityFromPointerType: (pointerType: string | null | undefined) => TimelineInputModality;
  setGestureOwner: (owner: TimelineGestureOwner) => void;
  onActionResizeStart?: (params: {
    action: TimelineAction;
    row: TimelineRow;
    dir: ResizeDir;
  }) => void;
  onActionResizing?: (params: { action: TimelineAction; row: TimelineRow; start: number; end: number; dir: ResizeDir }) => void;
  onClipEdgeResizeEnd?: (params: ClipEdgeResizeEndTarget) => void;
  shotGroups?: ShotGroup[];
  finalVideoMap?: Map<string, unknown>;
  staleShotGroupIds?: Set<string>;
  activeTaskClipIds?: Set<string>;
  onShotGroupNavigate?: (shotId: string) => void;
  onShotGroupGenerateVideo?: (shotId: string) => void;
  onShotGroupSwitchToFinalVideo?: (group: { shotId: string; clipIds: string[]; rowId: string }) => void;
  onShotGroupSwitchToImages?: (group: { shotId: string; rowId: string }) => void;
  onShotGroupUpdateToLatestVideo?: (group: { shotId: string; rowId: string }) => void;
  onShotGroupUnpin?: (group: { shotId: string; trackId: string }) => void;
  onShotGroupDelete?: (group: { shotId: string; trackId: string; clipIds: string[] }) => void;
  onSelectClips?: (clipIds: string[]) => void;
  dragSessionRef?: MutableRefObject<DragSession | null>;
  interactionStateRef?: import('@/tools/video-editor/lib/interaction-state').InteractionStateRef;
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
const TOUCH_RESIZE_HANDLE_WIDTH = 20;
const RESIZE_ACTIVATION_THRESHOLD_PX = 4;
const MIN_ACTION_WIDTH_PX = 24;
const SNAP_THRESHOLD_PX = 8;
const SHOT_GROUP_LABEL_HEIGHT = 18;
const TIME_RULER_HEIGHT = 30;

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
): Pick<FreeClipEdgeResizeContext, 'minStart' | 'maxEnd'> => {
  if (!data?.meta || !data?.tracks) {
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

const collectSiblingTimes = (
  actions: TimelineAction[],
  excludedClipIds: readonly string[],
): number[] => {
  const excluded = new Set(excludedClipIds);
  const siblingTimes = [0];
  for (const action of actions) {
    if (excluded.has(action.id)) {
      continue;
    }
    siblingTimes.push(action.start, action.end);
  }
  return siblingTimes;
};

const getGroupPreviewKey = (shotId: string, trackId: string): string => `${shotId}:${trackId}`;

const getUpdateForClip = (
  updates: ClipEdgeResizeUpdate[],
  clipId: string,
): ClipEdgeResizeUpdate | null => updates.find((update) => update.clipId === clipId) ?? null;

const getOverrideMapForUpdates = (
  session: ClipEdgeResizeSession,
  updates: ClipEdgeResizeUpdate[],
): Record<string, ResizeOverride> => {
  const overrides: Record<string, ResizeOverride> = Object.fromEntries(
    updates.map((update) => [update.clipId, { start: update.start, end: update.end }]),
  );

  if (session.context.kind === 'outer' && updates.length > 0) {
    const start = Math.min(...updates.map((update) => update.start));
    const end = Math.max(...updates.map((update) => update.end));
    overrides[getGroupPreviewKey(session.context.shotId, session.context.trackId)] = { start, end };
  }

  return overrides;
};

const getResizePreviewIds = (session: ClipEdgeResizeSession): string[] => {
  switch (session.context.kind) {
    case 'free':
      return [session.clipId];
    case 'interior':
      return [session.clipId, session.context.adjacentClipId];
    case 'outer':
      return [
        getGroupPreviewKey(session.context.shotId, session.context.trackId),
        ...session.context.groupClipIds,
      ];
  }
};

const getPreviewUpdatesFromSnapshot = (
  session: ClipEdgeResizeSession,
  snapshot: Readonly<Record<string, ResizeOverride>>,
): ClipEdgeResizeUpdate[] => {
  switch (session.context.kind) {
    case 'free': {
      const override = snapshot[session.clipId];
      return [{
        clipId: session.clipId,
        start: override?.start ?? session.context.initialStart,
        end: override?.end ?? session.context.initialEnd,
      }];
    }
    case 'interior': {
      const draggedOverride = snapshot[session.clipId];
      const adjacentOverride = snapshot[session.context.adjacentClipId];
      return [
        {
          clipId: session.clipId,
          start: draggedOverride?.start ?? session.context.draggedInitialStart,
          end: draggedOverride?.end ?? session.context.draggedInitialEnd,
        },
        {
          clipId: session.context.adjacentClipId,
          start: adjacentOverride?.start ?? session.context.adjacentInitialStart,
          end: adjacentOverride?.end ?? session.context.adjacentInitialEnd,
        },
      ];
    }
    case 'outer':
      return session.context.groupChildrenSnapshot.map((child) => {
        const override = snapshot[child.clipId];
        return {
          clipId: child.clipId,
          start: override?.start ?? child.start,
          end: override?.end ?? child.end,
        };
      });
  }
};

const clampFreeBoundaryTime = (
  context: FreeClipEdgeResizeContext,
  edge: ResizeDir,
  boundaryTime: number,
  minimumDuration: number,
): { boundaryTime: number; limitClamped: boolean } => {
  if (edge === 'left') {
    let nextBoundaryTime = clamp(boundaryTime, 0, context.initialEnd - minimumDuration);
    let limitClamped = false;
    if (typeof context.minStart === 'number' && nextBoundaryTime < context.minStart) {
      nextBoundaryTime = context.minStart;
      limitClamped = true;
    }
    return { boundaryTime: nextBoundaryTime, limitClamped };
  }

  let nextBoundaryTime = Math.max(context.initialStart + minimumDuration, boundaryTime);
  let limitClamped = false;
  if (typeof context.maxEnd === 'number' && nextBoundaryTime > context.maxEnd) {
    nextBoundaryTime = context.maxEnd;
    limitClamped = true;
  }
  return { boundaryTime: nextBoundaryTime, limitClamped };
};

interface SortableRowProps {
  row: TimelineRow;
  track: TrackDefinition;
  rowHeight: number;
  startLeft: number;
  pixelsPerSecond: number;
  selectedTrackId: string | null;
  resizeClampedActionId: string | null;
  resizePreviewSnapshot: Readonly<Record<string, ResizeOverride>>;
  resizeHandleWidth: number;
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

const EMPTY_RESIZE_PREVIEW_SNAPSHOT: Readonly<Record<string, ResizeOverride>> = Object.freeze({});

interface ResizePreviewStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Readonly<Record<string, ResizeOverride>>;
  merge: (updates: Record<string, ResizeOverride>) => void;
  clear: (overrideIds: string[]) => void;
}

const createResizePreviewStore = (): ResizePreviewStore => {
  let snapshot: Readonly<Record<string, ResizeOverride>> = EMPTY_RESIZE_PREVIEW_SNAPSHOT;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const commit = (next: Record<string, ResizeOverride>) => {
    snapshot = Object.keys(next).length === 0 ? EMPTY_RESIZE_PREVIEW_SNAPSHOT : next;
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    merge(updates) {
      let next: Record<string, ResizeOverride> | null = null;
      for (const [key, value] of Object.entries(updates)) {
        const current = snapshot[key];
        if (current?.start === value.start && current?.end === value.end) {
          continue;
        }

        if (!next) {
          next = snapshot === EMPTY_RESIZE_PREVIEW_SNAPSHOT ? {} : { ...snapshot };
        }
        next[key] = value;
      }

      if (next) {
        commit(next);
      }
    },
    clear(overrideIds) {
      let next: Record<string, ResizeOverride> | null = null;
      for (const overrideId of overrideIds) {
        if (!(overrideId in snapshot)) {
          continue;
        }

        if (!next) {
          next = { ...snapshot };
        }
        delete next[overrideId];
      }

      if (next) {
        commit(next);
      }
    },
  };
};

const SortableRow = React.memo(function SortableRow({
  row,
  track,
  rowHeight,
  startLeft,
  pixelsPerSecond,
  selectedTrackId,
  resizeClampedActionId,
  resizePreviewSnapshot,
  resizeHandleWidth,
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
    zIndex: sortable.isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className="relative border-b border-border/30"
      data-row-id={row.id}
      style={style}
    >
      <div
        className="absolute left-0 top-0 z-20 h-full border-r border-border bg-card"
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
        // Render both handles on every clip — including grouped children.
        // Routing in handleResizePointerDown distinguishes interior child
        // boundaries (auto-shift between two children) from outer group
        // edges (delegated to the group edge resize) and starts the right
        // kind of resize session.
        const override = resizePreviewSnapshot[action.id];
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
              style={{ width: resizeHandleWidth }}
              onPointerDown={(event) => onResizePointerDown(event, renderedAction, row, 'left')}
              onPointerMove={onResizePointerMove}
              onPointerUp={(event) => onResizeEnd(event, false)}
              onPointerCancel={(event) => onResizeEnd(event, true)}
              onLostPointerCapture={(event) => onResizeEnd(event, false)}
            />
            <div
              className="absolute inset-y-0 right-0 z-10 cursor-ew-resize rounded-r-sm border-r border-sky-300/10 bg-sky-300/0 transition-colors group-hover:bg-sky-300/10"
              style={{ width: resizeHandleWidth }}
              onPointerDown={(event) => onResizePointerDown(event, renderedAction, row, 'right')}
              onPointerMove={onResizePointerMove}
              onPointerUp={(event) => onResizeEnd(event, false)}
              onPointerCancel={(event) => onResizeEnd(event, true)}
              onLostPointerCapture={(event) => onResizeEnd(event, false)}
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
  deviceClass,
  inputModality,
  interactionMode,
  gestureOwner,
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
  setInputModalityFromPointerType,
  setGestureOwner,
  onActionResizeStart,
  onActionResizing,
  onClipEdgeResizeEnd,
  shotGroups = [],
  finalVideoMap,
  staleShotGroupIds,
  activeTaskClipIds,
  onShotGroupNavigate,
  onShotGroupGenerateVideo,
  onShotGroupSwitchToFinalVideo,
  onShotGroupSwitchToImages,
  onShotGroupUpdateToLatestVideo,
  onShotGroupUnpin,
  onShotGroupDelete,
  onSelectClips,
  dragSessionRef,
  interactionStateRef,
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
  const resizeSessionRef = useRef<ClipEdgeResizeSession | null>(null);
  const resizeActivationRef = useRef<ResizeActivationState | null>(null);
  const resizePreviewStoreRef = useRef<ResizePreviewStore>();
  if (!resizePreviewStoreRef.current) {
    resizePreviewStoreRef.current = createResizePreviewStore();
  }
  const resizePreviewStore = resizePreviewStoreRef.current;
  const resizePreviewSnapshot = useSyncExternalStore(
    resizePreviewStore.subscribe,
    resizePreviewStore.getSnapshot,
    resizePreviewStore.getSnapshot,
  );
  const timeRef = useRef(0);
  const playRateRef = useRef(1);
  const scrollMetricsRef = useRef<ScrollMetrics>({ scrollLeft: 0, scrollTop: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [resizeClampedActionId, setResizeClampedActionId] = useState<string | null>(null);
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

  const { pixelsPerSecond, pixelToTime, timeToPixel } = useTimelineScale({ scale, scaleWidth, startLeft });
  const resizeHandleWidth = shouldExpandTouchTrimHandles(deviceClass, inputModality, interactionMode)
    ? TOUCH_RESIZE_HANDLE_WIDTH
    : RESIZE_HANDLE_WIDTH;
  const minDuration = MIN_ACTION_WIDTH_PX / pixelsPerSecond;
  const actionHeight = Math.max(12, rowHeight - ACTION_VERTICAL_MARGIN * 2);
  const scrollContentHeight = (rows.length + 1) * rowHeight;
  const maxEnd = useMemo(() => rows.reduce(
    (currentMax, row) => row.actions.reduce((rowMax, action) => Math.max(rowMax, action.end), currentMax),
    0,
  ), [rows]);
  const derivedScaleCount = Math.ceil(maxEnd / Math.max(scale, Number.EPSILON)) + 1;
  const scaleCount = clamp(derivedScaleCount, minScaleCount, maxScaleCount);
  const totalWidth = startLeft + scaleCount * scaleWidth;
  const rowResizePreview = useMemo(
    () => rows.map<Readonly<Record<string, ResizeOverride>>>((row) => {
      let previewForRow: Record<string, ResizeOverride> | null = null;
      for (const action of row.actions) {
        const override = resizePreviewSnapshot[action.id];
        if (!override) {
          continue;
        }

        if (!previewForRow) {
          previewForRow = {};
        }
        previewForRow[action.id] = override;
      }

      return previewForRow ?? EMPTY_RESIZE_PREVIEW_SNAPSHOT;
    }),
    [resizePreviewSnapshot, rows],
  );
  const positionedShotGroups = useMemo(() => {
    return shotGroups.flatMap<PositionedShotGroup>((group) => {
      const row = rows[group.rowIndex];
      if (!row || row.id !== group.rowId) {
        return [];
      }

      const lastChild = group.children[group.children.length - 1];
      if (!lastChild) {
        return [];
      }

      const groupKey = `${group.shotId}:${group.rowId}`;
      const preview = resizePreviewSnapshot[groupKey];
      const start = preview?.start ?? group.start;
      const end = preview?.end ?? (group.start + lastChild.offset + lastChild.duration);

      return [{
        key: `${group.shotId}:${group.rowId}:${group.clipIds.join(',')}`,
        shotId: group.shotId,
        shotName: group.shotName,
        clipIds: group.clipIds,
        start,
        end,
        rowId: group.rowId,
        color: group.color,
        mode: group.mode,
        hasFinalVideo: finalVideoMap?.has(group.shotId) ?? false,
        hasStaleVideo: staleShotGroupIds?.has(`${group.shotId}:${group.rowId}`) ?? false,
        hasActiveTask: activeTaskClipIds ? group.clipIds.some((id) => activeTaskClipIds.has(id)) : false,
        left: timeToPixel(start),
        top: group.rowIndex * rowHeight + ACTION_VERTICAL_MARGIN,
        width: Math.max((end - start) * pixelsPerSecond, 1),
        height: actionHeight,
      }];
    });
  }, [actionHeight, activeTaskClipIds, finalVideoMap, pixelsPerSecond, resizePreviewSnapshot, rowHeight, rows, shotGroups, staleShotGroupIds, timeToPixel]);
  const hideShotGroups = dragSessionRef?.current !== null;
  const showTouchShotGroupActions = deviceClass !== 'desktop';
  const openShotGroupMenu = useCallback((
    x: number,
    y: number,
    group: Pick<PositionedShotGroup, 'shotId' | 'shotName' | 'clipIds' | 'rowId' | 'hasFinalVideo' | 'hasStaleVideo' | 'mode'>,
  ) => {
    setShotGroupMenu({ x, y, ...group, trackId: group.rowId });
  }, []);

  const syncCursor = useCallback((time = timeRef.current) => {
    const cursor = cursorRef.current;
    if (!cursor) {
      return;
    }

    const left = timeToPixel(time);
    cursor.style.transform = `translateX(${left}px)`;
  }, [timeToPixel]);

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
    if (nextMetrics.scrollTop !== scrollTop) {
      setScrollTop(nextMetrics.scrollTop);
    }
    syncCursor();
    onScroll?.(nextMetrics);
  };

  const clearResizePreview = useCallback((overrideIds: string[]) => {
    resizePreviewStore.clear(overrideIds);
  }, [resizePreviewStore]);

  const resolveClipEdgeResizeContext = useCallback((
    inputRows: TimelineRow[],
    inputShotGroups: ShotGroup[],
    inputPositionedShotGroups: PositionedShotGroup[],
    rowId: string,
    clipId: string,
    edge: ResizeDir,
  ): {
    initialBoundaryTime: number;
    context: ClipEdgeResizeContext;
    siblingTimes: number[];
  } | null => {
    const row = inputRows.find((candidate) => candidate.id === rowId);
    const action = row?.actions.find((candidate) => candidate.id === clipId);
    if (!row || !action) {
      return null;
    }

    const groupForAction = inputShotGroups.find((candidate) => (
      candidate.rowId === rowId && candidate.clipIds.includes(clipId)
    ));
    if (groupForAction) {
      const childIndex = groupForAction.clipIds.indexOf(clipId);
      const adjacentIndex = edge === 'left' ? childIndex - 1 : childIndex + 1;
      const adjacentClipId = groupForAction.clipIds[adjacentIndex];
      const adjacentAction = adjacentClipId
        ? row.actions.find((candidate) => candidate.id === adjacentClipId)
        : undefined;
      if (adjacentClipId && adjacentAction) {
        return {
          initialBoundaryTime: edge === 'left' ? action.start : action.end,
          siblingTimes: [],
          context: {
            kind: 'interior',
            pairStart: edge === 'left' ? adjacentAction.start : action.start,
            pairEnd: edge === 'left' ? action.end : adjacentAction.end,
            draggedClipId: action.id,
            adjacentClipId,
            draggedInitialStart: action.start,
            draggedInitialEnd: action.end,
            adjacentInitialStart: adjacentAction.start,
            adjacentInitialEnd: adjacentAction.end,
          },
        };
      }

      const positioned = inputPositionedShotGroups.find((candidate) => (
        candidate.shotId === groupForAction.shotId && candidate.rowId === rowId
      ));
      if (positioned) {
        const groupChildrenSnapshot = positioned.clipIds
          .map((candidateClipId) => row.actions.find((candidate) => candidate.id === candidateClipId))
          .filter((candidate): candidate is TimelineAction => !!candidate)
          .map((candidate) => ({ clipId: candidate.id, start: candidate.start, end: candidate.end }));
        if (groupChildrenSnapshot.length > 0) {
          return {
            initialBoundaryTime: edge === 'left' ? positioned.start : positioned.end,
            siblingTimes: collectSiblingTimes(row.actions, positioned.clipIds),
            context: {
              kind: 'outer',
              shotId: positioned.shotId,
              trackId: positioned.rowId,
              groupInitialStart: positioned.start,
              groupInitialEnd: positioned.end,
              groupClipIds: [...positioned.clipIds],
              groupChildrenSnapshot,
            },
          };
        }
      }
    }

    return {
      initialBoundaryTime: edge === 'left' ? action.start : action.end,
      siblingTimes: collectSiblingTimes(row.actions, [action.id]),
      context: {
        kind: 'free',
        clipId: action.id,
        initialStart: action.start,
        initialEnd: action.end,
        ...getAudioResizeLimits(dataRef.current, action, row, edge),
      },
    };
  }, [dataRef]);

  const getResolvedResizeAction = useCallback((
    rowId: string,
    clipId: string,
    updates: ClipEdgeResizeUpdate[],
  ) => {
    const row = rows.find((candidate) => candidate.id === rowId);
    const action = row?.actions.find((candidate) => candidate.id === clipId);
    const update = getUpdateForClip(updates, clipId);
    if (!row || !action || !update) {
      return null;
    }

    return {
      row,
      action: { ...action, start: update.start, end: update.end },
    };
  }, [rows]);

  const computeResizePreview = useCallback((session: ClipEdgeResizeSession, clientX: number) => {
    const rawBoundaryTime = pixelToTime(clientX - session.cursorOffsetPx);
    const snapThresholdSeconds = SNAP_THRESHOLD_PX / pixelsPerSecond;
    let boundaryTime = rawBoundaryTime;
    let limitClamped = false;

    if (session.context.kind === 'free') {
      const initialClamp = clampFreeBoundaryTime(session.context, session.edge, boundaryTime, minDuration);
      boundaryTime = initialClamp.boundaryTime;
      limitClamped = initialClamp.limitClamped;
    }

    if (session.siblingTimes.length > 0) {
      boundaryTime = snapBoundaryToSiblings(boundaryTime, session.siblingTimes, snapThresholdSeconds);
    }

    if (session.context.kind === 'free') {
      const snappedClamp = clampFreeBoundaryTime(session.context, session.edge, boundaryTime, minDuration);
      boundaryTime = snappedClamp.boundaryTime;
      limitClamped = limitClamped || snappedClamp.limitClamped;
    }

    const resizeResult = applyClipEdgeMove(session.context, session.edge, boundaryTime);
    const clampedHighlight = session.context.kind === 'interior'
      ? resizeResult.wasClamped
      : session.context.kind === 'free'
        ? limitClamped
        : false;

    return {
      updates: resizeResult.updates,
      overrides: getOverrideMapForUpdates(session, resizeResult.updates),
      clampedHighlight,
    };
  }, [minDuration, pixelToTime, pixelsPerSecond]);

  const updateResize = useCallback((session: ClipEdgeResizeSession, clientX: number) => {
    const preview = computeResizePreview(session, clientX);
    resizePreviewStore.merge(preview.overrides);
    setResizeClampedActionId((current) => (
      preview.clampedHighlight ? session.clipId : current === session.clipId ? null : current
    ));

    if (session.context.kind !== 'free') {
      return;
    }

    const context = getResolvedResizeAction(session.rowId, session.clipId, preview.updates);
    if (!context) {
      return;
    }

    onActionResizing?.({
      action: context.action,
      row: context.row,
      start: context.action.start,
      end: context.action.end,
      dir: session.edge,
    });
  }, [computeResizePreview, getResolvedResizeAction, onActionResizing, resizePreviewStore]);

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const activation = resizeActivationRef.current;
    resizeSessionRef.current = null;
    resizeActivationRef.current = null;

    if (!activation?.isActive) {
      if (activation?.claimedOwnership) {
        setGestureOwner('none');
      }
      setResizeClampedActionId((current) => (current === session.clipId ? null : current));
      clearResizePreview(getResizePreviewIds(session));
      return;
    }

    if (activation.target.hasPointerCapture(event.pointerId)) {
      activation.target.releasePointerCapture(event.pointerId);
    }
    if (activation.claimedOwnership) {
      setGestureOwner('none');
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pendingOpsRef.current -= 1;
    if (interactionStateRef) {
      interactionStateRef.current.resize = false;
      notifyInteractionEndIfIdle(interactionStateRef);
    }
    setResizeClampedActionId((current) => (current === session.clipId ? null : current));

    const previewIds = getResizePreviewIds(session);
    const preview = !cancelled && Number.isFinite(event.clientX)
      ? computeResizePreview(session, event.clientX)
      : {
        updates: getPreviewUpdatesFromSnapshot(session, resizePreviewStore.getSnapshot()),
        overrides: EMPTY_RESIZE_PREVIEW_SNAPSHOT,
        clampedHighlight: false,
      };
    onClipEdgeResizeEnd?.({
      session,
      updates: preview.updates,
      cancelled,
    });
    clearResizePreview(previewIds);
  }, [clearResizePreview, computeResizePreview, interactionStateRef, onClipEdgeResizeEnd, pendingOpsRef, resizePreviewStore, setGestureOwner]);

  const handleResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    action: TimelineAction,
    row: TimelineRow,
    edge: ResizeDir,
  ) => {
    if (event.button !== 0) return;
    if (gestureOwner !== 'none' && gestureOwner !== 'trim') {
      return;
    }

    setInputModalityFromPointerType(event.pointerType);

    const resolved = resolveClipEdgeResizeContext(
      rows,
      shotGroups,
      positionedShotGroups,
      row.id,
      action.id,
      edge,
    );
    if (!resolved) {
      return;
    }

    const nextSession: ClipEdgeResizeSession = {
      pointerId: event.pointerId,
      rowId: row.id,
      clipId: action.id,
      edge,
      cursorOffsetPx: event.clientX - timeToPixel(resolved.initialBoundaryTime),
      initialBoundaryTime: resolved.initialBoundaryTime,
      context: resolved.context,
      siblingTimes: resolved.siblingTimes,
    };

    resizeSessionRef.current = nextSession;
    resizeActivationRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      target: event.currentTarget,
      isActive: false,
      claimedOwnership: false,
    };
    setResizeClampedActionId(null);
    event.stopPropagation();
  }, [
    gestureOwner,
    positionedShotGroups,
    resolveClipEdgeResizeContext,
    rows,
    setInputModalityFromPointerType,
    shotGroups,
    timeToPixel,
  ]);

  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const activation = resizeActivationRef.current;
    if (!activation || activation.pointerId !== event.pointerId) {
      return;
    }

    if (!activation.isActive) {
      if (Math.abs(event.clientX - activation.startClientX) < RESIZE_ACTIVATION_THRESHOLD_PX) {
        return;
      }
      if (gestureOwner !== 'none' && gestureOwner !== 'trim') {
        resizeSessionRef.current = null;
        resizeActivationRef.current = null;
        clearResizePreview(getResizePreviewIds(session));
        return;
      }

      activation.isActive = true;
      activation.claimedOwnership = true;
      setGestureOwner('trim');
      resizePreviewStore.merge(getOverrideMapForUpdates(
        session,
        applyClipEdgeMove(session.context, session.edge, session.initialBoundaryTime).updates,
      ));
      if (session.context.kind !== 'outer') {
        const row = rows.find((candidate) => candidate.id === session.rowId);
        const action = row?.actions.find((candidate) => candidate.id === session.clipId);
        if (row && action) {
          onActionResizeStart?.({ action, row, dir: session.edge });
        }
      }
      if (interactionStateRef) {
        interactionStateRef.current.resize = true;
      }
      pendingOpsRef.current += 1;
      activation.target.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    event.stopPropagation();
    updateResize(session, event.clientX);
  }, [
    clearResizePreview,
    gestureOwner,
    interactionStateRef,
    onActionResizeStart,
    pendingOpsRef,
    resizePreviewStore,
    rows,
    setGestureOwner,
    updateResize,
  ]);

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
        gestureOwner={gestureOwner}
        onClickTimeArea={onClickTimeArea}
        onCursorDrag={onCursorDrag}
        setGestureOwner={setGestureOwner}
        setInputModalityFromPointerType={setInputModalityFromPointerType}
      />
      {!hideShotGroups && positionedShotGroups.map((group) => (
        <div
          key={`${group.key}:label`}
          className={cn(
            'absolute cursor-pointer select-none rounded-t-sm transition-opacity',
            showTouchShotGroupActions ? 'opacity-100' : 'opacity-0 hover:opacity-100',
          )}
          title={group.shotName}
          data-action-id="shot-group-label"
          data-shot-group-drag-anchor-clip-id={group.clipIds[0] ?? ''}
          data-shot-group-drag-anchor-row-id={group.rowId}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelectClips?.(group.clipIds);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (onShotGroupNavigate) {
              onShotGroupNavigate(group.shotId);
              return;
            }
            onSelectClips?.(group.clipIds);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openShotGroupMenu(event.clientX, event.clientY, group);
          }}
          style={{
            left: group.left - scrollLeft,
            top: TIME_RULER_HEIGHT + group.top - SHOT_GROUP_LABEL_HEIGHT - scrollTop,
            width: group.width,
            height: SHOT_GROUP_LABEL_HEIGHT,
            zIndex: 25,
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
          <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {showTouchShotGroupActions && (
              <button
                type="button"
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm transition-colors hover:bg-accent"
                title="Open shot actions"
                aria-label={`Open actions for ${group.shotName}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openShotGroupMenu(event.clientX, event.clientY, group);
                }}
              >
                <Ellipsis className="h-4 w-4" />
              </button>
            )}
            {group.hasFinalVideo && (
              <button
                type="button"
                className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm transition-transform hover:scale-110 hover:bg-sky-400"
                title="Final video available"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openShotGroupMenu(event.clientX, event.clientY, { ...group, hasFinalVideo: true });
                }}
              >
                <Video className="h-2.5 w-2.5" />
              </button>
            )}
            {group.hasStaleVideo && !group.hasActiveTask && (
              <button
                type="button"
                className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm transition-transform hover:scale-110 hover:bg-amber-400"
                title="New video available"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openShotGroupMenu(event.clientX, event.clientY, group);
                }}
              >
                <RefreshCw className="h-2.5 w-2.5" />
              </button>
            )}
            {group.hasActiveTask && (
              <div
                className="flex h-4 w-4 items-center justify-center rounded-full shadow-sm"
                title="Task in progress"
                style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
              >
                <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: group.color }} />
              </div>
            )}
          </div>
        </div>
        ))}
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
              {/*
                The dedicated round overlay edge handles were removed: they
                visually overlapped (and z-index-blocked) the first/last
                child clip's outer-edge resize handles, intercepting pointer
                events. The clip handles now route those gestures through
                `handleResizePointerDown`, providing a single unified
                affordance.
              */}
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
            onUpdateToLatestVideo={onShotGroupUpdateToLatestVideo}
            onUnpinGroup={onShotGroupUnpin}
            onDeleteShot={onShotGroupDelete}
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
                    resizePreviewSnapshot={rowResizePreview[index] ?? EMPTY_RESIZE_PREVIEW_SNAPSHOT}
                    resizeHandleWidth={resizeHandleWidth}
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
            className="z-20 flex bg-card"
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
          data-testid="timeline-playhead"
          className="pointer-events-none absolute left-0 top-0 z-[5] bg-sky-400/95 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
          style={{
            width: CURSOR_WIDTH,
            height: scrollContentHeight,
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
