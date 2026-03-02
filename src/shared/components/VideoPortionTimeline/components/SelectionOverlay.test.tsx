import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SelectionOverlay } from './SelectionOverlay';
import type { DragOffset, HandleDragState, PortionSelection } from '../types';

const frameThumbnailSpy = vi.fn();

vi.mock('./FrameThumbnail', () => ({
  FrameThumbnail: (props: { videoUrl: string; time: number }) => {
    frameThumbnailSpy(props);
    return <div data-testid={`thumb-${props.time}`}>thumb</div>;
  },
}));

function createTrackRef(width = 100): React.RefObject<HTMLDivElement | null> {
  const track = document.createElement('div');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width,
    top: 0,
    right: width,
    bottom: 10,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return { current: track };
}

function renderOverlay({
  selection = { id: 'sel-1', start: 1, end: 4 },
  dragging = null,
  selectedHandle = null,
  dragOffsetRef,
  trackRef = createTrackRef(),
  fps = 30,
}: {
  selection?: PortionSelection;
  dragging?: HandleDragState | null;
  selectedHandle?: HandleDragState | null;
  dragOffsetRef?: React.RefObject<DragOffset | null>;
  trackRef?: React.RefObject<HTMLDivElement | null>;
  fps?: number | null;
} = {}) {
  const onStartDrag = vi.fn();
  const onHandleTap = vi.fn();
  const onSelectionClick = vi.fn();

  const rendered = render(
    <SelectionOverlay
      selection={selection}
      index={1}
      isActive={true}
      videoUrl="https://cdn.example.com/video.mp4"
      fps={fps}
      duration={10}
      dragging={dragging}
      selectedHandle={selectedHandle}
      dragOffsetRef={dragOffsetRef ?? ({ current: null } as React.RefObject<DragOffset | null>)}
      trackRef={trackRef}
      onStartDrag={onStartDrag}
      onHandleTap={onHandleTap}
      onSelectionClick={onSelectionClick}
    />,
  );

  return {
    ...rendered,
    onStartDrag,
    onHandleTap,
    onSelectionClick,
  };
}

describe('SelectionOverlay', () => {
  beforeEach(() => {
    frameThumbnailSpy.mockClear();
  });

  it('renders frame thumbnails and routes selection/handle interactions', () => {
    const { container, getByText, onStartDrag, onHandleTap, onSelectionClick } = renderOverlay();

    expect(frameThumbnailSpy).toHaveBeenNthCalledWith(1, { videoUrl: 'https://cdn.example.com/video.mp4', time: 1 });
    expect(frameThumbnailSpy).toHaveBeenNthCalledWith(2, { videoUrl: 'https://cdn.example.com/video.mp4', time: 4 });
    expect(getByText('f30')).toBeInTheDocument();
    expect(getByText('f120')).toBeInTheDocument();

    const highlight = container.querySelector('div.cursor-pointer');
    expect(highlight).toBeTruthy();
    fireEvent.click(highlight!);
    expect(onSelectionClick).toHaveBeenCalledWith('sel-1');

    const startHandle = container.querySelector('[data-handle="start"]');
    const endHandle = container.querySelector('[data-handle="end"]');
    expect(startHandle).toBeTruthy();
    expect(endHandle).toBeTruthy();

    fireEvent.mouseDown(startHandle!);
    expect(onStartDrag).toHaveBeenCalledWith(expect.any(Object), 'sel-1', 'start');

    fireEvent.click(endHandle!);
    expect(onHandleTap).toHaveBeenCalledWith(expect.any(Object), 'sel-1', 'end');

    fireEvent.touchStart(startHandle!);
    expect(onHandleTap).toHaveBeenCalledWith(expect.any(Object), 'sel-1', 'start');
  });

  it('applies drag offset feedback and selected-handle styling', () => {
    const dragOffsetRef = {
      current: { id: 'sel-1', handle: 'start', offsetPx: 200 },
    } as React.RefObject<DragOffset | null>;

    const { container } = renderOverlay({
      selection: { id: 'sel-1', start: 1, end: 2 },
      selectedHandle: { id: 'sel-1', handle: 'start' },
      dragging: { id: 'sel-1', handle: 'start' },
      dragOffsetRef,
    });

    const highlight = container.querySelector('div.cursor-pointer') as HTMLDivElement;
    const startHandle = container.querySelector('[data-handle="start"]') as HTMLDivElement;

    expect(highlight.style.left).toBe('19.9%');
    expect(startHandle.style.left).toBe('19.9%');
    expect(startHandle.style.transform).toContain('200px');
    expect(startHandle.className).toContain('ring-2');
  });
});
