// dataKind V1 (Batch 6): the duration-neutral lane strip mounted under the
// timeline's track rows (inside the same scroller, sharing the ruler's
// `pixelsPerSecond` scale — lane rows themselves are timeline-zero-origin,
// and never gated by `timelineOverlaysEnabled`).
//
// Reads lanes from the (patched) TimelineData plus the data-kind registry
// snapshot: a registered kind without a laneRenderer contributes no row (the
// host cannot paint it); opaque lanes render through the host's extent-bar
// fallback in DataLaneRow. The list is display-only — no duration, no export
// participation.
//
// Interaction (dataKind V1 rework): host-painted chrome dispatches timeline
// interaction targets through the same setters the overlay host uses — an
// extent-bar press produces `{kind:'dataItem', laneId, itemId, …}` and empty
// lane chrome a `{kind:'dataLane', laneId, …}`, with extension/contribution
// ids resolved from the registry record. With no setters (tests, isolated
// renders) the rows stay purely display-only.

import { getTimelineItemSelection, userSelectTimelineDataItem, type TimelineDataItemRef } from '@/shared/state/selectionStore.ts';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Button } from '@/shared/components/ui/button.tsx';
import { useOptionalVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { createEmptyTimelineViewSnapshot } from '@/tools/video-editor/lib/timeline-view-store.ts';
import type { TimelineViewStore } from '@astrid/editor-sdk';
import type {
  TimelineInteractionTarget,
  TimelineInspectorTarget,
  TimelineContextTarget,
} from '@/tools/video-editor/lib/mobile-interaction-model.ts';
import { visibleDataLanes } from '@/tools/video-editor/data-kinds/visibleDataLanes.ts';
import { useDataKindRegistrySnapshot } from '@/tools/video-editor/data-kinds/DataKindRegistryContext.tsx';
import { DataLaneRow, type DataLaneRowProps, type DataLaneViewport } from './DataLaneRow.tsx';

export interface DataLaneListProps {
  /** Patched TimelineData whose `dataLanes` carry the assembled views. */
  readonly data: TimelineData | null;
  /** Render only one shared mixed-order lane row when hosted by TrackListRenderer. */
  readonly laneId?: string;
  /** Register this row in the parent TrackListRenderer sortable context. */
  readonly sortable?: boolean;
  /** Disable reorder controls for read-only timelines. */
  readonly readOnly?: boolean;
  /** Read-only host timeline snapshot used to mark every playing occurrence. */
  readonly timelineViewStore?: TimelineViewStore;
  /**
   * Optional call-site symmetry with the track rows; lane rows never consume
   * it (their gutter sits in-flow, so the canvas origin IS t=0) and renderer
   * props always carry `startLeft: 0` (rework round-2 F1). Defaults to 0.
   */
  readonly startLeft?: number;
  /** Shared px-per-second scale — same value the ruler and tracks use. */
  readonly pixelsPerSecond: number;
  /** Measured timeline scroll viewport used for time-based item virtualization. */
  readonly viewport?: DataLaneViewport;
  /** Scroll the shared timeline viewport to a keyboard navigation target. */
  readonly onRequestItemIntoView?: (timelineStart: number, timelineEnd: number) => void;
  /** Timeline interaction-model setters, shared with the overlay host. */
  readonly clearSelection?: () => void;
  readonly setSelectedTrackId?: (trackId: string | null) => void;
  readonly setContextTarget?: (target: TimelineContextTarget) => void;
  readonly setInspectorTarget?: (target: TimelineInspectorTarget) => void;
  /** Current host selection; undefined preserves legacy local active-item visuals. */
  readonly selectedTarget?: TimelineInspectorTarget;
  readonly selectedDataItems?: readonly TimelineDataItemRef[];
  readonly selectionOwner?: symbol;
  /** Open the host's shared Extension Manager from the lane ownership affordance. */
  readonly onOpenExtensionManager?: () => void;
}

export function DataLaneList({
  data,
  laneId,
  sortable = false,
  readOnly = false,
  timelineViewStore,
  pixelsPerSecond,
  viewport,
  onRequestItemIntoView,
  clearSelection,
  setSelectedTrackId,
  setContextTarget,
  setInspectorTarget,
  selectedTarget,
  selectedDataItems,
  selectionOwner,
  onOpenExtensionManager,
}: DataLaneListProps) {
  const kindRecords = useDataKindRegistrySnapshot();
  const extensions = useOptionalVideoEditorRuntime()?.extensionRuntime?.extensions;
  const extensionNames = useMemo(() => new Map((extensions ?? []).map((extension) => [
    String(extension.manifest.id), extension.manifest.label,
  ])), [extensions]);
  const subscribeTimeline = useCallback((notify: () => void) => {
    const handle = timelineViewStore?.subscribe(notify);
    return () => handle?.dispose();
  }, [timelineViewStore]);
  const getTimelineSnapshot = useCallback(
    () => timelineViewStore?.getSnapshot() ?? EMPTY_TIMELINE_VIEW_SNAPSHOT,
    [timelineViewStore],
  );
  const timelineSnapshot = useSyncExternalStore(
    subscribeTimeline,
    getTimelineSnapshot,
    getTimelineSnapshot,
  );

  const dispatch = useCallback((target: TimelineInteractionTarget) => {
    // A data target replaces clip/track selection. Clear those synchronous
    // selection-store values before publishing the target so the shell cannot
    // derive a stale clip inspector and overwrite the user's first lane click.
    clearSelection?.();
    setSelectedTrackId?.(null);
    setContextTarget?.(target);
    setInspectorTarget?.(target);
  }, [clearSelection, setContextTarget, setInspectorTarget, setSelectedTrackId]);

  const lanes = useMemo(
    () => visibleDataLanes(data?.dataLanes).filter((lane) => laneId === undefined || lane.laneId === laneId),
    [data, laneId],
  );

  if (lanes.length === 0) {
    return null;
  }

  return (
    <div data-testid="data-lane-list" role="group" aria-label="Data lanes">
      {lanes.map((lane) => {
        const kindRecord = lane.kindId ? kindRecords.get(lane.kindId) : undefined;
        const ownerExtensionId = kindRecord?.ownerExtensionId;
        const rowProps: DataLaneRowProps = {
          lane,
          pixelsPerSecond,
          playheadTime: timelineSnapshot.playhead.time,
          isPlaying: timelineSnapshot.playhead.isPlaying,
          viewport,
          onRequestItemIntoView,
          extensionId: ownerExtensionId,
          ownerExtensionName: ownerExtensionId ? extensionNames.get(ownerExtensionId) : undefined,
          onOpenExtensionManager,
          selectedItemIds: selectedDataItems?.filter((ref) => ref.laneId === lane.laneId).map((ref) => ref.itemId),
          selectedItemId: selectedTarget === undefined
            ? undefined
            : selectedTarget?.kind === 'dataItem'
              && selectedTarget.laneId === lane.laneId
              && typeof selectedTarget.itemId === 'string'
                ? selectedTarget.itemId
                : null,
          laneActions: kindRecord?.laneActions,
          supportsSparseItemWindows: kindRecord
            ? kindRecord.supportsSparseItemWindows === true
            : false,
          onSelectLane: () => dispatch({
            kind: 'dataLane',
            laneId: lane.laneId,
            extensionId: ownerExtensionId,
            contributionId: kindRecord?.contributionId,
          }),
          onSelectItem: (itemId, options) => {
            userSelectTimelineDataItem({ laneId: lane.laneId, itemId }, options, selectionOwner);
            setSelectedTrackId?.(null);
            const selection = getTimelineItemSelection(selectionOwner);
            const count = selection.clipIds.length + selection.dataItems.length;
            const ref = selection.dataItems[0];
            const target: TimelineInteractionTarget = count > 1
              ? { kind: 'selection', clipIds: [...selection.clipIds], dataItems: selection.dataItems }
              : ref ? { kind: 'dataItem', ...ref, extensionId: ownerExtensionId, contributionId: kindRecord?.contributionId }
              : selection.clipIds.length ? { kind: 'clip', clipId: selection.clipIds[0] }
              : { kind: 'timeline' };
            setContextTarget?.(target);
            setInspectorTarget?.(target);
          },
        };

        return sortable
          ? <SortableDataLaneRow key={lane.laneId} lane={lane} rowProps={rowProps} readOnly={readOnly} />
          : <DataLaneRow key={lane.laneId} {...rowProps} />;
      })}
    </div>
  );
}

function SortableDataLaneRow({
  lane,
  rowProps,
  readOnly,
}: {
  readonly lane: DataLaneRowProps['lane'];
  readonly rowProps: DataLaneRowProps;
  readonly readOnly: boolean;
}) {
  const sortableId = `data-lane-${lane.laneId}`;
  const sortable = useSortable({ id: sortableId, disabled: readOnly });
  const { active, over } = useDndContext();
  const isDropTarget = over?.id === sortableId && active?.id !== sortableId;
  const activeIndex = (active?.data.current as { sortable?: { index?: unknown } } | undefined)?.sortable?.index;
  const insertionEdge = isDropTarget && typeof activeIndex === 'number'
    ? activeIndex < sortable.index ? 'after' : 'before'
    : null;
  const style = {
    height: lane.height,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    zIndex: sortable.isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      data-sortable-id={sortableId}
      style={style}
    >
      <DataLaneRow
        {...rowProps}
        insertionEdge={insertionEdge}
        rowDragging={sortable.isDragging}
        rowDragHandle={readOnly ? undefined : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={[
              'h-6 w-6 shrink-0 cursor-grab touch-none text-muted-foreground transition-opacity hover:bg-accent focus-visible:opacity-100 active:cursor-grabbing',
              sortable.isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            ].join(' ')}
            title={`Reorder ${lane.label} row`}
            aria-label={`Reorder ${lane.label} row`}
            onClick={(event) => event.stopPropagation()}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
        )}
      />
    </div>
  );
}

const EMPTY_TIMELINE_VIEW_SNAPSHOT = createEmptyTimelineViewSnapshot();
