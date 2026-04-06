import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Shot } from '@/domains/generation/types';
import { useShotCreation } from '@/shared/hooks/shotCreation/useShotCreation';
import { useShotNavigation } from '@/shared/hooks/shots/useShotNavigation';
import { useShots } from '@/shared/contexts/ShotsContext';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { VideoGenerationModal } from '@/tools/travel-between-images/components/VideoGenerationModal';
import '@/tools/video-editor/components/TimelineEditor/timeline-overrides.css';
import { useRenderDiagnostic } from '@/tools/video-editor/hooks/usePerfDiagnostics';
import { ClipAction } from '@/tools/video-editor/components/TimelineEditor/ClipAction';
import { DropIndicator } from '@/tools/video-editor/components/TimelineEditor/DropIndicator';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas';
import { ROW_HEIGHT, TIMELINE_START_LEFT } from '@/tools/video-editor/lib/coordinate-utils';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import { useTimelineChromeContext } from '@/tools/video-editor/contexts/TimelineChromeContext';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
} from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useClipDrag } from '@/tools/video-editor/hooks/useClipDrag';
import { useActiveTaskClips } from '@/tools/video-editor/hooks/useActiveTaskClips';
import { useFinalVideoAvailable } from '@/tools/video-editor/hooks/useFinalVideoAvailable';
import { useMarqueeSelect } from '@/tools/video-editor/hooks/useMarqueeSelect';
import { usePinnedGroupSync, usePinnedShotGroups } from '@/tools/video-editor/hooks/usePinnedShotGroups';
import { useShotGroups } from '@/tools/video-editor/hooks/useShotGroups';
import { useStaleVariants } from '@/tools/video-editor/hooks/useStaleVariants';
import { useSwitchToFinalVideo } from '@/tools/video-editor/hooks/useSwitchToFinalVideo';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const EMPTY_ASSET_GENERATION_MAP: Record<string, string> = {};

function useStableValue<T extends Record<string, string>>(value: T): T {
  const ref = useRef(value);
  const previous = ref.current;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(value);
  const isEqual = previousKeys.length === nextKeys.length
    && nextKeys.every((key) => previous[key] === value[key]);

  if (!isEqual) {
    ref.current = value;
  }

  return ref.current;
}

export function resolveSelectedGenerationIdsForShotCreation({
  rows,
  meta,
  assetGenerationMap,
  selectedClipIds,
}: {
  rows: TimelineRow[];
  meta: Record<string, ClipMeta>;
  assetGenerationMap: Record<string, string>;
  selectedClipIds: Iterable<string>;
}) {
  const selectedSet = new Set(selectedClipIds);
  if (selectedSet.size === 0) {
    return { canCreateShot: false, generationIds: [] as string[] };
  }

  const orderedSelections = rows
      .flatMap((row, trackIndex) => row.actions
      .filter((action) => selectedSet.has(action.id))
      .map((action) => {
        const assetKey = meta[action.id]?.asset;
        const generationId = assetKey ? assetGenerationMap[assetKey] : undefined;

        return {
          trackIndex,
          start: action.start,
          generationId,
        };
      }))
    .sort((left, right) => left.trackIndex - right.trackIndex || left.start - right.start);

  const generationIds = orderedSelections
    .map((selection) => selection.generationId)
    .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0);

  return {
    canCreateShot: orderedSelections.length > 0 && generationIds.length === orderedSelections.length,
    generationIds,
  };
}

export function resolveWaveformAudioSrc(
  clip: ResolvedTimelineClip | undefined,
  track: TrackDefinition | undefined,
): string | undefined {
  if (!clip || !track || !clip.assetEntry?.src) {
    return undefined;
  }

  if (clip.clipType === 'text' || clip.clipType === 'effect-layer') {
    return undefined;
  }

  if (track.kind === 'audio') {
    return clip.volume === 0 ? undefined : clip.assetEntry.src;
  }

  if (
    track.kind === 'visual'
    && clip.assetEntry.type?.startsWith('video/')
    && (clip.volume ?? 1) > 0
  ) {
    return clip.assetEntry.src;
  }

  return undefined;
}

function TimelineEditorComponent() {
  useRenderDiagnostic('TimelineEditor');
  const chrome = useTimelineChromeContext();
  const [newTrackDropLabel, setNewTrackDropLabel] = useState<string | null>(null);
  const [videoModalShot, setVideoModalShot] = useState<Shot | null>(null);
  const { createShot, isCreating } = useShotCreation();
  const { navigateToShot } = useShotNavigation();
  const { shots } = useShots();
  const {
    data,
    resolvedConfig,
    timelineRef,
    timelineWrapperRef,
    dataRef,
    primaryClipId,
    selectedClipIds,
    selectedClipIdsRef,
    scale,
    scaleWidth,
    pendingOpsRef,
    coordinator,
    indicatorRef,
    editAreaRef,
    selectedTrackId,
  } = useTimelineEditorData();
  const {
    applyEdit,
    moveClipToRow,
    createTrackAndMoveClip,
    selectClip,
    selectClips,
    addToSelection,
    clearSelection,
    isClipSelected,
    setSelectedTrackId,
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
    patchRegistry,
    registerAsset,
    registerGenerationAsset,
  } = useTimelineEditorOps();
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
    pendingOpsRef,
    moveClipToRow,
    createTrackAndMoveClip,
    applyEdit,
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

  const { staleAssetKeys, dismissedAssetKeys, generationAssetKeys, dismissAsset, updateAssetToCurrentVariant } = useStaleVariants({
    registry: resolvedConfig?.registry,
    patchRegistry,
    registerAsset,
  });
  const { activeTaskAssetKeys } = useActiveTaskClips({ registry: resolvedConfig?.registry });
  const activeTaskClipIds = useMemo(() => {
    if (activeTaskAssetKeys.size === 0 || !data?.rows || !data?.meta) return new Set<string>();
    const clipIds = new Set<string>();
    for (const row of data.rows) {
      for (const action of row.actions) {
        const assetKey = data.meta[action.id]?.asset;
        if (assetKey && activeTaskAssetKeys.has(assetKey)) {
          clipIds.add(action.id);
        }
      }
    }
    return clipIds;
  }, [activeTaskAssetKeys, data?.rows, data?.meta]);
  const { finalVideoMap, dismissFinalVideo } = useFinalVideoAvailable();

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
  const shotGroups = useShotGroups(
    data?.rows ?? [],
    shots,
    data?.config.pinnedShotGroups,
  );
  const shotGroupClipIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of shotGroups) {
      for (const clipId of group.clipIds) {
        ids.add(clipId);
      }
    }
    return ids;
  }, [shotGroups]);
  const assetGenerationMap = useMemo<Record<string, string>>(() => {
    const assets = data?.registry?.assets;
    if (!assets) {
      return EMPTY_ASSET_GENERATION_MAP;
    }

    return Object.entries(assets).reduce<Record<string, string>>((acc, [assetKey, assetEntry]) => {
      if (typeof assetEntry?.generationId === 'string' && assetEntry.generationId.length > 0) {
        acc[assetKey] = assetEntry.generationId;
      }
      return acc;
    }, {});
  }, [data?.registry?.assets]);
  const stableAssetGenerationMap = useStableValue(assetGenerationMap);
  const resolvedClipMap = useMemo(() => {
    if (!resolvedConfig) {
      return new Map<string, ResolvedTimelineClip>();
    }

    return new Map(resolvedConfig.clips.map((clip) => [clip.id, clip]));
  }, [resolvedConfig]);
  const trackMap = useMemo(() => {
    if (!resolvedConfig) {
      return new Map<string, TrackDefinition>();
    }

    return new Map(resolvedConfig.tracks.map((track) => [track.id, track]));
  }, [resolvedConfig]);

  const selectionShotCreationState = useMemo(() => {
    if (!data?.rows || !data?.meta) {
      return { canCreateShot: false, generationIds: [] as string[] };
    }

    return resolveSelectedGenerationIdsForShotCreation({
      rows: data.rows,
      meta: data.meta,
      assetGenerationMap: stableAssetGenerationMap,
      selectedClipIds,
    });
  }, [data?.rows, data?.meta, stableAssetGenerationMap, selectedClipIds]);

  const existingShotsForSelection = useMemo(() => {
    if (selectionShotCreationState.generationIds.length === 0 || !shots?.length) {
      return [] as Shot[];
    }

    return shots.filter((shot) => {
      const shotGenerationIds = new Set(
        (shot.images ?? [])
          .map((image) => image.generation_id)
          .filter((generationId): generationId is string => typeof generationId === 'string' && generationId.length > 0),
      );

      return selectionShotCreationState.generationIds.every((generationId) => shotGenerationIds.has(generationId));
    });
  }, [shots, selectionShotCreationState.generationIds]);

  const handleCreateShotFromSelection = useCallback(async (): Promise<Shot | null> => {
    if (!selectionShotCreationState.canCreateShot) {
      return null;
    }

    // Determine the track from the first selected clip
    const selectedClipId = [...selectedClipIds][0];
    const trackId = selectedClipId ? data?.meta[selectedClipId]?.track : undefined;

    const result = await createShot({ generationIds: selectionShotCreationState.generationIds });
    if (result?.shot && trackId) {
      // Auto-pin the new shot group on the timeline
      pinGroup(result.shot.id, trackId, [...selectedClipIds]);
    }
    if (result?.shot) {
      return result.shot;
    }
    return null;
  }, [createShot, data?.meta, pinGroup, selectedClipIds, selectionShotCreationState]);

  const handleGenerateVideoFromSelection = useCallback(async () => {
    if (!selectionShotCreationState.canCreateShot) {
      return;
    }

    // If exactly one existing shot already contains the selected generations, use it directly
    if (existingShotsForSelection.length === 1) {
      setVideoModalShot(existingShotsForSelection[0]);
      return;
    }

    const selectedClipId = [...selectedClipIds][0];
    const trackId = selectedClipId ? data?.meta[selectedClipId]?.track : undefined;

    const result = await createShot({ generationIds: selectionShotCreationState.generationIds });
    if (!result?.shotId) {
      return;
    }

    if (trackId) {
      pinGroup(result.shotId, trackId, [...selectedClipIds]);
    }

    const createdShot = result.shot ?? shots?.find((shot) => shot.id === result.shotId) ?? null;
    if (createdShot) {
      setVideoModalShot(createdShot);
    }
  }, [createShot, data?.meta, existingShotsForSelection, pinGroup, selectedClipIds, selectionShotCreationState, shots]);

  const handleNavigateToShot = useCallback((shot: Shot) => {
    navigateToShot(shot, { isNewlyCreated: true });
  }, [navigateToShot]);

  const handleOpenGenerateVideo = useCallback((shot: Shot) => {
    setVideoModalShot(shot);
  }, []);

  const handleShotGroupNavigate = useCallback((shotId: string) => {
    const shot = shots?.find((s) => s.id === shotId);
    if (shot) navigateToShot(shot, { isNewlyCreated: false });
  }, [navigateToShot, shots]);

  const handleShotGroupGenerateVideo = useCallback((shotId: string) => {
    const shot = shots?.find((s) => s.id === shotId);
    if (shot) setVideoModalShot(shot);
  }, [shots]);
  const {
    pinGroup,
    unpinGroup,
  } = usePinnedShotGroups({
    dataRef,
    applyEdit,
  });
  const {
    switchToFinalVideo: handleSwitchToFinalVideo,
    switchToImages: handleSwitchToImages,
  } = useSwitchToFinalVideo({
    applyEdit,
    dataRef,
    finalVideoMap,
    patchRegistry,
    registerAsset,
  });
  usePinnedGroupSync({
    data,
    dataRef,
    applyEdit,
    shots,
    registerGenerationAsset,
  });

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

  const getActionRender = useCallback((action: TimelineAction, _row: TimelineRow, clipWidth: number) => {
    const clipMeta = data?.meta[action.id];
    if (!clipMeta) {
      return null;
    }

    const resolvedClip = resolvedClipMap.get(action.id);
    const track = resolvedClip ? trackMap.get(resolvedClip.track) : undefined;
    const clipWidthPx = clipWidth;
    const thumbnailSrc = clipWidthPx >= 40 ? thumbnailMap[action.id] : undefined;
    const assetKey = clipMeta.asset;
    const audioSrc = resolveWaveformAudioSrc(resolvedClip, track);
    const isStale = assetKey ? staleAssetKeys.has(assetKey) : false;
    const isDismissed = assetKey ? dismissedAssetKeys.has(assetKey) : false;
    const isGenAsset = assetKey ? generationAssetKeys.has(assetKey) : false;
    const isTaskActive = assetKey && !shotGroupClipIds.has(action.id) ? activeTaskAssetKeys.has(assetKey) : false;

    return (
      <ClipAction
        action={action}
        clipMeta={clipMeta}
        isSelected={isClipSelected(action.id)}
        isPrimary={primaryClipId === action.id}
        selectedClipIds={[...selectedClipIds]}
        thumbnailSrc={thumbnailSrc}
        audioSrc={audioSrc}
        clipWidth={clipWidthPx}
        onSelect={handleClipSelect}
        onDoubleClickAsset={onDoubleClickAsset}
        onSplitHere={handleSplitClipHere}
        onSplitClipsAtPlayhead={handleSplitClipsAtPlayhead}
        onDeleteClips={handleDeleteClips}
        onDeleteClip={handleDeleteClip}
        onToggleMuteClips={handleToggleMuteClips}
        isTaskActive={isTaskActive}
        isVariantStale={isStale && !isDismissed}
        isGenerationAsset={isGenAsset}
        onUpdateVariant={isGenAsset && assetKey ? () => void updateAssetToCurrentVariant(assetKey) : undefined}
        onDismissStale={isStale && assetKey ? () => dismissAsset(assetKey) : undefined}
        canCreateShotFromSelection={selectionShotCreationState.canCreateShot}
        existingShots={existingShotsForSelection}
        onCreateShotFromSelection={handleCreateShotFromSelection}
        onGenerateVideoFromSelection={handleGenerateVideoFromSelection}
        onNavigateToShot={handleNavigateToShot}
        onOpenGenerateVideo={handleOpenGenerateVideo}
        isCreatingShot={isCreating}
      />
    );
  }, [
    selectionShotCreationState.canCreateShot,
    existingShotsForSelection,
    activeTaskAssetKeys,
    shotGroupClipIds,
    data,
    dismissAsset,
    dismissedAssetKeys,
    generationAssetKeys,
    handleCreateShotFromSelection,
    handleClipSelect,
    handleDeleteClip,
    handleDeleteClips,
    handleGenerateVideoFromSelection,
    handleNavigateToShot,
    handleOpenGenerateVideo,
    handleSplitClipHere,
    handleSplitClipsAtPlayhead,
    handleToggleMuteClips,
    isCreating,
    isClipSelected,
    onDoubleClickAsset,
    primaryClipId,
    resolvedClipMap,
    trackMap,
    selectedClipIds,
    staleAssetKeys,
    thumbnailMap,
    updateAssetToCurrentVariant,
  ]);

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
    handleMoveTrack(activeTrackId, overTrackId);
  }, [handleMoveTrack]);

  if (!data) {
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-border bg-card/80">
      <div
        ref={timelineWrapperRef as React.RefObject<HTMLDivElement>}
        className="timeline-wrapper relative min-w-0 flex-1 overflow-hidden"
        onDragOver={onTimelineDragOver}
        onDragLeave={onTimelineDragLeave}
        onDrop={onTimelineDrop}
      >
        <TimelineCanvas
          ref={timelineRef as React.RefObject<import('@/tools/video-editor/types/timeline-canvas').TimelineCanvasHandle>}
          rows={data.rows}
          tracks={data.tracks}
          scale={scale}
          scaleWidth={scaleWidth}
          scaleSplitCount={5}
          startLeft={TIMELINE_START_LEFT}
          rowHeight={ROW_HEIGHT}
          minScaleCount={scaleCount}
          maxScaleCount={scaleCount}
          selectedTrackId={selectedTrackId}
          getActionRender={getActionRender}
          onSelectTrack={setSelectedTrackId}
          onTrackChange={handleTrackPopoverChange}
          onRemoveTrack={handleRemoveTrack}
          onTrackDragEnd={handleTrackDragEnd}
          trackSensors={trackSensors}
          onCursorDrag={onCursorDrag}
          onClickTimeArea={onClickTimeArea}
          onActionResizeStart={onActionResizeStart}
          onActionResizeEnd={onActionResizeEnd}
          shotGroups={shotGroups}
          finalVideoMap={finalVideoMap}
          activeTaskClipIds={activeTaskClipIds}
          onShotGroupNavigate={handleShotGroupNavigate}
          onShotGroupGenerateVideo={handleShotGroupGenerateVideo}
          onShotGroupUnpin={(group) => {
            unpinGroup(group.shotId, group.trackId);
          }}
          onShotGroupSwitchToFinalVideo={(group) => {
            const finalVideo = finalVideoMap.get(group.shotId);
            if (finalVideo) {
              dismissFinalVideo(finalVideo.id);
            }
            handleSwitchToFinalVideo(group);
          }}
          onShotGroupSwitchToImages={(group) => {
            handleSwitchToImages(group);
          }}
          onSelectClips={selectClips}
          dragSessionRef={dragSessionRef}
          marqueeRect={marqueeRect}
          onEditAreaPointerDown={onMarqueePointerDown}
          onAddTrack={chrome.handleAddTrack}
          onAddTextAt={chrome.handleAddTextAt}
          unusedTrackCount={chrome.unusedTrackCount}
          onClearUnusedTracks={chrome.handleClearUnusedTracks}
          newTrackDropLabel={newTrackDropLabel}
        />
        <DropIndicator ref={indicatorRef} editAreaRef={editAreaRef} onNewTrackLabel={setNewTrackDropLabel} />
      </div>

      {videoModalShot && (
        <>
          {/* VideoGenerationModal only uses app-wide providers, so it can open from timeline selection flow. */}
          <VideoGenerationModal
            isOpen={true}
            onClose={() => setVideoModalShot(null)}
            shot={videoModalShot}
          />
        </>
      )}
    </div>
  );
}

export const TimelineEditor = memo(TimelineEditorComponent);
