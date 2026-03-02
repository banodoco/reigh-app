import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineTrack } from './TimelineTrack';

describe('TimelineTrack', () => {
  function renderTrack(overrides?: Partial<React.ComponentProps<typeof TimelineTrack>>) {
    const timelineRef = React.createRef<HTMLDivElement>();
    const containerRef = React.createRef<HTMLDivElement>();
    const props: React.ComponentProps<typeof TimelineTrack> = {
      timelineRef,
      containerRef,
      zoomLevel: 1,
      isFileOver: false,
      hasNoImages: false,
      enableTapToMove: false,
      selectedCount: 0,
      onDragEnter: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onContainerDoubleClick: vi.fn(),
      onContainerClick: vi.fn(),
      containerWidth: 400,
      children: <div>timeline children</div>,
      ...overrides,
    };
    const utils = render(<TimelineTrack {...props} />);
    return { ...utils, props, timelineRef, containerRef };
  }

  it('forwards drag/drop events and passes containerRef to handlers', () => {
    const { container, props } = renderTrack();
    const root = container.querySelector('.timeline-scroll') as HTMLDivElement;

    fireEvent.dragEnter(root);
    fireEvent.dragOver(root);
    fireEvent.dragLeave(root);
    fireEvent.drop(root);

    expect(props.onDragEnter).toHaveBeenCalledTimes(1);
    expect(props.onDragOver).toHaveBeenCalledTimes(1);
    expect(props.onDragOver).toHaveBeenCalledWith(expect.any(Object), props.containerRef);
    expect(props.onDragLeave).toHaveBeenCalledTimes(1);
    expect(props.onDrop).toHaveBeenCalledTimes(1);
    expect(props.onDrop).toHaveBeenCalledWith(expect.any(Object), props.containerRef);
  });

  it('handles double-click only on empty track area and supports click forwarding', () => {
    const { container, props } = renderTrack({
      children: <button type="button">child button</button>,
    });
    const inner = container.querySelector('#timeline-container') as HTMLDivElement;

    fireEvent.doubleClick(inner);
    expect(props.onContainerDoubleClick).toHaveBeenCalledTimes(1);
    expect(props.onContainerDoubleClick).toHaveBeenCalledWith(expect.any(Object), props.containerRef);

    fireEvent.click(inner);
    expect(props.onContainerClick).toHaveBeenCalledTimes(1);

    props.onContainerDoubleClick.mockClear();
    const childButton = container.querySelector('button') as HTMLButtonElement;
    fireEvent.doubleClick(childButton);
    expect(props.onContainerDoubleClick).not.toHaveBeenCalled();
  });

  it('updates cursor style when tap-to-move is enabled with a selection', () => {
    const { container } = renderTrack({
      enableTapToMove: true,
      selectedCount: 2,
      zoomLevel: 2,
      isFileOver: true,
    });
    const inner = container.querySelector('#timeline-container') as HTMLDivElement;
    const root = container.querySelector('.timeline-scroll') as HTMLDivElement;

    expect(inner.style.cursor).toBe('crosshair');
    expect(root.className).toContain('ring-2');
    expect(root.className).not.toContain('no-scrollbar');
  });
});
