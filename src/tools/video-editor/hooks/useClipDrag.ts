import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { SelectClipOptions } from '@/tools/video-editor/hooks/useMultiSelect';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';
import type { TrackKind } from '@/tools/video-editor/types';
import type { ClipMeta, ClipOrderMap, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import {
  type ClipOffset,
  planMultiDragMoves,
  applyMultiDragMoves,
  computeSecondaryGhosts,
} from '@/tools/video-editor/lib/multi-drag-utils';
import { createAutoScroller } from '@/tools/video-editor/lib/auto-scroll';
import { snapDrag } from '@/tools/video-editor/lib/snap-edges';

const DRAG_THRESHOLD_PX = 4;
/** Snap threshold in pixels — converted to seconds based on current zoom. */
const SNAP_THRESHOLD_PX = 8;
/** Vertical pixel threshold before activating cross-track mode. */
const CROSS_TRACK_THRESHOLD_PX = 10;

export interface ActionDragState {
  rowId: string;
  initialStart: number;
  initialEnd: number;
  latestStart: number;
  latestEnd: number;
}

interface UseCrossTrackDragOptions {
  timelineWrapperRef: RefObject<HTMLDivElement | null>;
  dataRef: MutableRefObject<TimelineData | null>;
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number, transactionId?: string) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number) => void;
  selectClip: (clipId: string, opts?: SelectClipOptions) => void;
  selectClips: (clipIds: Iterable<string>) => void;
  selectedClipIdsRef: MutableRefObject<Set<string>>;
  applyTimelineEdit: (
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
    options?: { save?: boolean; transactionId?: string; semantic?: boolean },
  ) => void;
  coordinator: DragCoordinator;
  rowHeight: number;
  scale: number;
  scaleWidth: number;
  startLeft: number;
}

export interface DragSession {
  pointerId: number;
  clipId: string;
  sourceRowId: string;
  sourceKind: TrackKind;
  draggedClipIds: string[];
  clipOffsets: ClipOffset[];
  ctrlKey: boolean;
  metaKey: boolean;
  wasSelectedOnPointerDown: boolean;
  startClientX: number;
  startClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  latestStart: number;
  clipDuration: number;
  clipEl: HTMLElement;
  moveListener: (event: PointerEvent) => void;
  upListener: (event: PointerEvent) => void;
  cancelListener: (event: PointerEvent) => void;
  /** Floating clone shown during cross-track drag. */
  floatingGhostEl: HTMLElement | null;
  countBadgeEl: HTMLSpanElement | null;
  hasMoved: boolean;
  transactionId: string;
}

export interface UseClipDragResult {
  dragSessionRef: MutableRefObject<DragSession | null>;
}

export const useClipDrag = ({
  timelineWrapperRef,
  dataRef,
  moveClipToRow,
  createTrackAndMoveClip,
  selectClip,
  selectClips,
  selectedClipIdsRef,
  applyTimelineEdit,
  coordinator,
  rowHeight: _rowHeight,
  scale,
  scaleWidth,
  startLeft: _startLeft,
}: UseCrossTrackDragOptions): UseClipDragResult => {
  const dragSessionRef = useRef<DragSession | null>(null);
  const actionDragStateRef = useRef<ActionDragState | null>(null);
  const crossTrackActiveRef = useRef(false);
  const autoScrollerRef = useRef<ReturnType<typeof createAutoScroller> | null>(null);

  // Keep volatile values in refs so the effect doesn't re-run mid-drag
  // when zoom/scale changes.
  const coordinatorRef = useRef(coordinator);
  coordinatorRef.current = coordinator;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const scaleWidthRef = useRef(scaleWidth);
  scaleWidthRef.current = scaleWidth;
  const moveClipToRowRef = useRef(moveClipToRow);
  moveClipToRowRef.current = moveClipToRow;
  const createTrackAndMoveClipRef = useRef(createTrackAndMoveClip);
  createTrackAndMoveClipRef.current = createTrackAndMoveClip;
  const selectClipRef = useRef(selectClip);
  selectClipRef.current = selectClip;
  const selectClipsRef = useRef(selectClips);
  selectClipsRef.current = selectClips;
  const selectedClipIdsRefRef = useRef(selectedClipIdsRef);
  selectedClipIdsRefRef.current = selectedClipIdsRef;
  const applyTimelineEditRef = useRef<UseTimelineDataResult['applyTimelineEdit']>(applyTimelineEdit);
  applyTimelineEditRef.current = applyTimelineEdit;

  useEffect(() => {
    const clearSession = (session: DragSession | null, deferDeactivate = false) => {
      autoScrollerRef.current?.stop();
      autoScrollerRef.current = null;
      coordinatorRef.current.end();
      if (!session) {
        actionDragStateRef.current = null;
        if (!deferDeactivate) {
          crossTrackActiveRef.current = false;
        }
        return;
      }

      session.floatingGhostEl?.remove();
      session.countBadgeEl?.remove();
      window.removeEventListener('pointermove', session.moveListener);
      window.removeEventListener('pointerup', session.upListener);
      window.removeEventListener('pointercancel', session.cancelListener);
      try {
        if (session.clipEl.hasPointerCapture(session.pointerId)) {
          session.clipEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // Pointer capture can already be released by the browser during teardown.
      }

      dragSessionRef.current = null;
      actionDragStateRef.current = null;
      if (deferDeactivate) {
        window.requestAnimationFrame(() => {
          if (!dragSessionRef.current) {
            crossTrackActiveRef.current = false;
          }
        });
      } else {
        crossTrackActiveRef.current = false;
      }
    };

    // ── Helpers ──────────────────────────────────────────────────────

    const updateFloatingGhostPosition = (session: DragSession, clientX: number, clientY: number) => {
      if (!session.floatingGhostEl) return;
      session.floatingGhostEl.style.left = `${clientX - session.pointerOffsetX}px`;
      session.floatingGhostEl.style.top = `${clientY - session.pointerOffsetY}px`;
    };

    const createFloatingGhost = (clipEl: HTMLElement): HTMLElement => {
      const rect = clipEl.getBoundingClientRect();
      const el = clipEl.cloneNode(true) as HTMLElement;
      el.classList.add('cross-track-ghost');
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      document.body.appendChild(el);
      return el;
    };

    const ensureCountBadge = (session: DragSession) => {
      if (session.draggedClipIds.length <= 1 || session.countBadgeEl) {
        return;
      }

      const badge = document.createElement('span');
      badge.className = 'pointer-events-none absolute right-1 top-1 rounded-full bg-sky-400 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sky-950 shadow-sm';
      badge.textContent = `${session.draggedClipIds.length} clips`;
      session.clipEl.appendChild(badge);
      session.countBadgeEl = badge;
    };

    const getAnchorTimeDelta = (session: DragSession, snappedStart: number): number => {
      const anchorClip = session.clipOffsets.find((c) => c.clipId === session.clipId);
      return anchorClip ? snappedStart - anchorClip.initialStart : 0;
    };

    // ── Pointer handlers ─────────────────────────────────────────────

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      // Check that the event originated inside our wrapper
      const wrapper = timelineWrapperRef.current;
      if (!wrapper || !wrapper.contains(event.target as Node)) return;

      const clipTarget = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.clip-action') : null;
      if (!clipTarget || (event.target instanceof HTMLElement && event.target.closest("[data-delete-clip='true']"))) return;

      const clipId = clipTarget.dataset.clipId;
      const rowId = clipTarget.dataset.rowId;
      if (!clipId || !rowId) return;

      const current = dataRef.current;
      const sourceTrack = current?.tracks.find((track) => track.id === rowId);
      const sourceRow = current?.rows.find((row) => row.id === rowId);
      const sourceAction = sourceRow?.actions.find((action) => action.id === clipId);
      if (!current || !sourceTrack || !sourceAction) return;

      clearSession(dragSessionRef.current);
      const editArea = wrapper.querySelector<HTMLElement>('.timeline-canvas-edit-area');

      const clipRect = clipTarget.getBoundingClientRect();
      const initialStart = sourceAction.start;
      const clipDuration = sourceAction.end - sourceAction.start;
      const selectedClipIds = selectedClipIdsRefRef.current.current;
      const draggedClipIds = selectedClipIds.has(clipId)
        ? [clipId, ...[...selectedClipIds].filter((selectedClipId) => selectedClipId !== clipId)]
        : [clipId];
      const clipOffsets: ClipOffset[] = draggedClipIds.flatMap((draggedClipId) => {
        for (const row of current.rows) {
          const action = row.actions.find((candidate) => candidate.id === draggedClipId);
          if (action) {
            return [{
              clipId: draggedClipId,
              rowId: row.id,
              deltaTime: action.start - initialStart,
              initialStart: action.start,
              initialEnd: action.end,
            }];
          }
        }

        return [];
      });
      const validDraggedClipIds = clipOffsets.map(({ clipId: draggedClipId }) => draggedClipId);
      actionDragStateRef.current = {
        rowId,
        initialStart,
        initialEnd: sourceAction.end,
        latestStart: initialStart,
        latestEnd: sourceAction.end,
      };

      const updateDragState = (session: DragSession, clientX: number, clientY: number) => {
        const nextPosition = coordinatorRef.current.update({
          clientX,
          clientY,
          sourceKind: session.sourceKind,
          clipDuration: session.clipDuration,
          clipOffsetX: session.pointerOffsetX,
        });

        const pixelsPerSecond = scaleWidthRef.current / scaleRef.current;
        const snapThresholdS = SNAP_THRESHOLD_PX / pixelsPerSecond;
        const targetRowId = nextPosition.trackId ?? session.sourceRowId;
        const targetRow = dataRef.current?.rows.find((row) => row.id === targetRowId);
        const siblings = targetRow?.actions ?? [];
        const { start: snappedStart } = snapDrag(
          nextPosition.time,
          session.clipDuration,
          siblings,
          session.clipId,
          snapThresholdS,
          session.draggedClipIds,
        );

        session.latestStart = snappedStart;
        const dragState = actionDragStateRef.current;
        if (dragState) {
          const duration = dragState.initialEnd - dragState.initialStart;
          dragState.latestStart = snappedStart;
          dragState.latestEnd = snappedStart + duration;
        }

        const dy = clientY - session.startClientY;
        if (!crossTrackActiveRef.current && Math.abs(dy) >= CROSS_TRACK_THRESHOLD_PX) {
          crossTrackActiveRef.current = true;
          session.floatingGhostEl = createFloatingGhost(session.clipEl);
          updateFloatingGhostPosition(session, clientX, clientY);
        }

        if (crossTrackActiveRef.current) {
          updateFloatingGhostPosition(session, clientX, clientY);
        }

        if (session.floatingGhostEl) {
          session.floatingGhostEl.style.cursor = nextPosition.isReject ? 'not-allowed' : '';
        }

        if (session.draggedClipIds.length > 1) {
          const latest = dataRef.current;
          if (latest) {
            const anchorTargetRowId = nextPosition.trackId ?? session.sourceRowId;
            const ghosts = computeSecondaryGhosts(
              session.clipOffsets,
              session.clipId,
              session.sourceRowId,
              anchorTargetRowId,
              nextPosition.screenCoords.clipLeft,
              nextPosition.screenCoords.rowTop,
              nextPosition.screenCoords.rowHeight,
              pixelsPerSecond,
              latest.rows.map((row) => row.id),
            );
            coordinatorRef.current.showSecondaryGhosts(ghosts);
          }
        }
      };

      autoScrollerRef.current = editArea
        ? createAutoScroller(editArea, (clientX, clientY) => {
            const session = dragSessionRef.current;
            if (!session) {
              return;
            }
            updateDragState(session, clientX, clientY);
          })
        : null;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || moveEvent.pointerId !== session.pointerId) return;

        const dx = moveEvent.clientX - session.startClientX;
        const dy = moveEvent.clientY - session.startClientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Don't show anything until the pointer actually moves (avoids flash on click)
        if (!session.hasMoved && distance < DRAG_THRESHOLD_PX) return;

        // First move past threshold — capture the pointer so we own all subsequent events
        // and the timeline library can't start its own competing drag.
        if (!session.hasMoved) {
          session.hasMoved = true;
          try { session.clipEl.setPointerCapture(session.pointerId); } catch { /* ok */ }
          ensureCountBadge(session);
        }

        // Prevent default on all moves once dragging to stop the library's handler
        moveEvent.preventDefault();
        autoScrollerRef.current?.update(moveEvent.clientX, moveEvent.clientY);
        updateDragState(session, moveEvent.clientX, moveEvent.clientY);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || upEvent.pointerId !== session.pointerId) return;

        const dropPosition = coordinatorRef.current.lastPosition;
        // Use snapped time from drag state (computed during pointermove) rather than
        // the raw coordinator time, which doesn't account for edge snapping.
        const nextStart = actionDragStateRef.current?.latestStart ?? session.latestStart;

        // Cross-track single-clip drag: use existing moveClipToRow / createTrackAndMoveClip
        if (crossTrackActiveRef.current && session.draggedClipIds.length === 1) {
          upEvent.preventDefault();
          if (dropPosition?.isNewTrack) {
            createTrackAndMoveClipRef.current(session.clipId, session.sourceKind, nextStart);
          } else if (dropPosition?.trackId && !dropPosition.isReject) {
            moveClipToRowRef.current(session.clipId, dropPosition.trackId, nextStart, session.transactionId);
          } else {
            moveClipToRowRef.current(session.clipId, session.sourceRowId, nextStart, session.transactionId);
          }
          selectClipRef.current(session.clipId);
          clearSession(session, true);
          return;
        }

        // Multi-clip drag (same-track or cross-track) — unified path
        if (session.hasMoved && session.draggedClipIds.length > 1) {
          const current = dataRef.current;
          if (current) {
            const anchorTargetRowId = crossTrackActiveRef.current
              ? (dropPosition?.trackId && !dropPosition.isReject && !dropPosition.isNewTrack
                  ? dropPosition.trackId
                  : session.sourceRowId)
              : session.sourceRowId;
            const timeDelta = getAnchorTimeDelta(session, nextStart);
            const { canMove, moves } = planMultiDragMoves(
              current,
              session.clipOffsets,
              session.clipId,
              anchorTargetRowId,
              session.sourceRowId,
              timeDelta,
            );

            if (canMove && moves.length > 0) {
              const { nextRows, metaUpdates, nextClipOrder } = applyMultiDragMoves(current, moves);
              applyTimelineEditRef.current(nextRows, metaUpdates, undefined, nextClipOrder, {
                transactionId: session.transactionId,
              });
            }
          }
          selectClipsRef.current(session.draggedClipIds);
          clearSession(session, crossTrackActiveRef.current);
          return;
        }

        // Single-clip same-track drag
        if (session.hasMoved) {
          moveClipToRowRef.current(session.clipId, session.sourceRowId, nextStart, session.transactionId);
          selectClipRef.current(session.clipId);
        } else if (session.metaKey || session.ctrlKey) {
          selectClipRef.current(session.clipId, { toggle: true });
        } else {
          selectClipRef.current(session.clipId);
        }
        clearSession(session);
      };

      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || cancelEvent.pointerId !== session.pointerId) return;
        clearSession(session);
      };

      dragSessionRef.current = {
        pointerId: event.pointerId,
        clipId,
        sourceRowId: rowId,
        sourceKind: sourceTrack.kind,
        draggedClipIds: validDraggedClipIds,
        clipOffsets,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        wasSelectedOnPointerDown: selectedClipIdsRefRef.current.current.has(clipId),
        startClientX: event.clientX,
        startClientY: event.clientY,
        pointerOffsetX: event.clientX - clipRect.left,
        pointerOffsetY: event.clientY - clipRect.top,
        latestStart: initialStart,
        clipDuration,
        clipEl: clipTarget,
        moveListener: handlePointerMove,
        upListener: handlePointerUp,
        cancelListener: handlePointerCancel,
        floatingGhostEl: null,
        countBadgeEl: null,
        hasMoved: false,
        transactionId: crypto.randomUUID(),
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    };

    const handleBlur = () => {
      clearSession(dragSessionRef.current);
    };

    // Use capture phase on document so this fires BEFORE ClipAction's stopPropagation.
    // We listen on document (not the wrapper) because the wrapper may not be mounted
    // yet when this effect first runs; the containment check inside handlePointerDown
    // scopes events to the correct wrapper.
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('blur', handleBlur);
      clearSession(dragSessionRef.current);
    };
  // Stable refs only — volatile values (scale, coordinator, etc.) are read via refs
  // so the effect never re-runs mid-drag.
  }, [dataRef, timelineWrapperRef]);

  return {
    dragSessionRef,
  };
};
