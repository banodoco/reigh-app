import React, { useCallback, useMemo } from 'react';
import { GenerationRow, PairLoraConfig, PairMotionSettings } from '@/domains/generation/types';
import { ShotBatchItemDesktop } from '../ShotBatchItemDesktop';
import type { ShotSegmentProps } from '../types';
import { cn } from '@/shared/components/ui/contracts/cn';
import { DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';
import { AddImagesCard } from './AddImagesCard';
import { PairPromptIndicator } from './PairPromptIndicator';
import { InlineSegmentVideo } from '@/shared/components/InlineSegmentVideo';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { UseVideoScrubbingReturn } from '@/shared/hooks/useVideoScrubbing';
import { TrailingDurationIndicator } from './TrailingDurationIndicator';
import { Loader2 } from 'lucide-react';
import { usePrefetchTaskData } from '@/shared/hooks/tasks/useTaskPrefetch';
import { useSourceImageChanges } from '@/shared/hooks/sourceImageChanges/useSourceImageChanges';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { resolveDuplicateFrame } from '../utils/image-utils';

const FPS = 16;

interface ImageGridLayoutModel {
  gridColsClass: string;
  /** Number of columns in the grid (for row boundary calculations) */
  columns?: number;
  isMobile: boolean;
  readOnly?: boolean;
  projectAspectRatio?: string;
  batchVideoFrames?: number;
  activeDragId?: string | null;
  dropTargetIndex?: number | null;
  activeScrubbingIndex?: number | null;
}

interface ImageGridContentModel {
  images: GenerationRow[];
  selectedIds: string[];
  segmentSlots?: ShotSegmentProps['segmentSlots'];
  hasPendingTask?: ShotSegmentProps['hasPendingTask'];
  deletingSegmentId?: ShotSegmentProps['deletingSegmentId'];
  scrubbing?: UseVideoScrubbingReturn;
}

interface ImageGridInteractionModel {
  onItemClick: (imageKey: string, event: React.MouseEvent) => void;
  onItemDoubleClick: (idx: number) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (shotImageEntryId: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;
  onGridDoubleClick?: () => void;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  onSegmentClick?: ShotSegmentProps['onSegmentClick'];
  onSegmentDelete?: ShotSegmentProps['onSegmentDelete'];
  onScrubbingStart?: (index: number, rect: DOMRect) => void;
}

interface ImageGridPromptModel {
  // Pair prompt props
  onPairClick?: (pairIndex: number) => void;
  pairPrompts?: Record<number, { prompt: string; negativePrompt: string }>;
  enhancedPrompts?: Record<number, string>;
  defaultPrompt?: string;
  defaultNegativePrompt?: string;
  onClearEnhancedPrompt?: (pairIndex: number) => void;
  // Per-pair parameter overrides for showing override icons
  pairOverrides?: Record<number, {
    phaseConfig?: PhaseConfig;
    loras?: PairLoraConfig[];
    motionSettings?: PairMotionSettings;
  }>;
}

interface ImageGridProps {
  layout: ImageGridLayoutModel;
  content: ImageGridContentModel;
  interactions: ImageGridInteractionModel;
  prompts: ImageGridPromptModel;
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  layout,
  content,
  interactions,
  prompts,
}) => {
  const {
    gridColsClass,
    columns = 4,
    isMobile,
    readOnly = false,
    projectAspectRatio,
    batchVideoFrames = DEFAULT_BATCH_VIDEO_FRAMES,
    activeDragId = null,
    dropTargetIndex = null,
    activeScrubbingIndex,
  } = layout;
  const { images, selectedIds, segmentSlots, hasPendingTask, deletingSegmentId, scrubbing } = content;
  const {
    onItemClick,
    onItemDoubleClick,
    onDelete,
    onDuplicate,
    duplicatingImageId,
    duplicateSuccessImageId,
    onGridDoubleClick,
    onImageUpload,
    isUploadingImage,
    onSegmentClick,
    onSegmentDelete,
    onScrubbingStart,
  } = interactions;
  const {
    onPairClick,
    pairPrompts,
    enhancedPrompts,
    defaultPrompt,
    defaultNegativePrompt,
    onClearEnhancedPrompt,
    pairOverrides,
  } = prompts;

  // Prefetch task data on hover (desktop only)
  const prefetchTaskData = usePrefetchTaskData();

  // Build segment info for source image change detection
  const segmentSourceInfo = useMemo(() => {
    if (!segmentSlots) return [];
    return segmentSlots
      .filter(slot => slot.type === 'child')
      .map(slot => {
        if (slot.type !== 'child') return null;
        const child = slot.child;
        const params = child.params as Record<string, unknown> | null;
        const individualParams = (params?.individual_segment_params || {}) as Record<string, unknown>;
        const orchDetails = (params?.orchestrator_details || {}) as Record<string, unknown>;
        const childOrder = child.child_order ?? slot.index;

        // Get generation IDs - check multiple locations (individual params, top-level, orchestrator arrays)
        const orchGenIds = (orchDetails.input_image_generation_ids || []) as string[];
        const startGenId = [
          individualParams.start_image_generation_id,
          params?.start_image_generation_id,
          orchGenIds[childOrder],
        ].find((value): value is string => typeof value === 'string') ?? null;
        const endGenId = [
          individualParams.end_image_generation_id,
          params?.end_image_generation_id,
          orchGenIds[childOrder + 1],
        ].find((value): value is string => typeof value === 'string') ?? null;

        return {
          segmentId: child.id,
          childOrder,
          params: params || {},
          startGenId,
          endGenId,
        };
      })
      .filter((info): info is NonNullable<typeof info> => info !== null);
  }, [segmentSlots]);

  // Check for recent source image changes (shows warning for 5 minutes after change)
  const { hasRecentMismatch } = useSourceImageChanges(segmentSourceInfo, !readOnly);

  // Build a map from pairShotGenerationId → segmentSlot for direct image-based lookup.
  // This ties segments to their start image rather than relying on position indices,
  // which can diverge when currentImages contains items filtered from the position map.
  const segmentSlotByImageId = useMemo(() => {
    if (!segmentSlots) return undefined;
    const map = new Map<string, typeof segmentSlots[number]>();
    for (const slot of segmentSlots) {
      if (slot.pairShotGenerationId && !map.has(slot.pairShotGenerationId)) {
        map.set(slot.pairShotGenerationId, slot);
      }
    }
    return map;
  }, [segmentSlots]);

  const handleMouseEnter = useCallback((generationId: string | null | undefined) => {
    if (!isMobile && generationId) {
      prefetchTaskData(generationId);
    }
  }, [isMobile, prefetchTaskData]);

  return (
    <div
      className={cn("grid gap-3 pt-6 overflow-visible", gridColsClass)}
      onDoubleClick={(e) => {
        // Only deselect if double-clicking on the grid itself, not on an image
        if (e.target === e.currentTarget) {
          onGridDoubleClick?.();
        }
      }}
    >
      {images.map((image, index) => {
        // imageKey is shot_generations.id - unique per entry
        const imageKey = image.id as string;
        const desktopSelected = selectedIds.includes(imageKey);
        // Use actual timeline_frame for duplication (not calculated from index)
        // For batch view display: show index × duration per pair in seconds
        const durationPerPairSeconds = batchVideoFrames / FPS;
        const displayTimeSeconds = index * durationPerPairSeconds;
        const duplicateFrame = resolveDuplicateFrame(image, index, batchVideoFrames);
        const isLastImage = index === images.length - 1;

        // Get pair data for the indicator after this image
        const pairPrompt = pairPrompts?.[index];
        const enhancedPrompt = enhancedPrompts?.[index];
        const startImage = images[index];
        
        // Get segment slot for this pair — tied to the image's ID, not array position
        const segmentSlot = segmentSlotByImageId?.get(imageKey);
        // Get previous image's segment slot (for cross-row display)
        const prevImageKey = index > 0 ? (images[index - 1].id as string) : undefined;
        const prevSegmentSlot = prevImageKey ? segmentSlotByImageId?.get(prevImageKey) : undefined;

        // Row boundary detection
        const isAtEndOfRow = (index + 1) % columns === 0;
        const isAtStartOfRow = index > 0 && index % columns === 0;


        // Previous pair data (for cross-row indicator on left)
        const prevPairPrompt = index > 0 ? pairPrompts?.[index - 1] : undefined;
        const prevEnhancedPrompt = index > 0 ? enhancedPrompts?.[index - 1] : undefined;
        const prevStartImage = index > 0 ? images[index - 1] : undefined;

        // Hide indicator if this item is being dragged OR if an external file is being dropped into this gap
        // The gap after item 'index' corresponds to insertion at 'index + 1'
        const isDraggingThisItem = image.id === activeDragId;
        const isDropTargetGap = dropTargetIndex !== null && dropTargetIndex === index + 1;

        // Only hide if specifically affected by drag/drop
        const shouldHideIndicator = isDraggingThisItem || isDropTargetGap;

        
        // Get the actual generation ID for prefetching (shot_generations stores generation_id)
        const generationId = getGenerationId(image);

        return (
          <div
            key={imageKey}
            data-sortable-item
            className="relative"
            onMouseEnter={() => handleMouseEnter(generationId)}
          >
            <ShotBatchItemDesktop
              item={{
                image,
                selection: {
                  isSelected: desktopSelected,
                  isDragDisabled: isMobile,
                },
                timing: {
                  timelineFrame: duplicateFrame,
                  displayTimeSeconds,
                },
                duplication: {
                  duplicatingImageId,
                  duplicateSuccessImageId,
                },
                loading: {
                  shouldLoad: true,
                  projectAspectRatio,
                },
              }}
              actions={{
                onClick: (event) => {
                  if (!isMobile) {
                    onItemClick(imageKey, event);
                  }
                },
                onDelete: () => onDelete(image.id),
                onDuplicate,
                onOpenLightbox: isMobile ? () => {} : () => onItemDoubleClick(index),
              }}
            />

            {/* Cross-row: Previous pair's video + indicator - shows on LEFT at start of row, centered vertically together */}
            {isAtStartOfRow && !shouldHideIndicator && (() => {
              const slotIndex = index - 1;
              const isActiveScrubbing = activeScrubbingIndex === slotIndex;
              const hasVideo = prevSegmentSlot && prevSegmentSlot.type === 'child' && prevSegmentSlot.child.location;
              // Check for pending task using start image's shot_generation.id as pairShotGenerationId
              const prevPairShotGenId = prevStartImage?.id;
              const isPrevPending = hasPendingTask?.(prevPairShotGenId);
              const showSegmentArea = hasVideo || isPrevPending;

              // Only render if there's something to show (segment area or pair click handler)
              if (!onPairClick && !showSegmentArea) return null;

              return (
                <div className="absolute -left-[6px] top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto flex flex-col items-center gap-1">
                  {showSegmentArea && (
                    <div className="w-20">
                      {prevSegmentSlot ? (() => {
                        const segmentId = prevSegmentSlot.type === 'child' ? prevSegmentSlot.child.id : null;
                        return (
                          <InlineSegmentVideo
                            slot={prevSegmentSlot}
                            pairIndex={slotIndex}
                            onClick={() => onSegmentClick?.(slotIndex)}
                            onOpenPairSettings={onPairClick}
                            onDelete={onSegmentDelete}
                            isDeleting={prevSegmentSlot.type === 'child' && prevSegmentSlot.child.id === deletingSegmentId}
                            projectAspectRatio={projectAspectRatio}
                            isMobile={isMobile}
                            layout="flow"
                            compact={true}
                            isPending={isPrevPending}
                            hasSourceChanged={segmentId ? hasRecentMismatch(segmentId) : false}
                            // Scrubbing props
                            isScrubbingActive={isActiveScrubbing}
                            onScrubbingStart={onScrubbingStart ? (rect: DOMRect) => onScrubbingStart(slotIndex, rect) : undefined}
                            scrubbingContainerRef={isActiveScrubbing ? scrubbing?.containerRef : undefined}
                            scrubbingContainerProps={isActiveScrubbing ? scrubbing?.containerProps : undefined}
                            scrubbingProgress={isActiveScrubbing ? scrubbing?.progress : undefined}
                          />
                        );
                      })() : isPrevPending ? (
                        // No slot yet but task is pending - show loading indicator
                        <div className="h-16 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                          <div className="flex flex-col items-center gap-0.5 text-primary">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-[10px] font-medium">Pending</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {onPairClick && (
                    <PairPromptIndicator
                      pairIndex={index - 1}
                      frames={batchVideoFrames}
                      startFrame={(index - 1) * batchVideoFrames}
                      endFrame={index * batchVideoFrames}
                      onClearEnhancedPrompt={onClearEnhancedPrompt}
                      onPairClick={() => {
                        onPairClick(index - 1);
                      }}
                      pairPrompt={prevPairPrompt?.prompt}
                      pairNegativePrompt={prevPairPrompt?.negativePrompt}
                      enhancedPrompt={prevEnhancedPrompt}
                      defaultPrompt={defaultPrompt}
                      defaultNegativePrompt={defaultNegativePrompt}
                      pairPhaseConfig={pairOverrides?.[index - 1]?.phaseConfig}
                      pairLoras={pairOverrides?.[index - 1]?.loras}
                      pairMotionSettings={pairOverrides?.[index - 1]?.motionSettings}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              );
            })()}

            {/* Video + pair indicator - positioned in the gap to the right, centered vertically together (skip if at end of row) */}
            {!isLastImage && !isAtEndOfRow && !shouldHideIndicator && (() => {
              const slotIndex = index;
              const isActiveScrubbing = activeScrubbingIndex === slotIndex;
              const hasVideo = segmentSlot && segmentSlot.type === 'child' && segmentSlot.child.location;
              // Check for pending task using start image's shot_generation.id as pairShotGenerationId
              const pairShotGenId = startImage?.id;
              const isPending = hasPendingTask?.(pairShotGenId);
              const showSegmentArea = hasVideo || isPending;

              // Only render if there's something to show (segment area or pair click handler)
              if (!onPairClick && !showSegmentArea) return null;

              return (
                <div className="absolute -right-[6px] top-1/2 translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto flex flex-col items-center gap-1">
                  {showSegmentArea && (
                    <div className="w-20">
                      {segmentSlot ? (() => {
                        const segmentId = segmentSlot.type === 'child' ? segmentSlot.child.id : null;
                        return (
                          <InlineSegmentVideo
                            slot={segmentSlot}
                            pairIndex={slotIndex}
                            onClick={() => onSegmentClick?.(slotIndex)}
                            onOpenPairSettings={onPairClick}
                            onDelete={onSegmentDelete}
                            isDeleting={segmentSlot.type === 'child' && segmentSlot.child.id === deletingSegmentId}
                            projectAspectRatio={projectAspectRatio}
                            isMobile={isMobile}
                            layout="flow"
                            compact={true}
                            isPending={isPending}
                            hasSourceChanged={segmentId ? hasRecentMismatch(segmentId) : false}
                            // Scrubbing props
                            isScrubbingActive={isActiveScrubbing}
                            onScrubbingStart={onScrubbingStart ? (rect: DOMRect) => onScrubbingStart(slotIndex, rect) : undefined}
                            scrubbingContainerRef={isActiveScrubbing ? scrubbing?.containerRef : undefined}
                            scrubbingContainerProps={isActiveScrubbing ? scrubbing?.containerProps : undefined}
                            scrubbingProgress={isActiveScrubbing ? scrubbing?.progress : undefined}
                          />
                        );
                      })() : isPending ? (
                        // No slot yet but task is pending - show loading indicator
                        <div className="h-16 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                          <div className="flex flex-col items-center gap-0.5 text-primary">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="text-[10px] font-medium">Pending</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                  {onPairClick && (
                    <PairPromptIndicator
                      pairIndex={index}
                      frames={batchVideoFrames}
                      startFrame={index * batchVideoFrames}
                      endFrame={(index + 1) * batchVideoFrames}
                      onClearEnhancedPrompt={onClearEnhancedPrompt}
                      onPairClick={() => {
                        onPairClick(index);
                      }}
                      pairPrompt={pairPrompt?.prompt}
                      pairNegativePrompt={pairPrompt?.negativePrompt}
                      enhancedPrompt={enhancedPrompt}
                      defaultPrompt={defaultPrompt}
                      defaultNegativePrompt={defaultNegativePrompt}
                      pairPhaseConfig={pairOverrides?.[index]?.phaseConfig}
                      pairLoras={pairOverrides?.[index]?.loras}
                      pairMotionSettings={pairOverrides?.[index]?.motionSettings}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Trailing segment duration indicator - only show when there's exactly 1 image */}
      {images.length === 1 && onPairClick && (
        <div className="flex items-center justify-center">
          <TrailingDurationIndicator
            frames={batchVideoFrames}
            fps={FPS}
            readOnly={readOnly}
            projectAspectRatio={projectAspectRatio}
            onClick={() => onPairClick(0)}
          />
        </div>
      )}

      {/* Add Images card - appears as next item in grid */}
      {onImageUpload && !readOnly && (
        <AddImagesCard
          projectAspectRatio={projectAspectRatio}
          onImageUpload={onImageUpload}
          isUploadingImage={isUploadingImage}
        />
      )}
    </div>
  );
};
