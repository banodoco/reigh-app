import { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Type } from 'lucide-react';
import '@/tools/video-editor/components/TimelineEditor/timeline-overrides.css';
import { ClipAction } from '@/tools/video-editor/components/TimelineEditor/ClipAction';
import { DropIndicator } from '@/tools/video-editor/components/TimelineEditor/DropIndicator';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas';
import { TrackLabel } from '@/tools/video-editor/components/TimelineEditor/TrackLabel';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import { useTimelineChromeContext } from '@/tools/video-editor/contexts/TimelineChromeContext';
import { useTimelineEditorContext } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useClipDrag } from '@/tools/video-editor/hooks/useClipDrag';
import { useMarqueeSelect } from '@/tools/video-editor/hooks/useMarqueeSelect';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

function TimelineEditorComponent() {
  const chrome = useTimelineChromeContext();
  const {
    data,
    resolvedConfig,
    timelineRef,
    timelineWrapperRef,
    dataRef,
    applyTimelineEdit,
    moveClipToRow,
    createTrackAndMoveClip,
    selectClip,
    selectClips,
    addToSelection,
    clearSelection,
    isClipSelected,
    primaryClipId,
    selectedClipIds,
    selectedClipIdsRef,
    setSelectedTrackId,
    scale,
    scaleWidth,
    coordinator,
    indicatorRef,
    editAreaRef,
    selectedTrackId,
    handleTrackPopoverChange,
    handleMoveTrack,
    handleRemoveTrack,
    handleSplitClipAtTime,
    handleSplitClipsAtPlayhead,
    handleDeleteClips,
    handleDeleteClip,
    handleToggleMuteClips,
    onCursorDrag,
    onClickTimeArea,
    onActionResizeStart,
    onActionResizeEnd,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
    onDoubleClickAsset,
  } = useTimelineEditorContext();
  const trackListRef = useRef<HTMLDivElement>(null);
  const trackSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // useClipDrag handles all internal clip drag interactions (horizontal moves,
  // cross-track moves, and new-track creation) using the same fixed-position
  // drop indicators as external HTML5 drag-drop.
  const { dragSessionRef } = useClipDrag({
    timelineWrapperRef,
    dataRef,
    moveClipToRow,
    createTrackAndMoveClip,
    applyTimelineEdit,
    selectClip,
    selectClips,
    selectedClipIdsRef,
    coordinator,
    rowHeight: ROW_HEIGHT,
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
  });

  const { marqueeRect, onPointerDown: onMarqueePointerDown } = useMarqueeSelect({
    editAreaRef,
    dragSessionRef,
    selectClips,
    addToSelection,
    clearSelection,
  });

  useLayoutEffect(() => {
    const wrapper = timelineWrapperRef.current;
    const nextEditArea = wrapper?.querySelector<HTMLElement>('.timeline-canvas-edit-area') ?? null;
    editAreaRef.current = nextEditArea;

    return () => {
      if (editAreaRef.current === nextEditArea) {
        editAreaRef.current = null;
      }
    };
  }, [data, editAreaRef, timelineWrapperRef]);

  const scaleCount = useMemo(() => {
    if (!data) {
      return 1;
    }

    let maxEnd = 0;
    for (const row of data.rows) {
      for (const action of row.actions) {
        maxEnd = Math.max(maxEnd, action.end);
      }
    }

    return Math.ceil((maxEnd + 20) / scale) + 1;
  }, [data, scale]);

  const thumbnailMap = useMemo<Record<string, string>>(() => {
    if (!resolvedConfig) {
      return {};
    }

    return resolvedConfig.clips.reduce<Record<string, string>>((acc, clip) => {
      if (clip.clipType === 'text' || !clip.assetEntry?.type?.startsWith('image')) {
        return acc;
      }

      acc[clip.id] = clip.assetEntry.src;
      return acc;
    }, {});
  }, [resolvedConfig]);

  const handleClipSelect = useCallback((clipId: string, trackId: string) => {
    selectClip(clipId);
    setSelectedTrackId(trackId);
  }, [selectClip, setSelectedTrackId]);

  const pixelsPerSecond = scaleWidth / scale;

  const clientXToTime = useCallback((clientX: number): number => {
    const wrapper = timelineWrapperRef.current;
    if (!wrapper) return 0;
    const editArea = wrapper.querySelector<HTMLElement>('.timeline-canvas-edit-area');
    const grid = editArea;
    const rect = (editArea ?? wrapper).getBoundingClientRect();
    const scrollLeft = grid?.scrollLeft ?? 0;
    return Math.max(0, (clientX - rect.left + scrollLeft - TIMELINE_START_LEFT) / pixelsPerSecond);
  }, [pixelsPerSecond, timelineWrapperRef]);

  const handleSplitClipHere = useCallback((clipId: string, clientX: number) => {
    const time = clientXToTime(clientX);
    handleSplitClipAtTime(clipId, time);
  }, [clientXToTime, handleSplitClipAtTime]);

  const getActionRender = useCallback((action: TimelineAction) => {
    const clipMeta = data?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    const clipWidthPx = (action.end - action.start) * pixelsPerSecond;
    const thumbnailSrc = clipWidthPx >= 40 ? thumbnailMap[action.id] : undefined;

    return (
      <ClipAction
        action={action}
        clipMeta={clipMeta}
        isSelected={isClipSelected(action.id)}
        isPrimary={primaryClipId === action.id}
        selectedClipIds={[...selectedClipIds]}
        thumbnailSrc={thumbnailSrc}
        onSelect={handleClipSelect}
        onDoubleClickAsset={onDoubleClickAsset}
        onSplitHere={handleSplitClipHere}
        onSplitClipsAtPlayhead={handleSplitClipsAtPlayhead}
        onDeleteClips={handleDeleteClips}
        onDeleteClip={handleDeleteClip}
        onToggleMuteClips={handleToggleMuteClips}
      />
    );
  }, [
    data,
    handleClipSelect,
    handleDeleteClip,
    handleDeleteClips,
    handleSplitClipHere,
    handleSplitClipsAtPlayhead,
    handleToggleMuteClips,
    isClipSelected,
    onDoubleClickAsset,
    pixelsPerSecond,
    primaryClipId,
    selectedClipIds,
    thumbnailMap,
  ]);

  const trackEntries = useMemo(() => {
    if (!data) {
      return [] as Array<{ track: TrackDefinition; index: number; row: TimelineRow | undefined }>;
    }

    return data.tracks.map((track, index) => ({
      track,
      index,
      row: data.rows[index],
    }));
  }, [data]);

  const visualTrackEntries = useMemo(
    () => trackEntries.filter((entry) => entry.track.kind === 'visual'),
    [trackEntries],
  );
  const audioTrackEntries = useMemo(
    () => trackEntries.filter((entry) => entry.track.kind === 'audio'),
    [trackEntries],
  );

  const handleTrackDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over) {
      return;
    }

    const activeSortableId = String(active.id);
    const overSortableId = String(over.id);
    if (
      activeSortableId === overSortableId ||
      !activeSortableId.startsWith('track-') ||
      !overSortableId.startsWith('track-')
    ) {
      return;
    }

    const activeTrackId = activeSortableId.slice('track-'.length);
    const overTrackId = overSortableId.slice('track-'.length);
    const activeTrack = data?.tracks.find((track) => track.id === activeTrackId);
    const overTrack = data?.tracks.find((track) => track.id === overTrackId);
    if (!activeTrack || !overTrack || activeTrack.kind !== overTrack.kind) {
      return;
    }

    handleMoveTrack(activeTrackId, overTrackId);
  }, [data, handleMoveTrack]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-border bg-card/80">
      <div
        ref={trackListRef}
        className="flex w-36 shrink-0 flex-col overflow-y-auto border-r border-border pt-[30px]"
        onScroll={(event) => {
          timelineRef.current?.setScrollTop(event.currentTarget.scrollTop);
        }}
      >
        <DndContext
          sensors={trackSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTrackDragEnd}
        >
          <SortableContext
            items={visualTrackEntries.map(({ track }) => `track-${track.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {visualTrackEntries.map(({ track, row }) => {
              return (
                <TrackLabel
                  key={track.id}
                  id={`track-${track.id}`}
                  track={track}
                  isSelected={selectedTrackId === track.id}
                  hasClips={Boolean(row && row.actions.length > 0)}
                  onSelect={setSelectedTrackId}
                  onChange={handleTrackPopoverChange}
                  onRemove={handleRemoveTrack}
                />
              );
            })}
          </SortableContext>
          <SortableContext
            items={audioTrackEntries.map(({ track }) => `track-${track.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {audioTrackEntries.map(({ track, row }) => {
              return (
                <TrackLabel
                  key={track.id}
                  id={`track-${track.id}`}
                  track={track}
                  isSelected={selectedTrackId === track.id}
                  hasClips={Boolean(row && row.actions.length > 0)}
                  onSelect={setSelectedTrackId}
                  onChange={handleTrackPopoverChange}
                  onRemove={handleRemoveTrack}
                />
              );
            })}
          </SortableContext>
        </DndContext>
        <div className="flex border-t border-border">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1 border-r border-border px-1 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => chrome.handleAddTrack('visual')}
            title="Add video track"
          >
            <span className="text-[10px]">+</span> Video
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-1 px-1 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => chrome.handleAddTrack('audio')}
            title="Add audio track"
          >
            <span className="text-[10px]">+</span> Audio
          </button>
        </div>
      </div>
      <div
        ref={timelineWrapperRef}
        className="timeline-wrapper relative min-w-0 flex-1 overflow-hidden"
        onDragOver={onTimelineDragOver}
        onDragLeave={onTimelineDragLeave}
        onDrop={onTimelineDrop}
      >
        <TimelineCanvas
          ref={timelineRef}
          rows={data.rows}
          scale={scale}
          scaleWidth={scaleWidth}
          scaleSplitCount={5}
          startLeft={TIMELINE_START_LEFT}
          rowHeight={ROW_HEIGHT}
          minScaleCount={scaleCount}
          maxScaleCount={scaleCount}
          getActionRender={getActionRender}
          onCursorDrag={onCursorDrag}
          onClickTimeArea={onClickTimeArea}
          onActionResizeStart={onActionResizeStart}
          onActionResizeEnd={onActionResizeEnd}
          marqueeRect={marqueeRect}
          onEditAreaPointerDown={onMarqueePointerDown}
          trackLabelRef={trackListRef}
          onAddText={chrome.handleAddText}
        />
        <DropIndicator ref={indicatorRef} editAreaRef={editAreaRef} />
        <div className="pointer-events-none absolute inset-0 z-40">
          <button
            type="button"
            className="pointer-events-auto absolute bottom-3 left-3 flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
            onClick={chrome.handleAddText}
            title="Add text clip"
          >
            <Type className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const TimelineEditor = memo(TimelineEditorComponent);
