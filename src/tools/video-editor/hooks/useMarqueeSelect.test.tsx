import { useState } from 'react';
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMarqueeSelect, type MarqueeRect } from '@/tools/video-editor/hooks/useMarqueeSelect';
import {
  CLIP_ACTION_CLASS,
  CLIP_ID_ATTR,
} from '@/tools/video-editor/lib/timeline-dom';
import type { TimelineInputModality } from '@/tools/video-editor/lib/mobile-interaction-model';

const selectionMocks = vi.hoisted(() => ({
  userSelectTimelineItems: vi.fn(),
  userClearAllSelection: vi.fn(),
}));

vi.mock('@/shared/state/selectionStore.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/shared/state/selectionStore.ts')>(),
  userSelectTimelineItems: selectionMocks.userSelectTimelineItems,
  userClearAllSelection: selectionMocks.userClearAllSelection,
}));

/**
 * The autoscroller is a rAF loop over a real scroll container; these tests drive
 * scroll changes explicitly instead, so the loop only adds nondeterminism.
 */
vi.mock('@/tools/video-editor/lib/auto-scroll.ts', () => ({
  createAutoScroller: () => ({ update: vi.fn(), stop: vi.fn() }),
}));

const EDIT_AREA_LEFT = 100;
const EDIT_AREA_TOP = 50;
const EDIT_AREA_WIDTH = 600;
const EDIT_AREA_HEIGHT = 300;

/** A clip's box in *canvas* space — where it lives on the timeline, scroll-independent. */
interface CanvasBox {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const CLIPS: CanvasBox[] = [
  { id: 'clip-near', left: 20, top: 10, width: 80, height: 40 },
  { id: 'clip-mid', left: 200, top: 10, width: 80, height: 40 },
  { id: 'clip-far', left: 700, top: 10, width: 80, height: 40 },
  { id: 'clip-lower-row', left: 200, top: 120, width: 80, height: 40 },
];

interface Harness {
  editArea: HTMLDivElement;
  scroll: (left: number, top?: number) => void;
}

/**
 * A scroll container whose children's viewport rects track `scrollLeft/scrollTop`
 * the way a real one's do — this is the only property the coordinate-space
 * assertions below depend on.
 */
function mountEditArea(): Harness {
  const editArea = document.createElement('div');
  editArea.className = 'timeline-canvas-edit-area';
  let scrollLeft = 0;
  let scrollTop = 0;

  Object.defineProperty(editArea, 'scrollLeft', {
    get: () => scrollLeft,
    set: (next: number) => { scrollLeft = next; },
    configurable: true,
  });
  Object.defineProperty(editArea, 'scrollTop', {
    get: () => scrollTop,
    set: (next: number) => { scrollTop = next; },
    configurable: true,
  });
  editArea.getBoundingClientRect = () => ({
    left: EDIT_AREA_LEFT,
    top: EDIT_AREA_TOP,
    right: EDIT_AREA_LEFT + EDIT_AREA_WIDTH,
    bottom: EDIT_AREA_TOP + EDIT_AREA_HEIGHT,
    width: EDIT_AREA_WIDTH,
    height: EDIT_AREA_HEIGHT,
    x: EDIT_AREA_LEFT,
    y: EDIT_AREA_TOP,
    toJSON: () => ({}),
  }) as DOMRect;

  for (const box of CLIPS) {
    const clip = document.createElement('div');
    clip.className = CLIP_ACTION_CLASS;
    clip.setAttribute(CLIP_ID_ATTR, box.id);
    clip.getBoundingClientRect = () => {
      const left = EDIT_AREA_LEFT + box.left - scrollLeft;
      const top = EDIT_AREA_TOP + box.top - scrollTop;
      return {
        left,
        top,
        right: left + box.width,
        bottom: top + box.height,
        width: box.width,
        height: box.height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };
    editArea.appendChild(clip);
  }

  document.body.appendChild(editArea);
  return {
    editArea,
    scroll: (left, top = scrollTop) => {
      scrollLeft = left;
      scrollTop = top;
    },
  };
}

/** Which clips a canvas-space rect covers — the answer the drawn rect promises. */
function clipsCoveredByCanvasRect(rect: MarqueeRect): string[] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return CLIPS
    .filter((box) => rect.x < box.left + box.width
      && right > box.left
      && rect.y < box.top + box.height
      && bottom > box.top)
    .map((box) => box.id);
}

function renderMarquee(editAreaRef: { current: HTMLElement | null }) {
  return renderHook(() => useMarqueeSelect({
    editAreaRef,
    deviceClass: 'desktop',
    interactionMode: 'select',
    gestureOwner: 'none',
    setGestureOwner: vi.fn(),
    setInputModalityFromPointerType: (): TimelineInputModality => 'mouse',
  }));
}

function pointerDownOn(
  target: HTMLElement,
  { clientX, clientY }: { clientX: number; clientY: number },
) {
  return {
    nativeEvent: { button: 0 } as PointerEvent,
    target,
    pointerId: 1,
    pointerType: 'mouse',
    clientX,
    clientY,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
  } as unknown as React.PointerEvent<HTMLElement>;
}

function dispatchPointer(type: 'pointermove' | 'pointerup', clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.assign(event, { pointerId: 1, clientX, clientY });
  act(() => {
    window.dispatchEvent(event);
  });
}

describe('useMarqueeSelect', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = mountEditArea();
    selectionMocks.userSelectTimelineItems.mockClear();
    selectionMocks.userClearAllSelection.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('selects the clips the marquee was dragged over', () => {
    const editAreaRef = { current: harness.editArea as HTMLElement | null };
    const { result } = renderMarquee(editAreaRef);

    // Canvas (10, 5) → viewport (110, 55). Drag to canvas (320, 80).
    act(() => {
      result.current.onPointerDown(pointerDownOn(harness.editArea, { clientX: 110, clientY: 55 }));
    });
    dispatchPointer('pointermove', 420, 130);
    dispatchPointer('pointerup', 420, 130);

    expect(selectionMocks.userSelectTimelineItems).toHaveBeenCalledTimes(1);
    const [selected, options] = selectionMocks.userSelectTimelineItems.mock.calls[0];
    expect(options).toEqual({ additive: false });
    expect([...selected.clipIds].sort()).toEqual(['clip-mid', 'clip-near']);
  });

  it('clears the selection on a click that never moved', () => {
    const editAreaRef = { current: harness.editArea as HTMLElement | null };
    const { result } = renderMarquee(editAreaRef);

    act(() => {
      result.current.onPointerDown(pointerDownOn(harness.editArea, { clientX: 110, clientY: 55 }));
    });
    const upEvent = new Event('pointerup', { bubbles: true, cancelable: true }) as PointerEvent;
    Object.assign(upEvent, { pointerId: 1, clientX: 110, clientY: 55 });
    Object.defineProperty(upEvent, 'target', { value: harness.editArea });
    act(() => {
      harness.editArea.dispatchEvent(upEvent);
    });

    expect(selectionMocks.userClearAllSelection).toHaveBeenCalledTimes(1);
    expect(selectionMocks.userSelectTimelineItems).not.toHaveBeenCalled();
  });

  it('keeps the drawn rect and the selected set in one coordinate space across autoscroll', () => {
    const editAreaRef = { current: harness.editArea as HTMLElement | null };
    const { result } = renderMarquee(editAreaRef);

    // Anchor at canvas (10, 5) with the canvas unscrolled.
    act(() => {
      result.current.onPointerDown(pointerDownOn(harness.editArea, { clientX: 110, clientY: 55 }));
    });
    dispatchPointer('pointermove', 400, 130);

    // Autoscroll: the container scrolls right under a stationary pointer, then
    // the scroller re-runs the selection at the same client coordinates.
    act(() => {
      harness.scroll(300);
    });
    dispatchPointer('pointermove', 400, 130);

    const drawnRect = result.current.marqueeRect;
    expect(drawnRect).not.toBeNull();

    dispatchPointer('pointerup', 400, 130);

    const [selected] = selectionMocks.userSelectTimelineItems.mock.calls[0];
    // The highlighted rectangle is the contract the user sees; the committed
    // selection must be exactly the clips that rectangle covers.
    expect([...selected.clipIds].sort()).toEqual(clipsCoveredByCanvasRect(drawnRect as MarqueeRect).sort());
  });

  it('grows the drawn rect by the scrolled distance during autoscroll', () => {
    const editAreaRef = { current: harness.editArea as HTMLElement | null };
    const { result } = renderMarquee(editAreaRef);

    act(() => {
      result.current.onPointerDown(pointerDownOn(harness.editArea, { clientX: 110, clientY: 55 }));
    });
    dispatchPointer('pointermove', 400, 130);
    const beforeScroll = result.current.marqueeRect as MarqueeRect;

    act(() => {
      harness.scroll(300);
    });
    dispatchPointer('pointermove', 400, 130);
    const afterScroll = result.current.marqueeRect as MarqueeRect;

    // The anchor is pinned to the canvas, so scrolling 300px right widens the
    // rect by 300px rather than sliding it.
    expect(afterScroll.x).toBe(beforeScroll.x);
    expect(afterScroll.width).toBe(beforeScroll.width + 300);
  });
});


describe('typed timeline selection clearing', () => {
  afterEach(() => { document.body.replaceChildren(); });
  it.each(['dataItem', 'dataLane'] as const)('clears %s inspector/context and hint on a genuine empty-canvas click', kind => {
    const { editArea } = mountEditArea();
    const { result } = renderHook(() => {
      const [target, setTarget] = useState<{ kind: string } | null>({ kind });
      const marquee = useMarqueeSelect({ editAreaRef: { current: editArea }, deviceClass: 'desktop', interactionMode: 'select',
        gestureOwner: 'none', setGestureOwner: vi.fn(), setInputModalityFromPointerType: () => 'mouse',
        onClearSelection: () => setTarget(null) });
      return { ...marquee, target, hasInspectableSelection: target !== null };
    });
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 55 })));
    const up = new Event('pointerup', { bubbles: true }); Object.assign(up, { pointerId: 1 });
    act(() => editArea.dispatchEvent(up));
    expect(result.current.target).toBeNull();
    expect(result.current.hasInspectableSelection).toBe(false);
  });
  it('does not clear a data row/item, control, additive click, portal release, or cancelled gesture', () => {
    const { editArea } = mountEditArea();
    const onClearSelection = vi.fn();
    const { result } = renderHook(() => useMarqueeSelect({ editAreaRef: { current: editArea }, deviceClass: 'desktop', interactionMode: 'select',
      gestureOwner: 'none', setGestureOwner: vi.fn(), setInputModalityFromPointerType: () => 'mouse', onClearSelection }));
    const lane = document.createElement('div'); lane.dataset.laneId = 'astrid.transcript'; editArea.append(lane);
    const item = document.createElement('button'); lane.append(item);
    const header = document.createElement('div'); header.dataset.laneHeader = 'true'; lane.append(header);
    for (const target of [header, item]) {
      act(() => result.current.onPointerDown(pointerDownOn(target, { clientX: 110, clientY: 55 })));
      const up = new Event('pointerup', { bubbles: true }); Object.assign(up, { pointerId: 1 });
      act(() => target.dispatchEvent(up));
    }
    act(() => result.current.onPointerDown({ ...pointerDownOn(editArea, { clientX: 110, clientY: 55 }), shiftKey: true }));
    const up = new Event('pointerup', { bubbles: true }); Object.assign(up, { pointerId: 1 });
    act(() => editArea.dispatchEvent(up));
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 55 })));
    dispatchPointer('pointerup', 110, 55); // window/portal target is outside edit area
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 55 })));
    dispatchPointer('pointercancel', 110, 55);
    expect(onClearSelection).not.toHaveBeenCalled();
  });
});

describe('mixed painted marquee geometry', () => {
  afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });
  function itemBox(area: HTMLElement, laneId: string, itemId: string, x: number, y = 110, width = 8) {
    let lane = [...area.querySelectorAll<HTMLElement>('[data-lane-id]')].find((el) => el.dataset.laneId === laneId);
    if (!lane) { lane = document.createElement('div'); lane.dataset.laneId = laneId; area.append(lane); }
    const button = document.createElement('button'); button.dataset.itemId = itemId;
    button.dataset.clipId = 'association-only-not-media';
    button.getBoundingClientRect = () => ({ left: EDIT_AREA_LEFT + x - area.scrollLeft, top: EDIT_AREA_TOP + y - area.scrollTop,
      width, height: 20, right: EDIT_AREA_LEFT + x - area.scrollLeft + width, bottom: EDIT_AREA_TOP + y - area.scrollTop + 20 }) as DOMRect;
    lane.append(button); return button;
  }
  it('selects media and two painted occurrence controls, excludes overflow/tooltips/zero bounds and association clip IDs', () => {
    const { editArea } = mountEditArea();
    itemBox(editArea, 'transcript', 'segment@clip1', 20);
    itemBox(editArea, 'transcript', 'segment@clip2', 70);
    itemBox(editArea, 'other', 'segment@clip1', 90);
    itemBox(editArea, 'transcript', 'zero', 60, 110, 0);
    const tooltip = document.createElement('div'); tooltip.setAttribute('role', 'tooltip'); editArea.append(tooltip);
    tooltip.append(itemBox(editArea, 'transcript', 'tooltip', 30));
    const overflow = document.createElement('button'); overflow.textContent = '+50'; editArea.querySelector('[data-lane-id]')!.append(overflow);
    const { result } = renderMarquee({ current: editArea });
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 55 })));
    dispatchPointer('pointermove', 420, 195); dispatchPointer('pointerup', 420, 195);
    const [selection] = selectionMocks.userSelectTimelineItems.mock.calls.at(-1)!;
    expect(selection.clipIds.sort()).toEqual(['clip-lower-row', 'clip-mid', 'clip-near']);
    expect(selection.dataItems).toEqual([{ laneId: 'transcript', itemId: 'segment@clip1' }, { laneId: 'transcript', itemId: 'segment@clip2' }, { laneId: 'other', itemId: 'segment@clip1' }]);
  });
  it('retains encountered geometry beyond128 controls during scroll, then re-intersects on reverse/shrink', async () => {
    const { publishMarqueePlane } = await import('@/tools/video-editor/lib/marquee-geometry');
    const { editArea, scroll } = mountEditArea();
    Object.defineProperty(editArea, 'clientWidth', { value: EDIT_AREA_WIDTH });
    Object.defineProperty(editArea, 'clientHeight', { value: EDIT_AREA_HEIGHT });
    const refs = Array.from({ length: 300 }, (_, i) => ({ laneId: 'transcript', itemId: `item-${i}` }));
    publishMarqueePlane(editArea, { layoutKey: 'stable', dataItems: refs });
    const windowAt = (start: number) => {
      editArea.querySelectorAll('[data-lane-id]').forEach(el => el.remove());
      for (let i = start; i < start + 128; i++) itemBox(editArea, 'transcript', `item-${i}`, 20 + i * 10);
    };
    windowAt(0);
    const { result } = renderMarquee({ current: editArea });
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 150 })));
    dispatchPointer('pointermove', 650, 195);
    scroll(1280); windowAt(128);
    dispatchPointer('pointermove', 700, 195);
    dispatchPointer('pointerup', 700, 195);
    const [expanded] = selectionMocks.userSelectTimelineItems.mock.calls.at(-1)!;
    expect(expanded.dataItems.length).toBeGreaterThan(128);
    expect(expanded.dataItems).toContainEqual(refs[0]);
    expect(expanded.dataItems).toContainEqual(refs[180]);
    // A second gesture traverses the same windows, reverses and shrinks. It
    // must not keep historical hits which no longer intersect the rectangle.
    scroll(0); windowAt(0);
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 150 })));
    dispatchPointer('pointermove', 650, 195);
    scroll(1280); windowAt(128); dispatchPointer('pointermove', 700, 195);
    scroll(0); windowAt(0); dispatchPointer('pointermove', 190, 195); dispatchPointer('pointerup', 190, 195);
    const [shrunk] = selectionMocks.userSelectTimelineItems.mock.calls.at(-1)!;
    expect(shrunk.dataItems).toEqual(refs.slice(0, 7));
  });
  it('retains progressive128-budget window churn across the sticky144px label gutter', async () => {
    const { publishMarqueePlane } = await import('@/tools/video-editor/lib/marquee-geometry');
    const { editArea, scroll } = mountEditArea();
    Object.defineProperty(editArea, 'clientWidth', { value: EDIT_AREA_WIDTH });
    Object.defineProperty(editArea, 'clientHeight', { value: EDIT_AREA_HEIGHT });
    const refs = Array.from({ length: 300 }, (_, i) => ({ laneId: 'transcript', itemId: `item-${i}` }));
    publishMarqueePlane(editArea, { layoutKey: 'stable', dataItems: refs });
    const windowAt = (start: number) => {
      editArea.querySelectorAll('[data-lane-id]').forEach(el => el.remove());
      for (let i = start; i < Math.min(300, start + 128); i++) itemBox(editArea, 'transcript', `item-${i}`, 144 + i * 10);
    };
    windowAt(0);
    const { result } = renderMarquee({ current: editArea });
    act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 244, clientY: 150 })));
    dispatchPointer('pointermove', 690, 195);
    // Real scroll advances gradually. A virtualized control can disappear
    // under the sticky label while its last rect still intersects the full
    // scroller viewport. That absence must not discard observed geometry.
    for (let index = 1; index <= 250; index++) {
      scroll(index * 10); windowAt(index); dispatchPointer('pointermove', 690, 195);
    }
    dispatchPointer('pointerup', 744, 195);
    const [selection] = selectionMocks.userSelectTimelineItems.mock.calls.at(-1)!;
    expect(selection.dataItems).toEqual(refs);
  });
  it('validates full occurrence identity and cancels layout/owner changes, pointer cancel and unmount', async () => {
    const { publishMarqueePlane } = await import('@/tools/video-editor/lib/marquee-geometry');
    const { editArea } = mountEditArea();
    itemBox(editArea, 'transcript', 'deleted', 20);
    itemBox(editArea, 'transcript', 'retained', 40);
    publishMarqueePlane(editArea, { layoutKey: 'v1', dataItems: [{ laneId: 'transcript', itemId: 'retained' }] });
    const { result, rerender, unmount } = renderHook(({ owner }) => useMarqueeSelect({ editAreaRef: { current: editArea }, selectionOwner: owner,
      deviceClass: 'desktop', interactionMode: 'select', gestureOwner: 'none', setGestureOwner: vi.fn(), setInputModalityFromPointerType: () => 'mouse' }), { initialProps: { owner: Symbol('one') } });
    const start = () => { act(() => result.current.onPointerDown(pointerDownOn(editArea, { clientX: 110, clientY: 150 }))); dispatchPointer('pointermove', 300, 195); };
    start(); dispatchPointer('pointerup', 300, 195);
    expect(selectionMocks.userSelectTimelineItems.mock.calls.at(-1)![0].dataItems).toEqual([{ laneId: 'transcript', itemId: 'retained' }]);
    selectionMocks.userSelectTimelineItems.mockClear();
    start(); publishMarqueePlane(editArea, { layoutKey: 'zoom-changed', dataItems: [] }); dispatchPointer('pointerup', 300, 195);
    expect(selectionMocks.userSelectTimelineItems).not.toHaveBeenCalled();
    start(); rerender({ owner: Symbol('two') }); dispatchPointer('pointerup', 300, 195);
    expect(selectionMocks.userSelectTimelineItems).not.toHaveBeenCalled();
    start(); dispatchPointer('pointercancel', 300, 195); dispatchPointer('pointerup', 300, 195);
    expect(selectionMocks.userSelectTimelineItems).not.toHaveBeenCalled();
    start(); unmount(); dispatchPointer('pointerup', 300, 195);
    expect(selectionMocks.userSelectTimelineItems).not.toHaveBeenCalled();
    expect(document.body.style.userSelect).toBe('');
  });
});
