import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineItemsLayer } from './TimelineItemsLayer';

const captures = vi.hoisted(() => ({
  itemProps: [] as unknown[],
  getGenerationId: vi.fn(),
}));

vi.mock('../../TimelineItem', () => ({
  TimelineItem: (props: unknown) => {
    captures.itemProps.push(props);
    return <div data-testid="timeline-item" />;
  },
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => captures.getGenerationId(...args),
}));

describe('TimelineItemsLayer', () => {
  beforeEach(() => {
    captures.itemProps = [];
    captures.getGenerationId.mockReset();
  });

  function buildProps(overrides: Partial<React.ComponentProps<typeof TimelineItemsLayer>> = {}) {
    return {
      images: [
        { id: 'img-1', timeline_frame: 0, generation_id: 'gen-1' },
        { id: 'img-2', timeline_frame: null, generation_id: 'gen-2' },
      ] as never[],
      currentPositions: new Map([['img-1', 61]]),
      framePositions: new Map([['img-1', 0]]),
      drag: {
        isDragging: true,
        activeId: 'img-1',
        dragOffset: { x: 3, y: 4 },
        currentDragFrame: 70,
        swapTargetId: 'img-1',
      },
      layout: {
        containerWidth: 300,
        fullMin: 0,
        fullRange: 120,
      },
      interaction: {
        readOnly: false,
        isMobile: false,
        isTablet: false,
        containerRef: { current: null } as React.RefObject<HTMLDivElement>,
        handleMouseDown: vi.fn(),
        handleDesktopDoubleClick: vi.fn(),
        handleMobileTap: vi.fn(),
        prefetchTaskData: vi.fn(),
      },
      actions: {
        onImageDelete: vi.fn(),
        onImageDuplicate: vi.fn(),
        onInpaintClick: vi.fn(),
        duplicatingImageId: 'img-1',
        duplicateSuccessImageId: null,
      },
      selection: {
        isSelected: vi.fn().mockReturnValue(true),
        toggleSelection: vi.fn(),
        selectedCount: 1,
      },
      presentation: {
        projectAspectRatio: '16:9',
      },
      ...overrides,
    } satisfies React.ComponentProps<typeof TimelineItemsLayer>;
  }

  it('maps desktop interactions and prefetch behavior into each visible timeline item', () => {
    const props = buildProps();
    captures.getGenerationId.mockReturnValue('prefetch-gen');

    render(<TimelineItemsLayer {...props} />);

    expect(captures.itemProps).toHaveLength(1);
    expect(captures.itemProps[0]).toMatchObject({
      framePosition: 61,
      interaction: expect.objectContaining({
        isDragging: true,
        isSwapTarget: true,
        currentDragFrame: 70,
        originalFramePos: 0,
      }),
      selection: expect.objectContaining({
        isSelected: true,
        selectedCount: 1,
      }),
      presentation: {
        projectAspectRatio: '16:9',
        readOnly: false,
      },
    });

    const interaction = (captures.itemProps[0] as {
      interaction: {
        onPrefetch: () => void;
        onDoubleClick: () => void;
        onMouseDown: (event: React.MouseEvent) => void;
      };
    }).interaction;
    interaction.onPrefetch();
    interaction.onDoubleClick();
    interaction.onMouseDown({} as React.MouseEvent);

    expect(props.interaction.prefetchTaskData).toHaveBeenCalledWith('prefetch-gen');
    expect(props.interaction.handleDesktopDoubleClick).toHaveBeenCalledWith(0);
    expect(props.interaction.handleMouseDown).toHaveBeenCalledWith(
      expect.anything(),
      'img-1',
      props.interaction.containerRef,
    );
  });

  it('disables desktop hooks for mobile read-only usage and exposes mobile taps instead', () => {
    const props = buildProps({
      interaction: {
        ...buildProps().interaction,
        readOnly: true,
        isMobile: true,
      },
    });

    render(<TimelineItemsLayer {...props} />);

    const item = captures.itemProps[0] as {
      interaction: Record<string, unknown>;
      selection: Record<string, unknown>;
    };

    expect(item.interaction.onMouseDown).toBeUndefined();
    expect(item.interaction.onDoubleClick).toBeUndefined();
    expect(item.interaction.onMobileTap).toEqual(expect.any(Function));
    expect(item.interaction.onPrefetch).toBeUndefined();
    expect(item.selection.onSelectionClick).toBeUndefined();
  });
});
