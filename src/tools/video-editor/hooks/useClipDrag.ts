import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { SelectClipOptions } from '@/tools/video-editor/hooks/useMultiSelect';
import type { TimelineApplyEdit } from '@/tools/video-editor/hooks/timeline-state-types';
import type { TrackKind } from '@/tools/video-editor/types';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import {
  type ClipOffset,
  applyMultiDragMoves,
  buildAugmentedData,
  buildConfigFromDragResult,
  computeSecondaryGhosts,
  planMultiDragMoves,
} from '@/tools/video-editor/lib/multi-drag-utils';
import { createAutoScroller } from '@/tools/video-editor/lib/auto-scroll';
import { notifyInteractionEndIfIdle } from '@/tools/video-editor/lib/interaction-state';
import {
  shouldPreserveTouchSelectionForMove,
  shouldAllowTouchClipDrag,
  shouldToggleTouchSelection,
  type TimelineDeviceClass,
  type TimelineGestureOwner,
  type TimelineInputModality,
  type TimelineInteractionMode,
} from '@/tools/video-editor/lib/mobile-interaction-model';
import { findEnclosingPinnedGroup, orderClipIdsByAt } from '@/tools/video-editor/lib/pinned-group-projection';
import { snapDrag } from '@/tools/video-editor/lib/snap-edges';
import { useTimelineScale } from '@/tools/video-editor/hooks/useTimelineScale';
import type { PinnedShotGroup } from '@/tools/video-editor/types';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

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
  pendingOpsRef: MutableRefObject<number>;
  interactionStateRef?: import('@/tools/video-editor/lib/interaction-state').InteractionStateRef;
  deviceClass: TimelineDeviceClass;
  interactionMode: TimelineInteractionMode;
  gestureOwner: TimelineGestureOwner;
  setGestureOwner: (owner: TimelineGestureOwner) => void;
  setInputModalityFromPointerType: (pointerType: string | null | undefined) => TimelineInputModality;
  moveClipToRow: (clipId: string, targetRowId: string, newStartTime?: number, transactionId?: string) => void;
  createTrackAndMoveClip: (clipId: string, kind: TrackKind, newStartTime?: number, insertAtTop?: boolean) => void;
  selectClip: (clipId: string, opts?: SelectClipOptions) => void;
  selectClips: (clipIds: Iterable<string>) => void;
  selectedClipIdsRef: MutableRefObject<Set<string>>;
  applyEdit: TimelineApplyEdit;
  coordinator: DragCoordinator;
  additiveSelectionRef: MutableRefObject<boolean>;
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
  pointerCoordinateYOffset: number;
  clipDuration: number;
  clipEl: HTMLElement;
  inputModality: TimelineInputModality;
  moveListener: (event: PointerEvent) => void;
  upListener: (event: PointerEvent) => void;
  cancelListener: (event: PointerEvent) => void;
  /** Floating clone shown during cross-track drag. */
  floatingGhostEl: HTMLElement | null;
  countBadgeEl: HTMLSpanElement | null;
  dragAllowed: boolean;
  hasMoved: boolean;
  claimedGestureOwner: boolean;
  transactionId: string;
  groupDragEntry: GroupDragEntry | null;
}

interface GroupDragEntry {
  groupKey: { shotId: string; trackId: string };
  originStart: number;
  originTrackId: string;
}

export interface UseClipDragResult {
  dragSessionRef: MutableRefObject<DragSession | null>;
}

export const useClipDrag = ({
  timelineWrapperRef,
  dataRef,
  pendingOpsRef,
  interactionStateRef,
  deviceClass,
  interactionMode,
  gestureOwner,
  setGestureOwner,
  setInputModalityFromPointerType,
  moveClipToRow,
  createTrackAndMoveClip,
  selectClip,
  selectClips,
  selectedClipIdsRef,
  applyEdit,
  coordinator,
  additiveSelectionRef,
  rowHeight: _rowHeight,
  scale,
  scaleWidth,
  startLeft: _startLeft,
}: UseCrossTrackDragOptions): UseClipDragResult => {
  const dragSessionRef = useRef<DragSession | null>(null);
  const actionDragStateRef = useRef<ActionDragState | null>(null);
  const crossTrackActiveRef = useRef(false);
  const autoScrollerRef = useRef<ReturnType<typeof createAutoScroller> | null>(null);
  const { pixelsPerSecondRef } = useTimelineScale({
    scale,
    scaleWidth,
    startLeft: _startLeft,
  });

  // Keep volatile values in refs so the effect doesn't re-run mid-drag
  // when zoom/scale changes.
  const coordinatorRef = useRef(coordinator);
  coordinatorRef.current = coordinator;
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
  const pendingOpsRefRef = useRef(pendingOpsRef);
  pendingOpsRefRef.current = pendingOpsRef;
  const applyEditRef = useRef<TimelineApplyEdit>(applyEdit);
  applyEditRef.current = applyEdit;
  const additiveSelectionRefRef = useRef(additiveSelectionRef);
  additiveSelectionRefRef.current = additiveSelectionRef;
  const deviceClassRef = useRef(deviceClass);
  deviceClassRef.current = deviceClass;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const gestureOwnerRef = useRef(gestureOwner);
  gestureOwnerRef.current = gestureOwner;
  const setGestureOwnerRef = useRef(setGestureOwner);
  setGestureOwnerRef.current = setGestureOwner;
  const setInputModalityFromPointerTypeRef = useRef(setInputModalityFromPointerType);
  setInputModalityFromPointerTypeRef.current = setInputModalityFromPointerType;

  useEffect(() => {
    const findClipElement = (
      wrapper: HTMLDivElement,
      clipId: string,
      rowId: string,
    ): HTMLElement | null => {
      const candidates = wrapper.querySelectorAll<HTMLElement>('.clip-action');
      for (const candidate of candidates) {
        if (candidate.dataset.clipId === clipId && candidate.dataset.rowId === rowId) {
          return candidate;
        }
      }
      return null;
    };

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

      pendingOpsRefRef.current.current -= 1;
      if (interactionStateRef) {
        interactionStateRef.current.drag = false;
        notifyInteractionEndIfIdle(interactionStateRef);
      }
      if (session.claimedGestureOwner) {
        setGestureOwnerRef.current('none');
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
      const adjustedClientY = clientY + session.pointerCoordinateYOffset;
      session.floatingGhostEl.style.left = `${clientX - session.pointerOffsetX}px`;
      session.floatingGhostEl.style.top = `${adjustedClientY - session.pointerOffsetY}px`;
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

    const buildClipOffsets = (current: TimelineData, draggedClipIds: readonly string[], anchorInitialStart: number): ClipOffset[] => {
      return draggedClipIds.flatMap((draggedClipId) => {
        for (const row of current.rows) {
          const action = row.actions.find((candidate) => candidate.id === draggedClipId);
          if (action) {
            return [{
              clipId: draggedClipId,
              rowId: row.id,
              deltaTime: action.start - anchorInitialStart,
              initialStart: action.start,
              initialEnd: action.end,
            }];
          }
        }

        return [];
      });
    };

    const getAnchorTimeDelta = (session: DragSession, snappedStart: number): number => {
      if (session.groupDragEntry) {
        return snappedStart - session.groupDragEntry.originStart;
      }

      const anchorClip = session.clipOffsets.find((c) => c.clipId === session.clipId);
      return anchorClip ? snappedStart - anchorClip.initialStart : 0;
    };

    /**
     * After a grouped drag commit, rebuild the soft-tag pinned group list so:
     *  - the dragged group's trackId reflects the new row (cross-track drag)
     *  - the dragged group's clipIds are re-derived from the post-commit live
     *    `at` order (may differ from the pre-drag order if resolveOverlaps or
     *    snap-edges shuffled members)
     * Non-dragged groups pass through unchanged.
     */
    const rebuildGroupAfterDrag = (
      currentGroups: PinnedShotGroup[] | undefined,
      draggedGroupKey: { shotId: string; trackId: string },
      newTrackId: string,
      nextRows: TimelineRow[],
    ): PinnedShotGroup[] | undefined => {
      if (!currentGroups || currentGroups.length === 0) return undefined;
      return currentGroups.map((group) => {
        if (group.shotId !== draggedGroupKey.shotId || group.trackId !== draggedGroupKey.trackId) {
          return group;
        }
        const orderedClipIds = orderClipIdsByAt(group.clipIds, { rows: nextRows });
        return {
          ...group,
          trackId: newTrackId,
          clipIds: orderedClipIds,
        };
      });
    };

    // ── Pointer handlers ─────────────────────────────────────────────

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      // Check that the event originated inside our wrapper
      const wrapper = timelineWrapperRef.current;
      if (!wrapper || !wrapper.contains(event.target as Node)) return;

      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const labelTarget = eventTarget?.closest<HTMLElement>('[data-shot-group-drag-anchor-clip-id]') ?? null;
      if (labelTarget && eventTarget?.closest('button')) {
        return;
      }

      const clipTarget = eventTarget?.closest<HTMLElement>('.clip-action')
        ?? (
          labelTarget?.dataset.shotGroupDragAnchorClipId && labelTarget.dataset.shotGroupDragAnchorRowId
            ? findClipElement(
                wrapper,
                labelTarget.dataset.shotGroupDragAnchorClipId,
                labelTarget.dataset.shotGroupDragAnchorRowId,
              )
            : null
        );
      if (!clipTarget || (eventTarget && eventTarget.closest("[data-delete-clip='true']"))) return;

      const clipId = clipTarget.dataset.clipId;
      const rowId = clipTarget.dataset.rowId;
      if (!clipId || !rowId) return;
      if (gestureOwnerRef.current !== 'none' && gestureOwnerRef.current !== 'clip') return;

      const inputModality = setInputModalityFromPointerTypeRef.current(event.pointerType);
      const dragAllowed = shouldAllowTouchClipDrag(
        deviceClassRef.current,
        inputModality,
        interactionModeRef.current,
      );

      const current = dataRef.current;
      const sourceTrack = current?.tracks.find((track) => track.id === rowId);
      const sourceRow = current?.rows.find((row) => row.id === rowId);
      const sourceAction = sourceRow?.actions.find((action) => action.id === clipId);
      if (!current || !sourceTrack || !sourceAction) return;
      const enclosingGroup = findEnclosingPinnedGroup(current.config, clipId);

      clearSession(dragSessionRef.current);
      const editArea = wrapper.querySelector<HTMLElement>('.timeline-canvas-edit-area');

      const clipRect = clipTarget.getBoundingClientRect();
      const pointerCoordinateYOffset = labelTarget
        ? clipRect.top - labelTarget.getBoundingClientRect().top
        : 0;
      const adjustedStartClientY = event.clientY + pointerCoordinateYOffset;
      const pixelsPerSecond = pixelsPerSecondRef.current;

      // Soft-tag grouped drag: compute the group's live outer bounds from the
      // member clips' current actions. Fall back to the clicked clip's bounds
      // if the group has no resolvable members.
      let groupLiveStart = sourceAction.start;
      let groupLiveEnd = sourceAction.end;
      if (enclosingGroup) {
        const memberActions: { start: number; end: number }[] = [];
        for (const row of current.rows) {
          for (const action of row.actions) {
            if (enclosingGroup.group.clipIds.includes(action.id)) {
              memberActions.push({ start: action.start, end: action.end });
            }
          }
        }
        if (memberActions.length > 0) {
          groupLiveStart = Math.min(...memberActions.map((a) => a.start));
          groupLiveEnd = Math.max(...memberActions.map((a) => a.end));
        }
      }
      const initialStart = enclosingGroup ? groupLiveStart : sourceAction.start;
      const clipDuration = enclosingGroup
        ? (groupLiveEnd - groupLiveStart)
        : (sourceAction.end - sourceAction.start);
      const selectedClipIds = selectedClipIdsRefRef.current.current;
      const shouldDragSelectedSet = additiveSelectionRefRef.current.current && selectedClipIds.has(clipId);
      const draggedClipIds = enclosingGroup
        ? shouldDragSelectedSet
          ? [
              ...enclosingGroup.group.clipIds,
              ...[...selectedClipIds].filter((selectedClipId) => !enclosingGroup.group.clipIds.includes(selectedClipId)),
            ]
          : [...enclosingGroup.group.clipIds]
        : shouldDragSelectedSet
          ? [clipId, ...[...selectedClipIds].filter((selectedClipId) => selectedClipId !== clipId)]
          : [clipId];
      const clipOffsets = buildClipOffsets(current, draggedClipIds, initialStart);
      const validDraggedClipIds = clipOffsets.map(({ clipId: draggedClipId }) => draggedClipId);
      const groupDragEntry = enclosingGroup
        ? {
            groupKey: enclosingGroup.groupKey,
            originStart: groupLiveStart,
            originTrackId: enclosingGroup.group.trackId,
          }
        : null;
      actionDragStateRef.current = {
        rowId,
        initialStart,
        initialEnd: initialStart + clipDuration,
        latestStart: initialStart,
        latestEnd: initialStart + clipDuration,
      };

      const updateDragState = (session: DragSession, clientX: number, clientY: number) => {
        const adjustedClientY = clientY + session.pointerCoordinateYOffset;
        const nextPosition = coordinatorRef.current.update({
          clientX,
          clientY: adjustedClientY,
          sourceKind: session.sourceKind,
          clipDuration: session.clipDuration,
          clipOffsetX: session.pointerOffsetX,
        });

        const pixelsPerSecond = pixelsPerSecondRef.current;
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

        const dragState = actionDragStateRef.current;
        if (dragState) {
          const duration = dragState.initialEnd - dragState.initialStart;
          dragState.latestStart = snappedStart;
          dragState.latestEnd = snappedStart + duration;
        }

        const dy = adjustedClientY - session.startClientY;
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
        if (!session.dragAllowed) return;

        // First move past threshold — capture the pointer so we own all subsequent events
        // and the timeline library can't start its own competing drag.
        if (!session.hasMoved) {
          session.hasMoved = true;
          if (interactionStateRef) {
            interactionStateRef.current.drag = true;
          }
          session.claimedGestureOwner = true;
          setGestureOwnerRef.current('clip');
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
        const nextStart = actionDragStateRef.current!.latestStart;

        const isGroupDrag = session.groupDragEntry !== null;

        if (!isGroupDrag && crossTrackActiveRef.current && session.draggedClipIds.length === 1) {
          upEvent.preventDefault();
          if (dropPosition?.isNewTrack) {
            createTrackAndMoveClipRef.current(session.clipId, session.sourceKind, nextStart, dropPosition.isNewTrackTop);
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
        if (session.hasMoved && (session.draggedClipIds.length > 1 || isGroupDrag)) {
          const current = dataRef.current;
          if (current) {
            const timeDelta = getAnchorTimeDelta(session, nextStart);
            let handledNewTrackMove = false;

            if (crossTrackActiveRef.current && dropPosition?.isNewTrack) {
              const augmentedData = buildAugmentedData(current, session.sourceKind, dropPosition.isNewTrackTop ?? false);
              if (augmentedData) {
                const { augmented, newTrackId } = augmentedData;
                const { canMove, moves } = planMultiDragMoves(
                  augmented,
                  session.clipOffsets,
                  session.clipId,
                  newTrackId,
                  session.sourceRowId,
                  timeDelta,
                  session.groupDragEntry ?? undefined,
                );

                if (canMove && moves.length > 0) {
                  const { nextRows, metaUpdates } = applyMultiDragMoves(augmented, moves);
                  // Soft-tag grouped new-track drag: single `type: 'config'`
                  // commit carrying the new track AND the soft-tag override.
                  const finalConfig = buildConfigFromDragResult(
                    augmented.resolvedConfig,
                    augmented.meta,
                    nextRows,
                    metaUpdates,
                  );
                  const pinnedShotGroupsOverride = session.groupDragEntry
                    ? rebuildGroupAfterDrag(
                        current.config.pinnedShotGroups,
                        session.groupDragEntry.groupKey,
                        newTrackId,
                        nextRows,
                      )
                    : undefined;
                  applyEditRef.current({
                    type: 'config',
                    resolvedConfig: finalConfig,
                    pinnedShotGroupsOverride,
                  }, {
                    transactionId: session.transactionId,
                  });
                  handledNewTrackMove = true;
                }
              }
            }

            if (!handledNewTrackMove) {
              const anchorTargetRowId = crossTrackActiveRef.current
                ? (dropPosition?.trackId && !dropPosition.isReject && !dropPosition.isNewTrack
                    ? dropPosition.trackId
                    : session.sourceRowId)
                : session.sourceRowId;
              const { canMove, moves } = planMultiDragMoves(
                current,
                session.clipOffsets,
                session.clipId,
                anchorTargetRowId,
                session.sourceRowId,
                timeDelta,
                session.groupDragEntry ?? undefined,
              );

              if (canMove && moves.length > 0) {
                const { nextRows, metaUpdates, nextClipOrder } = applyMultiDragMoves(current, moves);
                // Soft-tag grouped drag (same-track or existing cross-track):
                // single `type: 'rows'` commit carrying translated clip moves
                // AND a soft-tag override re-derived from post-resolveOverlaps
                // `at` order. Do NOT hard-code 'no override needed' — the order
                // may change even when members stayed on the same row, and the
                // trackId must update for existing-track cross-track moves.
                const pinnedShotGroupsOverride = session.groupDragEntry
                  ? rebuildGroupAfterDrag(
                      current.config.pinnedShotGroups,
                      session.groupDragEntry.groupKey,
                      anchorTargetRowId,
                      nextRows,
                    )
                  : undefined;
                applyEditRef.current({
                  type: 'rows',
                  rows: nextRows,
                  metaUpdates,
                  clipOrderOverride: nextClipOrder,
                  pinnedShotGroupsOverride,
                }, {
                  transactionId: session.transactionId,
                });
              }
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
        } else if (shouldToggleTouchSelection(
          deviceClassRef.current,
          session.inputModality,
          interactionModeRef.current,
        )) {
          selectClipRef.current(session.clipId, { toggle: true });
        } else if (
          shouldPreserveTouchSelectionForMove(
            deviceClassRef.current,
            session.inputModality,
            interactionModeRef.current,
          )
          && session.wasSelectedOnPointerDown
          && selectedClipIdsRefRef.current.current.size > 1
        ) {
          selectClipRef.current(session.clipId, { preserveSelection: true });
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

      pendingOpsRefRef.current.current += 1;
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
        startClientY: adjustedStartClientY,
        pointerOffsetX: groupDragEntry
          ? event.clientX - (clipRect.left - ((sourceAction.start - initialStart) * pixelsPerSecond))
          : event.clientX - clipRect.left,
        pointerOffsetY: adjustedStartClientY - clipRect.top,
        pointerCoordinateYOffset,
        clipDuration,
        clipEl: clipTarget,
        inputModality,
        moveListener: handlePointerMove,
        upListener: handlePointerUp,
        cancelListener: handlePointerCancel,
        floatingGhostEl: null,
        countBadgeEl: null,
        dragAllowed,
        hasMoved: false,
        claimedGestureOwner: false,
        transactionId: crypto.randomUUID(),
        groupDragEntry,
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
