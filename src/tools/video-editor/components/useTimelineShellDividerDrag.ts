import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export const MIN_TIMELINE_HEIGHT = 140;
export const MIN_PREVIEW_HEIGHT = 180;
export const CHROME_OVERHEAD = MIN_TIMELINE_HEIGHT + 40 + 28 + 24;

type DividerPointerEvent = ReactPointerEvent<HTMLElement>;

type ActiveDividerDrag = {
  container: HTMLDivElement;
  divider: HTMLDivElement;
  pointerId: number;
  startClientY: number;
  initialTimelineHeight: number;
  containerRect: DOMRect;
  latestHeight: number;
  pendingHeight: number | null;
  animationFrameId: number | null;
  previousContainerTransition: string;
  previousBodyCursor: string;
  previousBodyUserSelect: string;
  wasMaximized: boolean;
  onWindowResize: () => void;
  onWindowBlur: () => void;
};

/**
 * Desktop preview/timeline split: the drag handle between the two rows, the
 * resulting timeline height, and the maximize toggle. Emits the grid template
 * the desktop layout applies.
 *
 * Three rows are used when there is no extension activity: preview,
 * divider/toolbar, timeline. A fourth row is added only while extension
 * activity is visible, so an empty activity surface cannot leave a blank band
 * between the toolbar and timeline.
 */
export function useTimelineShellDividerDrag(hasActivityRegion = false) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<ActiveDividerDrag | null>(null);
  const [timelineHeight, setTimelineHeight] = useState<number | null>(null);
  const [isTimelineMaximized, setIsTimelineMaximized] = useState(false);

  const gridRowsForTimelineHeight = useCallback((height: number) => (
    hasActivityRegion
      ? `minmax(0,1fr) auto auto ${height}px`
      : `minmax(0,1fr) auto ${height}px`
  ), [hasActivityRegion]);

  const readTimelineHeight = useCallback((container: HTMLDivElement, rect: DOMRect) => {
    const measuredHeight = timelineRef.current?.getBoundingClientRect().height;
    if (measuredHeight && Number.isFinite(measuredHeight)) {
      return measuredHeight;
    }

    const computedRows = window.getComputedStyle(container).gridTemplateRows;
    const pixelTracks = computedRows.match(/-?\d+(?:\.\d+)?px/g);
    const lastPixelTrack = pixelTracks?.at(-1);
    const computedHeight = lastPixelTrack ? Number.parseFloat(lastPixelTrack) : Number.NaN;
    if (Number.isFinite(computedHeight)) {
      return computedHeight;
    }

    return timelineHeight ?? Math.max(MIN_TIMELINE_HEIGHT, rect.height * 0.36);
  }, [timelineHeight]);

  const applyPendingHeight = useCallback(() => {
    const activeDrag = activeDragRef.current;
    if (!activeDrag) {
      return;
    }

    activeDrag.animationFrameId = null;
    if (activeDrag.pendingHeight === null) {
      return;
    }

    activeDrag.container.style.gridTemplateRows = gridRowsForTimelineHeight(activeDrag.pendingHeight);
    activeDrag.pendingHeight = null;
  }, [gridRowsForTimelineHeight]);

  const queueHeight = useCallback((height: number) => {
    const activeDrag = activeDragRef.current;
    if (!activeDrag) {
      return;
    }

    activeDrag.latestHeight = height;
    activeDrag.pendingHeight = height;
    if (activeDrag.animationFrameId !== null) {
      return;
    }

    activeDrag.animationFrameId = window.requestAnimationFrame(applyPendingHeight);
  }, [applyPendingHeight]);

  const finishDrag = useCallback((event?: DividerPointerEvent) => {
    const activeDrag = activeDragRef.current;
    if (!activeDrag || (event && event.pointerId !== activeDrag.pointerId)) {
      return;
    }

    if (activeDrag.animationFrameId !== null) {
      window.cancelAnimationFrame(activeDrag.animationFrameId);
    }
    activeDrag.animationFrameId = null;
    activeDrag.pendingHeight = null;
    activeDrag.container.style.gridTemplateRows = gridRowsForTimelineHeight(activeDrag.latestHeight);
    setTimelineHeight(activeDrag.latestHeight);

    activeDrag.container.style.gridTemplateRows = '';
    activeDrag.container.style.transition = activeDrag.previousContainerTransition;
    activeDrag.container.classList.remove('is-dragging');
    activeDrag.divider.classList.remove('is-dragging');
    document.body.style.cursor = activeDrag.previousBodyCursor;
    document.body.style.userSelect = activeDrag.previousBodyUserSelect;
    window.removeEventListener('resize', activeDrag.onWindowResize);
    window.removeEventListener('blur', activeDrag.onWindowBlur);
    activeDragRef.current = null;

    const target = event?.currentTarget;
    if (target && event && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }, [gridRowsForTimelineHeight]);

  const onDividerPointerDown = useCallback((event: DividerPointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || activeDragRef.current) {
      return;
    }

    event.preventDefault();
    const container = containerRef.current;
    const divider = dividerRef.current;
    if (!container || !divider) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const initialTimelineHeight = Math.max(MIN_TIMELINE_HEIGHT, readTimelineHeight(container, rect));
    const previousContainerTransition = container.style.transition;
    const onWindowResize = () => {
      const activeDrag = activeDragRef.current;
      if (activeDrag) {
        activeDrag.containerRect = activeDrag.container.getBoundingClientRect();
      }
    };

    const activeDrag: ActiveDividerDrag = {
      container,
      divider,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      initialTimelineHeight,
      containerRect: rect,
      latestHeight: initialTimelineHeight,
      pendingHeight: null,
      animationFrameId: null,
      previousContainerTransition,
      previousBodyCursor: document.body.style.cursor,
      previousBodyUserSelect: document.body.style.userSelect,
      wasMaximized: isTimelineMaximized,
      onWindowResize,
      onWindowBlur: () => finishDrag(),
    };

    activeDragRef.current = activeDrag;
    container.style.transition = 'none';
    container.classList.add('is-dragging');
    divider.classList.add('is-dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('blur', activeDrag.onWindowBlur);

    if (!isTimelineMaximized) {
      setIsTimelineMaximized(false);
    }
  }, [finishDrag, isTimelineMaximized, readTimelineHeight]);

  const onDividerPointerMove = useCallback((event: DividerPointerEvent) => {
    const activeDrag = activeDragRef.current;
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
      return;
    }

    event.preventDefault();
    if (activeDrag.wasMaximized) {
      activeDrag.wasMaximized = false;
      setIsTimelineMaximized(false);
    }

    const rawHeight = activeDrag.initialTimelineHeight + (activeDrag.startClientY - event.clientY);
    const maxHeight = Math.max(MIN_TIMELINE_HEIGHT, activeDrag.containerRect.height - MIN_PREVIEW_HEIGHT);
    const nextHeight = Math.min(Math.max(rawHeight, MIN_TIMELINE_HEIGHT), maxHeight);
    queueHeight(nextHeight);
  }, [queueHeight]);

  const onDividerPointerUp = useCallback((event: DividerPointerEvent) => {
    finishDrag(event);
  }, [finishDrag]);

  const onDividerPointerCancel = useCallback((event: DividerPointerEvent) => {
    finishDrag(event);
  }, [finishDrag]);

  const onDividerLostPointerCapture = useCallback((event: DividerPointerEvent) => {
    finishDrag(event);
  }, [finishDrag]);

  useEffect(() => () => {
    const activeDrag = activeDragRef.current;
    if (!activeDrag) {
      return;
    }

    if (activeDrag.animationFrameId !== null) {
      window.cancelAnimationFrame(activeDrag.animationFrameId);
    }
    window.removeEventListener('resize', activeDrag.onWindowResize);
    activeDrag.container.style.gridTemplateRows = '';
    activeDrag.container.style.transition = activeDrag.previousContainerTransition;
    activeDrag.container.classList.remove('is-dragging');
    activeDrag.divider.classList.remove('is-dragging');
    document.body.style.cursor = activeDrag.previousBodyCursor;
    document.body.style.userSelect = activeDrag.previousBodyUserSelect;
    window.removeEventListener('blur', activeDrag.onWindowBlur);
    activeDragRef.current = null;
  }, []);

  const gridTemplateRows = isTimelineMaximized
    ? (hasActivityRegion
      ? `${MIN_PREVIEW_HEIGHT}px auto auto 1fr`
      : `${MIN_PREVIEW_HEIGHT}px auto 1fr`)
    : (timelineHeight
      ? (hasActivityRegion
        ? `minmax(0,1fr) auto auto ${timelineHeight}px`
        : `minmax(0,1fr) auto ${timelineHeight}px`)
      : (hasActivityRegion
        ? 'minmax(0,1fr) auto auto minmax(200px,36%)'
        : 'minmax(0,1fr) auto minmax(200px,36%)'));

  return {
    containerRef,
    dividerRef,
    timelineRef,
    isTimelineMaximized,
    setIsTimelineMaximized,
    onDividerPointerDown,
    onDividerPointerMove,
    onDividerPointerUp,
    onDividerPointerCancel,
    onDividerLostPointerCapture,
    gridTemplateRows,
  };
}
