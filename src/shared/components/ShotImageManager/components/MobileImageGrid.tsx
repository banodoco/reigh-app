import React from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { ShotBatchItemMobile } from '@/shared/components/ShotImageManager/ShotBatchItemMobile';
import { PairPromptIndicator } from '@/shared/components/ShotImageManager/components/PairPromptIndicator';
import { InlineSegmentVideo } from '@/shared/components/InlineSegmentVideo';
import { getAspectRatioStyle, resolveDuplicateFrame } from '@/shared/components/ShotImageManager/utils/image-utils';
import type { BaseShotImageManagerProps } from '@/shared/components/ShotImageManager/types';
import type { GenerationRow } from '@/domains/generation/types';

interface MobileImageGridLayoutModel {
  mobileGridColsClass: string;
  gridColumns: number;
  projectAspectRatio: BaseShotImageManagerProps['projectAspectRatio'];
  batchVideoFrames: number;
}

interface MobileImageGridSelectionModel {
  selectedIds: string[];
  isInMoveMode: boolean;
  wouldActuallyMove: (insertIndex: number) => boolean;
}

interface MobileImageGridActionsModel {
  readOnly: boolean;
  onMobileTap: (imageId: string, index: number) => void;
  onDeleteImage: (shotImageEntryId: string) => void;
  onMoveHere: (index: number) => void;
  onOpenLightbox?: (index: number) => void;
  onInpaintClick?: (index: number) => void;
  onImageDuplicate: BaseShotImageManagerProps['onImageDuplicate'];
  duplicatingImageId: BaseShotImageManagerProps['duplicatingImageId'];
  duplicateSuccessImageId: BaseShotImageManagerProps['duplicateSuccessImageId'];
  onMarkAllViewed: (generationId: string) => void;
}

interface MobileImageGridPairingModel {
  onPairClick: BaseShotImageManagerProps['onPairClick'];
  pairPrompts: BaseShotImageManagerProps['pairPrompts'];
  enhancedPrompts: BaseShotImageManagerProps['enhancedPrompts'];
  defaultPrompt: BaseShotImageManagerProps['defaultPrompt'];
  defaultNegativePrompt: BaseShotImageManagerProps['defaultNegativePrompt'];
  onClearEnhancedPrompt: BaseShotImageManagerProps['onClearEnhancedPrompt'];
  pairOverrides: BaseShotImageManagerProps['pairOverrides'];
  segmentSlots: BaseShotImageManagerProps['segmentSlots'];
  onSegmentClick: BaseShotImageManagerProps['onSegmentClick'];
  hasPendingTask: BaseShotImageManagerProps['hasPendingTask'];
}

interface MobileImageGridUploadModel {
  enabled: boolean;
  isUploadingImage: boolean;
  onUpload?: (files: File[]) => void;
}

export interface MobileImageGridProps {
  images: GenerationRow[];
  layout: MobileImageGridLayoutModel;
  selection: MobileImageGridSelectionModel;
  actions: MobileImageGridActionsModel;
  pairing: MobileImageGridPairingModel;
  upload: MobileImageGridUploadModel;
}

export function MobileImageGrid({
  images,
  layout,
  selection,
  actions,
  pairing,
  upload,
}: MobileImageGridProps): React.ReactElement {
  return (
    <div className={cn('grid gap-3 pt-6 overflow-visible', layout.mobileGridColsClass)}>
      {images.map((image, index) => {
        const imageKey = image.id;
        const isSelected = selection.selectedIds.includes(imageKey);
        const isLastItem = index === images.length - 1;

        const frameNumber = resolveDuplicateFrame(image, index, layout.batchVideoFrames);
        const showLeftArrow =
          selection.selectedIds.length > 0 && !isSelected && selection.wouldActuallyMove(index);
        const showRightArrow =
          selection.selectedIds.length > 0 &&
          isLastItem &&
          !isSelected &&
          selection.wouldActuallyMove(index + 1);
        const isAtStartOfRow = index > 0 && index % layout.gridColumns === 0;
        const prevImageWasEndOfRow = isAtStartOfRow;

        const pairPrompt = pairing.pairPrompts?.[index];
        const enhancedPrompt = pairing.enhancedPrompts?.[index];
        const startImage = images[index];
        const generationId = image.generation_id;

        const prevPairPrompt = index > 0 ? pairing.pairPrompts?.[index - 1] : undefined;
        const prevEnhancedPrompt = index > 0 ? pairing.enhancedPrompts?.[index - 1] : undefined;
        const prevStartImage = index > 0 ? images[index - 1] : undefined;

        const segmentSlot = pairing.segmentSlots?.find((s) => s.index === index);
        const prevSegmentSlot = index > 0 ? pairing.segmentSlots?.find((s) => s.index === index - 1) : undefined;

        return (
          <React.Fragment key={imageKey}>
            <div className="relative">
              {prevImageWasEndOfRow && !selection.isInMoveMode && (() => {
                const hasPrevVideo =
                  prevSegmentSlot && prevSegmentSlot.type === 'child' && prevSegmentSlot.child.location;
                const prevPairShotGenId = prevStartImage?.id;
                const isPrevPending = pairing.hasPendingTask?.(prevPairShotGenId);
                const showPrevSegmentArea = hasPrevVideo || isPrevPending;

                if (!showPrevSegmentArea && !pairing.onPairClick) return null;

                return (
                  <div className="absolute -left-[6px] top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-auto">
                    {showPrevSegmentArea && (
                      <div className="w-16">
                        {prevSegmentSlot ? (
                          <InlineSegmentVideo
                            slot={prevSegmentSlot}
                            pairIndex={index - 1}
                            onClick={() => pairing.onSegmentClick?.(index - 1)}
                            onOpenPairSettings={pairing.onPairClick}
                            projectAspectRatio={layout.projectAspectRatio}
                            isMobile
                            layout="flow"
                            compact
                            isPending={isPrevPending}
                          />
                        ) : isPrevPending ? (
                          <div className="h-12 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                            <div className="flex flex-col items-center gap-0.5 text-primary">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="text-[9px] font-medium">Pending</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {pairing.onPairClick && (
                      <PairPromptIndicator
                        pairIndex={index - 1}
                        frames={layout.batchVideoFrames}
                        startFrame={(index - 1) * layout.batchVideoFrames}
                        endFrame={index * layout.batchVideoFrames}
                        isMobile
                        onClearEnhancedPrompt={pairing.onClearEnhancedPrompt}
                        onPairClick={() => {
                          pairing.onPairClick?.(index - 1);
                        }}
                        pairPrompt={prevPairPrompt?.prompt}
                        pairNegativePrompt={prevPairPrompt?.negativePrompt}
                        enhancedPrompt={prevEnhancedPrompt}
                        defaultPrompt={pairing.defaultPrompt}
                        defaultNegativePrompt={pairing.defaultNegativePrompt}
                        pairPhaseConfig={pairing.pairOverrides?.[index - 1]?.phaseConfig}
                        pairLoras={pairing.pairOverrides?.[index - 1]?.loras}
                        pairMotionSettings={pairing.pairOverrides?.[index - 1]?.motionSettings}
                      />
                    )}
                  </div>
                );
              })()}

              <ShotBatchItemMobile
                image={image}
                isSelected={isSelected}
                index={index}
                onMobileTap={() => actions.onMobileTap(imageKey, index)}
                onDelete={() => actions.onDeleteImage(image.id)}
                onDuplicate={actions.onImageDuplicate}
                onOpenLightbox={actions.onOpenLightbox ? () => actions.onOpenLightbox?.(index) : undefined}
                onInpaintClick={actions.onInpaintClick ? () => actions.onInpaintClick?.(index) : undefined}
                hideDeleteButton={selection.selectedIds.length > 0 || actions.readOnly}
                duplicatingImageId={actions.duplicatingImageId}
                duplicateSuccessImageId={actions.duplicateSuccessImageId}
                shouldLoad
                projectAspectRatio={layout.projectAspectRatio}
                frameNumber={frameNumber}
                readOnly={actions.readOnly}
                onMarkAllViewed={generationId ? () => actions.onMarkAllViewed(generationId) : undefined}
              />

              {!actions.readOnly && showLeftArrow && (
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 -translate-x-1/2 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-12 w-6 rounded-full p-0"
                    onClick={() => {
                      actions.onMoveHere(index);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={index === 0 ? 'Move to beginning' : 'Move here'}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {!actions.readOnly && showRightArrow && (
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 translate-x-1/2 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-12 w-6 rounded-full p-0"
                    onClick={() => {
                      actions.onMoveHere(index + 1);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Move to end"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {!isLastItem && !selection.isInMoveMode && !((index + 1) % layout.gridColumns === 0) && (() => {
                const hasVideo = segmentSlot && segmentSlot.type === 'child' && segmentSlot.child.location;
                const pairShotGenId = startImage?.id;
                const isPending = pairing.hasPendingTask?.(pairShotGenId);
                const showSegmentArea = hasVideo || isPending;

                if (!showSegmentArea && !pairing.onPairClick) return null;

                return (
                  <div className="absolute -right-[6px] top-1/2 -translate-y-1/2 translate-x-1/2 z-20 flex flex-col items-center gap-1 pointer-events-auto">
                    {showSegmentArea && (
                      <div className="w-16">
                        {segmentSlot ? (
                          <InlineSegmentVideo
                            slot={segmentSlot}
                            pairIndex={index}
                            onClick={() => pairing.onSegmentClick?.(index)}
                            onOpenPairSettings={pairing.onPairClick}
                            projectAspectRatio={layout.projectAspectRatio}
                            isMobile
                            layout="flow"
                            compact
                            isPending={isPending}
                          />
                        ) : isPending ? (
                          <div className="h-12 bg-muted/40 border-2 border-dashed border-primary/40 rounded-md flex items-center justify-center shadow-sm">
                            <div className="flex flex-col items-center gap-0.5 text-primary">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="text-[9px] font-medium">Pending</span>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {pairing.onPairClick && (
                      <PairPromptIndicator
                        pairIndex={index}
                        frames={layout.batchVideoFrames}
                        startFrame={index * layout.batchVideoFrames}
                        endFrame={(index + 1) * layout.batchVideoFrames}
                        isMobile
                        onClearEnhancedPrompt={pairing.onClearEnhancedPrompt}
                        onPairClick={() => {
                          pairing.onPairClick?.(index);
                        }}
                        pairPrompt={pairPrompt?.prompt}
                        pairNegativePrompt={pairPrompt?.negativePrompt}
                        enhancedPrompt={enhancedPrompt}
                        defaultPrompt={pairing.defaultPrompt}
                        defaultNegativePrompt={pairing.defaultNegativePrompt}
                        pairPhaseConfig={pairing.pairOverrides?.[index]?.phaseConfig}
                        pairLoras={pairing.pairOverrides?.[index]?.loras}
                        pairMotionSettings={pairing.pairOverrides?.[index]?.motionSettings}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
          </React.Fragment>
        );
      })}

      {!actions.readOnly && upload.enabled && upload.onUpload && (() => {
        const aspectRatioStyle = getAspectRatioStyle(layout.projectAspectRatio);

        return (
          <div className="relative" style={aspectRatioStyle}>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  upload.onUpload?.(files);
                  e.target.value = '';
                }
              }}
              className="hidden"
              id="mobile-grid-image-upload"
              disabled={upload.isUploadingImage}
            />
            <label
              htmlFor="mobile-grid-image-upload"
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-2',
                'border-2 border-dashed rounded-lg cursor-pointer',
                'transition-all duration-200',
                upload.isUploadingImage
                  ? 'border-muted-foreground/30 bg-muted/30 cursor-not-allowed'
                  : 'border-muted-foreground/40 bg-muted/20 hover:border-primary hover:bg-primary/5',
              )}
            >
              <div className="text-3xl text-muted-foreground">+</div>
              <div className="text-xs text-muted-foreground font-medium sm:hidden lg:block">
                {upload.isUploadingImage ? 'Uploading...' : 'Add Images'}
              </div>
            </label>
          </div>
        );
      })()}
    </div>
  );
}
