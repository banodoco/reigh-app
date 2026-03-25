import type { DragEvent as ReactDragEvent, MutableRefObject } from 'react';
import { getDragType } from '@/shared/lib/dnd/dragDrop';
import { rawRowIndexFromY } from '@/tools/video-editor/lib/coordinate-utils';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TrackKind } from '@/tools/video-editor/types';

interface TimelineDomNodes {
  wrapper: HTMLDivElement;
  editArea: HTMLElement | null;
  grid: HTMLElement | null;
}

interface DropScreenCoords {
  rowTop: number;
  rowLeft: number;
  rowWidth: number;
  rowHeight: number;
  clipLeft: number;
  clipWidth: number;
  ghostCenter: number;
}

export interface DropPosition {
  time: number;
  rowIndex: number;
  trackId: string | undefined;
  trackKind: TrackKind | null;
  trackName: string;
  isNewTrack: boolean;
  isReject: boolean;
  screenCoords: DropScreenCoords;
}

export interface ComputeDropPositionParams {
  clientX: number;
  clientY: number;
  wrapper: HTMLDivElement;
  dataRef: MutableRefObject<TimelineData | null>;
  scale: number;
  scaleWidth: number;
  startLeft: number;
  rowHeight: number;
  sourceKind?: TrackKind | null;
  clipDuration?: number;
  clipOffsetX?: number;
}

const timelineDomNodeCache = new WeakMap<HTMLDivElement, Omit<TimelineDomNodes, 'wrapper'>>();

export const getTimelineDomNodes = (wrapper: HTMLDivElement): TimelineDomNodes => {
  const cached = timelineDomNodeCache.get(wrapper);
  if (
    cached
    && (cached.editArea === null || cached.editArea.isConnected)
    && (cached.grid === null || cached.grid.isConnected)
  ) {
    return { wrapper, ...cached };
  }

  const editArea = wrapper.querySelector<HTMLElement>('.timeline-editor-edit-area');
  const grid = editArea?.querySelector<HTMLElement>('.ReactVirtualized__Grid')
    ?? wrapper.querySelector<HTMLElement>('.ReactVirtualized__Grid');
  const nextNodes = { editArea, grid };
  timelineDomNodeCache.set(wrapper, nextNodes);
  return { wrapper, ...nextNodes };
};

export const computeDropPosition = ({
  clientX,
  clientY,
  wrapper,
  dataRef,
  scale,
  scaleWidth,
  startLeft,
  rowHeight,
  sourceKind = null,
  clipDuration = 5,
  clipOffsetX,
}: ComputeDropPositionParams): DropPosition => {
  const current = dataRef.current;
  const { editArea, grid } = getTimelineDomNodes(wrapper);
  const wrapperRect = wrapper.getBoundingClientRect();
  const editRect = (editArea ?? wrapper).getBoundingClientRect();
  const scrollLeft = grid?.scrollLeft ?? 0;
  const scrollTop = grid?.scrollTop ?? 0;
  const pixelsPerSecond = scaleWidth / scale;
  const effectiveOffsetX = clipOffsetX ?? (clipDuration * pixelsPerSecond) / 2;
  const leftInGrid = clientX - editRect.left + scrollLeft - effectiveOffsetX;
  const time = Math.max(0, (leftInGrid - startLeft) / pixelsPerSecond);

  const rowCount = current?.rows.length ?? 0;
  const rawRowIndex = rawRowIndexFromY(clientY, editRect.top, scrollTop, rowHeight);
  const isNewTrack = rowCount === 0 || rawRowIndex >= rowCount;
  const rowIndex = rowCount === 0
    ? 0
    : isNewTrack
      ? rowCount
      : Math.min(Math.max(rawRowIndex, 0), rowCount - 1);
  const visualRowIndex = rowCount > 0 ? Math.min(rowIndex, rowCount - 1) : -1;
  const targetRow = visualRowIndex >= 0 ? current?.rows[visualRowIndex] : undefined;
  const targetTrack = visualRowIndex >= 0 ? current?.tracks[visualRowIndex] : undefined;
  const rowTop = visualRowIndex >= 0
    ? editRect.top + visualRowIndex * rowHeight - scrollTop
    : editRect.top;
  const clipLeft = editRect.left + startLeft + time * pixelsPerSecond - scrollLeft;
  const clipWidth = Math.max(0, Math.min(clipDuration * pixelsPerSecond, editRect.right - clipLeft));
  const ghostCenter = clipLeft + clipWidth / 2;
  const trackKind = isNewTrack ? sourceKind : targetTrack?.kind ?? null;
  const isReject = !isNewTrack && sourceKind !== null && targetTrack?.kind !== undefined && sourceKind !== targetTrack.kind;

  return {
    time,
    rowIndex,
    trackId: isNewTrack ? undefined : targetRow?.id,
    trackKind,
    trackName: targetTrack?.label ?? targetTrack?.id ?? '',
    isNewTrack,
    isReject,
    screenCoords: {
      rowTop,
      rowLeft: wrapperRect.left,
      rowWidth: wrapperRect.width,
      rowHeight,
      clipLeft,
      clipWidth,
      ghostCenter,
    },
  };
};

export const inferDragKind = (event: ReactDragEvent<HTMLDivElement>): TrackKind | null => {
  const types = Array.from(event.dataTransfer.types);
  if (types.includes('asset-kind:audio')) return 'audio';
  if (types.includes('asset-kind:visual')) return 'visual';
  if (types.includes('asset-key')) return null;
  if (getDragType(event) === 'generation') return 'visual';
  if (event.dataTransfer.items.length > 0) {
    for (const item of Array.from(event.dataTransfer.items)) {
      if (item.type.startsWith('audio/')) {
        return 'audio';
      }
    }
    return 'visual';
  }
  return null;
};
