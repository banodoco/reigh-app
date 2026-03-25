import { memo, useCallback, useLayoutEffect, useMemo } from 'react';
import { Timeline } from '@xzdarcy/react-timeline-editor';
import type { TimelineAction } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import '@/tools/video-editor/components/TimelineEditor/timeline-overrides.css';
import { ClipAction } from '@/tools/video-editor/components/TimelineEditor/ClipAction';
import { DropIndicator } from '@/tools/video-editor/components/TimelineEditor/DropIndicator';
import { TrackLabel } from '@/tools/video-editor/components/TimelineEditor/TrackLabel';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import { useTimelineEditorContext } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useClipDrag } from '@/tools/video-editor/hooks/useClipDrag';

function TimelineEditorComponent() {
  const {
    data,
    resolvedConfig,
    timelineRef,
    timelineWrapperRef,
    dataRef,
    moveClipToRow,
    createTrackAndMoveClip,
    setSelectedClipId,
    setSelectedTrackId,
    scale,
    scaleWidth,
    coordinator,
    indicatorRef,
    editAreaRef,
    selectedClipId,
    selectedTrackId,
    handleTrackPopoverChange,
    handleReorderTrack,
    handleRemoveTrack,
    handleSplitClipAtTime,
    handleDeleteClip,
    onChange,
    onCursorDrag,
    onClickTimeArea,
    onActionResizeStart,
    onActionResizeEnd,
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
    onDoubleClickAsset,
  } = useTimelineEditorContext();

  // useClipDrag handles all internal clip drag interactions (horizontal moves,
  // cross-track moves, and new-track creation) using the same fixed-position
  // drop indicators as external HTML5 drag-drop.
  useClipDrag({
    timelineWrapperRef,
    dataRef,
    moveClipToRow,
    createTrackAndMoveClip,
    setSelectedClipId,
    setSelectedTrackId,
    coordinator,
    rowHeight: ROW_HEIGHT,
    scale,
    scaleWidth,
    startLeft: TIMELINE_START_LEFT,
  });

  useLayoutEffect(() => {
    const wrapper = timelineWrapperRef.current;
    const nextEditArea = wrapper?.querySelector<HTMLElement>('.timeline-editor-edit-area') ?? null;
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
    setSelectedClipId(clipId);
    setSelectedTrackId(trackId);
  }, [setSelectedClipId, setSelectedTrackId]);

  const pixelsPerSecond = scaleWidth / scale;

  const clientXToTime = useCallback((clientX: number): number => {
    const wrapper = timelineWrapperRef.current;
    if (!wrapper) return 0;
    const editArea = wrapper.querySelector<HTMLElement>('.timeline-editor-edit-area');
    const grid = editArea?.querySelector<HTMLElement>('.ReactVirtualized__Grid')
      ?? wrapper.querySelector<HTMLElement>('.ReactVirtualized__Grid');
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
        isSelected={selectedClipId === action.id}
        thumbnailSrc={thumbnailSrc}
        onSelect={handleClipSelect}
        onDoubleClickAsset={onDoubleClickAsset}
        onSplitHere={handleSplitClipHere}
        onDeleteClip={handleDeleteClip}
      />
    );
  }, [data, handleClipSelect, handleDeleteClip, handleSplitClipHere, onDoubleClickAsset, pixelsPerSecond, selectedClipId, thumbnailMap]);

  const kindCountMap = useMemo(() => {
    if (!data) {
      return {} as Record<string, number>;
    }

    return data.tracks.reduce<Record<string, number>>((counts, track) => {
      counts[track.kind] = (counts[track.kind] ?? 0) + 1;
      return counts;
    }, {});
  }, [data]);

  const immovableRows = useMemo(() => {
    return data?.rows.map((row) => ({
      ...row,
      actions: row.actions.map((action) => ({
        ...action,
        movable: false,
      })),
    })) ?? [];
  }, [data?.rows]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-border bg-card/80">
      <div className="flex w-36 shrink-0 flex-col overflow-y-auto border-r border-border pt-[30px]">
        {data.tracks.map((track, index) => (
          <TrackLabel
            key={track.id}
            track={track}
            isSelected={selectedTrackId === track.id}
            trackCount={data.tracks.length}
            trackIndex={index}
            sameKindCount={kindCountMap[track.kind] ?? 0}
            onSelect={setSelectedTrackId}
            onChange={handleTrackPopoverChange}
            onReorder={handleReorderTrack}
            onRemove={handleRemoveTrack}
          />
        ))}
      </div>
      <div
        ref={timelineWrapperRef}
        className="timeline-wrapper relative min-w-0 flex-1 overflow-hidden"
        onDragOver={onTimelineDragOver}
        onDragLeave={onTimelineDragLeave}
        onDrop={onTimelineDrop}
      >
        <Timeline
          ref={timelineRef}
          style={{ width: '100%', height: '100%' }}
          editorData={immovableRows}
          effects={data.effects}
          onChange={onChange}
          scale={scale}
          scaleWidth={scaleWidth}
          minScaleCount={scaleCount}
          maxScaleCount={scaleCount}
          scaleSplitCount={5}
          startLeft={TIMELINE_START_LEFT}
          rowHeight={ROW_HEIGHT}
          autoScroll
          dragLine
          getActionRender={getActionRender}
          onCursorDrag={onCursorDrag}
          onClickTimeArea={onClickTimeArea}
          onActionResizeStart={onActionResizeStart}
          onActionResizeEnd={onActionResizeEnd}
        />
        <DropIndicator ref={indicatorRef} editAreaRef={editAreaRef} />
      </div>
    </div>
  );
}

export const TimelineEditor = memo(TimelineEditorComponent);
