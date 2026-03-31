import React from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { PairRegion } from '../../PairRegion';
import { TIMELINE_PADDING_OFFSET } from '../../constants';
import { sortPositionEntries } from '../../utils/timeline-utils';

interface TimelinePairInfo {
  index: number;
  startId: string;
  endId: string;
  startFrame: number;
  endFrame: number;
  frames: number;
  generationStart: number;
  contextStart: number;
  contextEnd: number;
}

interface PairRegionsLayerProps {
  images: GenerationRow[];
  imagePositionsWithPending: Map<string, number>;
  pairInfoWithPending: TimelinePairInfo[];
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  showPairLabels: boolean;
  dragState: {
    isDragging: boolean;
  };
  onPairClick?: (pairIndex: number) => void;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  readOnly: boolean;
  enableTapToMove: boolean;
  selectedIdsCount: number;
  isFileOver: boolean;
  dropTargetFrame: number | null;
  currentDragFrame: number | null;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
}

function getEnhancedPromptFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const value = (metadata as { enhanced_prompt?: unknown }).enhanced_prompt;
  return typeof value === 'string' ? value : '';
}

export const PairRegionsLayer: React.FC<PairRegionsLayerProps> = ({
  images,
  imagePositionsWithPending,
  pairInfoWithPending,
  pairPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  showPairLabels,
  dragState,
  onPairClick,
  onClearEnhancedPrompt,
  readOnly,
  enableTapToMove,
  selectedIdsCount,
  isFileOver,
  dropTargetFrame,
  currentDragFrame,
  fullMin,
  fullRange,
  containerWidth,
}) => {
  const sortedDynamicPositions = sortPositionEntries(imagePositionsWithPending);

  return (
    <>
      {pairInfoWithPending.map((pair, index) => {
        const startEntry = sortedDynamicPositions[index];
        const endEntry = sortedDynamicPositions[index + 1];

        const getPixel = (entry: [string, number] | undefined): number => {
          if (!entry) {
            return 0;
          }
          const [, framePos] = entry;
          const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
          return TIMELINE_PADDING_OFFSET + ((framePos - fullMin) / fullRange) * effectiveWidth;
        };

        const startPixel = getPixel(startEntry);
        const endPixel = getPixel(endEntry);
        const actualStartFrame = startEntry?.[1] ?? pair.startFrame;
        const actualEndFrame = endEntry?.[1] ?? pair.endFrame;
        const actualFrames = actualEndFrame - actualStartFrame;

        const startPercent = (startPixel / containerWidth) * 100;
        const endPercent = (endPixel / containerWidth) * 100;

        const contextStartFrameUnclipped = actualEndFrame;
        const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
        const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);

        const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
        const contextStartPixel = TIMELINE_PADDING_OFFSET + ((contextStartFrame - fullMin) / fullRange) * effectiveWidth;
        const contextStartPercent = (contextStartPixel / containerWidth) * 100;

        const generationStartPixel = TIMELINE_PADDING_OFFSET + ((pair.generationStart - fullMin) / fullRange) * effectiveWidth;
        const generationStartPercent = (generationStartPixel / containerWidth) * 100;

        const startImage = images.find((img) => img.id === startEntry?.[0]);
        const pairPromptData = pairPrompts?.[index];
        const pairPromptFromMetadata = pairPromptData?.prompt || '';
        const pairNegativePromptFromMetadata = pairPromptData?.negativePrompt || '';
        const actualEnhancedPrompt = getEnhancedPromptFromMetadata(startImage?.metadata);

        return (
          <PairRegion
            key={`pair-${index}`}
            index={index}
            startPercent={startPercent}
            endPercent={endPercent}
            contextStartPercent={contextStartPercent}
            generationStartPercent={generationStartPercent}
            actualFrames={actualFrames}
            visibleContextFrames={visibleContextFrames}
            isDragging={dragState.isDragging}
            numPairs={Math.max(0, images.length - 1)}
            startFrame={pair.startFrame}
            endFrame={pair.endFrame}
            onPairClick={onPairClick}
            pairPrompt={pairPromptFromMetadata}
            pairNegativePrompt={pairNegativePromptFromMetadata}
            enhancedPrompt={actualEnhancedPrompt}
            defaultPrompt={defaultPrompt}
            defaultNegativePrompt={defaultNegativePrompt}
            showLabel={showPairLabels}
            hidePairLabel={
              (enableTapToMove && selectedIdsCount > 0)
              || (isFileOver
                && dropTargetFrame !== null
                && dropTargetFrame > actualStartFrame
                && dropTargetFrame < actualEndFrame)
              || (dragState.isDragging
                && currentDragFrame !== null
                && currentDragFrame > actualStartFrame
                && currentDragFrame < actualEndFrame)
            }
            onClearEnhancedPrompt={onClearEnhancedPrompt}
            readOnly={readOnly}
          />
        );
      })}
    </>
  );
};
