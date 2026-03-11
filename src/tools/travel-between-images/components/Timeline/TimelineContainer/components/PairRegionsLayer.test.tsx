// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PairRegionsLayer } from './PairRegionsLayer';

const captures = vi.hoisted(() => ({
  pairRegionProps: [] as unknown[],
}));

vi.mock('../../PairRegion', () => ({
  PairRegion: (props: {
    index: number;
    pairPrompt: string;
    pairNegativePrompt: string;
    enhancedPrompt: string;
    hidePairLabel: boolean;
    onPairClick?: (pairIndex: number, pairData: Record<string, unknown>) => void;
  }) => {
    captures.pairRegionProps.push(props);
    return (
      <button
        type="button"
        onClick={() => props.onPairClick?.(props.index, { source: 'pair-region' })}
      >
        pair-region-{props.index}
      </button>
    );
  },
}));

describe('PairRegionsLayer', () => {
  beforeEach(() => {
    captures.pairRegionProps = [];
  });

  it('passes prompt metadata through and enriches pair-click callbacks with start/end image data', () => {
    const onPairClick = vi.fn();

    render(
      <PairRegionsLayer
        images={[
          {
            id: 'img-1',
            generation_id: 'gen-1',
            primary_variant_id: 'variant-1',
            imageUrl: 'image-1.png',
            thumbUrl: 'thumb-1.png',
            metadata: { enhanced_prompt: 'enhanced prompt' },
          },
          {
            id: 'img-2',
            generation_id: 'gen-2',
            primary_variant_id: 'variant-2',
            imageUrl: 'image-2.png',
            thumbUrl: 'thumb-2.png',
            metadata: null,
          },
        ] as never}
        imagePositionsWithPending={new Map([
          ['img-1', 0],
          ['img-2', 61],
        ])}
        pairInfoWithPending={[
          {
            index: 0,
            startId: 'img-1',
            endId: 'img-2',
            startFrame: 0,
            endFrame: 61,
            frames: 61,
            generationStart: 51,
            contextStart: 61,
            contextEnd: 71,
          },
        ]}
        pairPrompts={{ 0: { prompt: 'pair prompt', negativePrompt: 'pair negative' } }}
        defaultPrompt="default prompt"
        defaultNegativePrompt="default negative"
        showPairLabels
        dragState={{ isDragging: false }}
        onPairClick={onPairClick}
        onClearEnhancedPrompt={vi.fn()}
        readOnly={false}
        enableTapToMove={false}
        selectedIdsCount={0}
        isFileOver={false}
        dropTargetFrame={null}
        currentDragFrame={null}
        fullMin={0}
        fullRange={61}
        containerWidth={200}
      />,
    );

    expect(captures.pairRegionProps[0]).toMatchObject({
      pairPrompt: 'pair prompt',
      pairNegativePrompt: 'pair negative',
      enhancedPrompt: 'enhanced prompt',
      hidePairLabel: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'pair-region-0' }));

    expect(onPairClick).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        source: 'pair-region',
        startImage: expect.objectContaining({
          id: 'img-1',
          generationId: 'gen-1',
          primaryVariantId: 'variant-1',
          url: 'image-1.png',
          thumbUrl: 'thumb-1.png',
          position: 1,
        }),
        endImage: expect.objectContaining({
          id: 'img-2',
          generationId: 'gen-2',
          primaryVariantId: 'variant-2',
          url: 'image-2.png',
          thumbUrl: 'thumb-2.png',
          position: 2,
        }),
      }),
    );
  });

  it('hides pair labels while tap-to-move selection is active inside the layer', () => {
    render(
      <PairRegionsLayer
        images={[
          {
            id: 'img-1',
            generation_id: 'gen-1',
            primary_variant_id: 'variant-1',
            imageUrl: 'image-1.png',
            thumbUrl: 'thumb-1.png',
            metadata: null,
          },
          {
            id: 'img-2',
            generation_id: 'gen-2',
            primary_variant_id: 'variant-2',
            imageUrl: 'image-2.png',
            thumbUrl: 'thumb-2.png',
            metadata: null,
          },
        ] as never}
        imagePositionsWithPending={new Map([
          ['img-1', 0],
          ['img-2', 61],
        ])}
        pairInfoWithPending={[
          {
            index: 0,
            startId: 'img-1',
            endId: 'img-2',
            startFrame: 0,
            endFrame: 61,
            frames: 61,
            generationStart: 51,
            contextStart: 61,
            contextEnd: 71,
          },
        ]}
        showPairLabels
        dragState={{ isDragging: false }}
        readOnly={false}
        enableTapToMove
        selectedIdsCount={2}
        isFileOver={false}
        dropTargetFrame={null}
        currentDragFrame={null}
        fullMin={0}
        fullRange={61}
        containerWidth={200}
      />,
    );

    expect(captures.pairRegionProps[0]).toMatchObject({
      hidePairLabel: true,
    });
  });
});
