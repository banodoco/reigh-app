import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { TrackKind } from '@/tools/video-editor/types';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';

const DRAG_THRESHOLD_PX = 4;

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
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number) => void;
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  coordinator: DragCoordinator;
  rowHeight: number;
  scale: number;
  scaleWidth: number;
  startLeft: number;
}

interface DragSession {
  pointerId: number;
  clipId: string;
  sourceRowId: string;
  sourceKind: TrackKind;
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
  hasMoved: boolean;
}

export const useClipDrag = ({
  timelineWrapperRef,
  dataRef,
  moveClipToRow,
  createTrackAndMoveClip,
  setSelectedClipId,
  setSelectedTrackId,
  coordinator,
  rowHeight,
  scale,
  scaleWidth,
  startLeft,
}: UseCrossTrackDragOptions): void => {
  const dragSessionRef = useRef<DragSession | null>(null);
  const actionDragStateRef = useRef<ActionDragState | null>(null);
  const crossTrackActiveRef = useRef(false);

  useEffect(() => {
    const wrapper = timelineWrapperRef.current;
    if (!wrapper) {
      return undefined;
    }

    const clearSession = (session: DragSession | null, deferDeactivate = false) => {
      coordinator.end();
      if (!session) {
        actionDragStateRef.current = null;
        if (!deferDeactivate) {
          crossTrackActiveRef.current = false;
        }
        return;
      }

      session.floatingGhostEl?.remove();
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

    const updateFloatingGhostPosition = (session: DragSession, event: PointerEvent) => {
      if (!session.floatingGhostEl) return;
      session.floatingGhostEl.style.left = `${event.clientX - session.pointerOffsetX}px`;
      session.floatingGhostEl.style.top = `${event.clientY - session.pointerOffsetY}px`;
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

    // ── Pointer handlers ─────────────────────────────────────────────

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

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

      const clipRect = clipTarget.getBoundingClientRect();
      const initialStart = sourceAction.start;
      const clipDuration = sourceAction.end - sourceAction.start;
      actionDragStateRef.current = {
        rowId,
        initialStart,
        initialEnd: sourceAction.end,
        latestStart: initialStart,
        latestEnd: sourceAction.end,
      };

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
        }

        // Prevent default on all moves once dragging to stop the library's handler
        moveEvent.preventDefault();

        const nextPosition = coordinator.update({
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
          sourceKind: session.sourceKind,
          clipDuration: session.clipDuration,
          clipOffsetX: session.pointerOffsetX,
        });

        session.latestStart = nextPosition.time;
        const dragState = actionDragStateRef.current;
        if (dragState) {
          const dur = dragState.initialEnd - dragState.initialStart;
          dragState.latestStart = nextPosition.time;
          dragState.latestEnd = nextPosition.time + dur;
        }

        // Activate cross-track mode (floating ghost) on vertical threshold
        if (!crossTrackActiveRef.current && Math.abs(dy) >= 10) {
          crossTrackActiveRef.current = true;
          session.floatingGhostEl = createFloatingGhost(session.clipEl);
          updateFloatingGhostPosition(session, moveEvent);
        }

        if (crossTrackActiveRef.current) {
          updateFloatingGhostPosition(session, moveEvent);
        }

        if (session.floatingGhostEl) {
          session.floatingGhostEl.style.cursor = nextPosition.isReject ? 'not-allowed' : '';
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || upEvent.pointerId !== session.pointerId) return;

        const dropPosition = coordinator.lastPosition;
        const nextStart = dropPosition?.time ?? actionDragStateRef.current?.latestStart ?? session.latestStart;
        if (crossTrackActiveRef.current) {
          upEvent.preventDefault();
          if (dropPosition?.isNewTrack) {
            createTrackAndMoveClip(session.clipId, session.sourceKind, nextStart);
          } else if (dropPosition?.trackId && !dropPosition.isReject) {
            moveClipToRow(session.clipId, dropPosition.trackId, nextStart);
            setSelectedTrackId(dropPosition.trackId);
          } else {
            moveClipToRow(session.clipId, session.sourceRowId, nextStart);
            setSelectedTrackId(session.sourceRowId);
          }
          setSelectedClipId(session.clipId);
          clearSession(session, true);
          return;
        }

        // Same-row move — apply the horizontal position change
        if (session.hasMoved) {
          moveClipToRow(session.clipId, session.sourceRowId, nextStart);
        }
        setSelectedClipId(session.clipId);
        setSelectedTrackId(session.sourceRowId);
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
        hasMoved: false,
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    };

    const handleBlur = () => {
      clearSession(dragSessionRef.current);
    };

    // Use capture phase so this fires BEFORE ClipAction's stopPropagation
    wrapper.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      wrapper.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('blur', handleBlur);
      clearSession(dragSessionRef.current);
    };
  }, [
    coordinator,
    createTrackAndMoveClip,
    dataRef,
    moveClipToRow,
    rowHeight,
    scale,
    scaleWidth,
    setSelectedClipId,
    setSelectedTrackId,
    startLeft,
    timelineWrapperRef,
  ]);
};
