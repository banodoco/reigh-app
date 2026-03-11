import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrailingEndpointLayer } from './TrailingEndpointLayer';

const captures = vi.hoisted(() => ({
  trailingProps: null as unknown,
}));

vi.mock('../../TrailingEndpoint', () => ({
  TrailingEndpoint: (props: {
    onDurationClick?: () => void;
    onExtractFinalFrame?: () => Promise<void>;
  }) => {
    captures.trailingProps = props;
    return (
      <div data-testid="trailing-endpoint">
        <button type="button" onClick={() => props.onDurationClick?.()}>
          duration-click
        </button>
        <button type="button" onClick={() => props.onExtractFinalFrame?.()}>
          extract-final-frame
        </button>
      </div>
    );
  },
}));

describe('TrailingEndpointLayer', () => {
  beforeEach(() => {
    captures.trailingProps = null;
  });

  function buildProps(overrides: Partial<React.ComponentProps<typeof TrailingEndpointLayer>> = {}) {
    return {
      imagePositions: new Map([
        ['img-1', 0],
        ['img-2', 61],
      ]),
      images: [
        { id: 'img-1', imageUrl: 'image-1.png', thumbUrl: 'thumb-1.png', generation_id: 'gen-1' },
        { id: 'img-2', imageUrl: 'image-2.png', thumbUrl: 'thumb-2.png', generation_id: 'gen-2' },
      ] as never[],
      trailingEndFrame: undefined,
      hasCallbackTrailingVideo: false,
      hasLiveTrailingVideo: true,
      isEndpointDragging: false,
      endpointDragFrame: null,
      containerWidth: 300,
      fullMin: 0,
      fullRange: 120,
      maxAllowedGap: 81,
      readOnly: false,
      onEndpointMouseDown: vi.fn(),
      onPairClick: vi.fn(),
      trailingVideoUrl: 'trailing.mp4',
      onExtractFinalFrame: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } satisfies React.ComponentProps<typeof TrailingEndpointLayer>;
  }

  it('returns null when there is no trailing segment or live trailing media to show', () => {
    const { container } = render(
      <TrailingEndpointLayer
        {...buildProps({
          hasLiveTrailingVideo: false,
          trailingEndFrame: undefined,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the trailing endpoint and enriches duration clicks with last-image data', async () => {
    const onPairClick = vi.fn();
    const onExtractFinalFrame = vi.fn().mockResolvedValue(undefined);

    render(
      <TrailingEndpointLayer
        {...buildProps({
          onPairClick,
          onExtractFinalFrame,
        })}
      />,
    );

    expect(screen.getByTestId('trailing-endpoint')).toBeInTheDocument();
    expect(captures.trailingProps).toMatchObject({
      framePosition: 78,
      imageFramePosition: 61,
      gapToImage: 17,
      compact: true,
      hasTrailingVideo: true,
      onExtractFinalFrame: expect.any(Function),
    });

    fireEvent.click(screen.getByRole('button', { name: 'duration-click' }));
    fireEvent.click(screen.getByRole('button', { name: 'extract-final-frame' }));

    expect(onPairClick).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        index: 1,
        frames: 17,
        startFrame: 61,
        endFrame: 78,
        startImage: expect.objectContaining({
          id: 'img-2',
          generationId: 'gen-2',
          url: 'image-2.png',
          thumbUrl: 'thumb-2.png',
          position: 2,
        }),
        endImage: null,
      }),
    );
    expect(onExtractFinalFrame).toHaveBeenCalledTimes(1);
  });
});
