// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrushStroke } from '@/domains/media-lightbox/hooks/inpainting/types';
import { useStrokeOverlayDrawing } from './useStrokeOverlayDrawing';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('../../hooks/inpainting/shapeHelpers', () => ({
  isPointOnShape: vi.fn(() => false),
  getClickedCornerIndex: vi.fn(() => null),
  getRectangleClickType: vi.fn(() => 'middle'),
  getRectangleCorners: vi.fn(() => []),
}));

function createStageEvent(
  getPointerPosition: () => { x: number; y: number } | null,
  options: { pointerId?: number; clientX?: number; clientY?: number } = {},
) {
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const stage = {
    getPointerPosition,
    container: () => ({
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    }),
    content: {
      setPointerCapture,
      releasePointerCapture,
    },
  };

  return {
    event: {
      target: { getStage: () => stage },
      evt: {
        pointerId: options.pointerId ?? 7,
        clientX: options.clientX ?? 0,
        clientY: options.clientY ?? 0,
      },
    } as never,
    setPointerCapture,
    releasePointerCapture,
  };
}

function createBaseProps(overrides: Partial<Parameters<typeof useStrokeOverlayDrawing>[0]> = {}) {
  return {
    imageWidth: 100,
    imageHeight: 100,
    displayWidth: 100,
    displayHeight: 100,
    strokes: [] as BrushStroke[],
    isEraseMode: false,
    brushSize: 6,
    annotationMode: null as 'rectangle' | null,
    isInpaintMode: true,
    isAnnotateMode: false,
    editMode: 'inpaint' as const,
    onStrokeComplete: vi.fn(),
    onStrokesChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onTextModeHint: vi.fn(),
    ...overrides,
  };
}

describe('useStrokeOverlayDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
  });

  it('draws a line stroke from pointer down/move/up', () => {
    const props = createBaseProps();
    const pointer = { x: 10, y: 10 };
    const down = createStageEvent(() => pointer);
    const move = createStageEvent(() => pointer);
    const up = createStageEvent(() => pointer);

    const { result } = renderHook(() => useStrokeOverlayDrawing(props));

    act(() => {
      result.current.handlePointerDown(down.event);
    });
    act(() => {
      pointer.x = 20;
      pointer.y = 20;
      result.current.handlePointerMove(move.event);
    });
    act(() => {
      result.current.handlePointerUp(up.event);
    });

    expect(down.setPointerCapture).toHaveBeenCalledWith(7);
    expect(up.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(props.onStrokeComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'uuid-1',
        shapeType: 'line',
        isErasing: false,
        brushSize: 6,
        points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
      }),
    );
  });

  it('ignores tiny rectangle drags in annotate mode', () => {
    const props = createBaseProps({
      isAnnotateMode: true,
      annotationMode: 'rectangle',
      editMode: 'annotate',
    });
    const pointer = { x: 5, y: 5 };
    const down = createStageEvent(() => pointer);
    const move = createStageEvent(() => pointer);
    const up = createStageEvent(() => pointer);

    const { result } = renderHook(() => useStrokeOverlayDrawing(props));

    act(() => {
      result.current.handlePointerDown(down.event);
    });
    act(() => {
      pointer.x = 8;
      pointer.y = 8;
      result.current.handlePointerMove(move.event);
    });
    act(() => {
      result.current.handlePointerUp(up.event);
    });

    expect(props.onStrokeComplete).not.toHaveBeenCalled();
    expect(result.current.currentStroke).toEqual([]);
  });

  it('shows text-mode hint and avoids drawing when edit mode is text', () => {
    const props = createBaseProps({
      editMode: 'text',
    });
    const pointer = { x: 15, y: 15 };
    const down = createStageEvent(() => pointer);
    const move = createStageEvent(() => pointer);
    const up = createStageEvent(() => pointer);

    const { result } = renderHook(() => useStrokeOverlayDrawing(props));

    act(() => {
      result.current.handlePointerDown(down.event);
      result.current.handlePointerMove(move.event);
      result.current.handlePointerUp(up.event);
    });

    expect(props.onTextModeHint).toHaveBeenCalledTimes(1);
    expect(props.onStrokeComplete).not.toHaveBeenCalled();
  });

  it('deletes selected shapes on Delete key in annotate mode', () => {
    const props = createBaseProps({
      isAnnotateMode: true,
      annotationMode: 'rectangle',
      editMode: 'annotate',
      strokes: [
        {
          id: 'shape-1',
          points: [{ x: 1, y: 1 }, { x: 4, y: 4 }],
          isErasing: false,
          brushSize: 2,
          shapeType: 'rectangle',
        },
      ],
    });

    const { result } = renderHook(() => useStrokeOverlayDrawing(props));

    act(() => {
      result.current.updateSelection('shape-1');
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });

    expect(props.onStrokesChange).toHaveBeenCalledWith([]);
    expect(props.onSelectionChange).toHaveBeenLastCalledWith(null);
  });
});
