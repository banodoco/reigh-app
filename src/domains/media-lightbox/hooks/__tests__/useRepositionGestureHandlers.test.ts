import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRepositionGestureHandlers } from '../useRepositionGestureHandlers';

function createImageRef() {
  const image = document.createElement('img');
  Object.defineProperty(image, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return { current: image } as React.RefObject<HTMLImageElement>;
}

function createWrapperRef() {
  return { current: document.createElement('div') } as React.RefObject<HTMLDivElement>;
}

describe('useRepositionGestureHandlers', () => {
  it('handles corner rotation drag lifecycle and normalizes rotation range', () => {
    const onRepositionRotationChange = vi.fn();
    const imageRef = createImageRef();
    const imageWrapperRef = createWrapperRef();

    const { result } = renderHook(() =>
      useRepositionGestureHandlers({
        isInpaintMode: true,
        editMode: 'reposition',
        repositionDragHandlers: undefined,
        onRepositionScaleChange: undefined,
        onRepositionRotationChange,
        repositionScale: 1,
        repositionRotation: 170,
        imageRef,
        imageWrapperRef,
      }),
    );

    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const target = {
      setPointerCapture,
      releasePointerCapture,
    } as unknown as HTMLElement;

    act(() => {
      result.current.handleCornerRotateStart({
        pointerId: 7,
        clientX: 100,
        clientY: 50,
        target,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent);
    });

    act(() => {
      result.current.handleCornerRotateMove({
        clientX: 0,
        clientY: 50,
      } as unknown as React.PointerEvent);
    });

    expect(onRepositionRotationChange).toHaveBeenCalledWith(-10);
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    act(() => {
      result.current.handleCornerRotateEnd({
        pointerId: 7,
        target,
      } as unknown as React.PointerEvent);
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('attaches and detaches wheel handler on drag container in reposition mode', () => {
    const onWheel = vi.fn();
    const imageRef = createImageRef();
    const imageWrapperRef = createWrapperRef();

    const { result, rerender } = renderHook(
      (props: { isInpaintMode: boolean; editMode: string }) =>
        useRepositionGestureHandlers({
          isInpaintMode: props.isInpaintMode,
          editMode: props.editMode,
          repositionDragHandlers: { onWheel },
          onRepositionScaleChange: undefined,
          onRepositionRotationChange: undefined,
          repositionScale: 1,
          repositionRotation: 0,
          imageRef,
          imageWrapperRef,
        }),
      {
        initialProps: { isInpaintMode: false, editMode: 'reposition' },
      },
    );

    const dragContainer = document.createElement('div');
    act(() => {
      result.current.dragContainerRef.current = dragContainer;
    });

    rerender({ isInpaintMode: true, editMode: 'reposition' });
    const firstEvent = new WheelEvent('wheel', { deltaY: 1, cancelable: true });
    dragContainer.dispatchEvent(firstEvent);
    expect(onWheel).toHaveBeenCalledTimes(1);
    expect(firstEvent.defaultPrevented).toBe(true);

    rerender({ isInpaintMode: true, editMode: 'pan' });
    const secondEvent = new WheelEvent('wheel', { deltaY: 1, cancelable: true });
    dragContainer.dispatchEvent(secondEvent);
    expect(onWheel).toHaveBeenCalledTimes(1);
  });
});
