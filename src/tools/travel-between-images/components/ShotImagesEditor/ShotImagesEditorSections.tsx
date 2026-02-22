import React from 'react';
import { CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Download, Loader2, Play, Video } from 'lucide-react';
import MediaLightbox from '@/shared/components/MediaLightbox';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components';
import {
  PreviewTogetherDialog,
  BatchModeContent,
  type PreviewSegment,
} from './components';
import Timeline from '../Timeline';
import { TimelineMediaProvider, type TimelineMediaContextValue } from '../Timeline/TimelineMediaContext';
import type {
  ShotImagesEditorDataModel,
  ShotImagesEditorModeModel,
} from './hooks';
import type { ShotImagesEditorCallbacks } from './hooks/useShotImagesEditorCallbacks';
import type { ShotImagesEditorProps } from './types';

export function EditorHeader(props: {
  settingsError?: string;
  readOnly: boolean;
  hasVideosToPreview: boolean;
  isDownloadingImages: boolean;
  hasImages: boolean;
  isMobile: boolean;
  generationMode: ShotImagesEditorProps['generationMode'];
  onGenerationModeChange: ShotImagesEditorProps['onGenerationModeChange'];
  onOpenPreview: () => void;
  onDownloadAll: () => void;
}) {
  const {
    settingsError,
    readOnly,
    hasVideosToPreview,
    isDownloadingImages,
    hasImages,
    isMobile,
    generationMode,
    onGenerationModeChange,
    onOpenPreview,
    onDownloadAll,
  } = props;

  return (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base sm:text-lg font-light">
            Guidance
            {settingsError && <div className="text-sm text-destructive mt-1">{settingsError}</div>}
          </CardTitle>

          {!readOnly && hasVideosToPreview && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenPreview}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Preview all segments</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {!readOnly && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDownloadAll}
                    disabled={isDownloadingImages || !hasImages}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    {isDownloadingImages
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Download all images as zip</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {!isMobile && (
          <SegmentedControl
            value={generationMode}
            onValueChange={(value) => {
              if (!readOnly && (value === 'batch' || value === 'timeline' || value === 'by-pair')) {
                onGenerationModeChange(value);
              }
            }}
            disabled={readOnly}
          >
            <SegmentedControlItem value="timeline">Timeline</SegmentedControlItem>
            <SegmentedControlItem value="batch">Batch</SegmentedControlItem>
          </SegmentedControl>
        )}
      </div>
    </CardHeader>
  );
}

function SkeletonContent(props: {
  effectiveGenerationMode: 'batch' | 'timeline' | 'by-pair';
  selectedShotId?: string;
  projectId?: string;
  onPrimaryStructureVideoInputChange?: ShotImagesEditorProps['onPrimaryStructureVideoInputChange'];
  skeleton: React.ReactNode;
}) {
  const {
    effectiveGenerationMode,
    selectedShotId,
    projectId,
    onPrimaryStructureVideoInputChange,
    skeleton,
  } = props;

  if (effectiveGenerationMode === 'timeline') {
    return <div className="p-1">{skeleton}</div>;
  }

  return (
    <div className="p-1">
      <div className="mb-4"><SectionHeader title="Input Images" theme="blue" /></div>
      {skeleton}
      {selectedShotId && projectId && onPrimaryStructureVideoInputChange && (
        <>
          <div className="mb-4 mt-6"><SectionHeader title="Camera Guidance Video" theme="green" /></div>
          <div className="w-full sm:w-2/3 md:w-1/2 lg:w-1/3 p-4 border rounded-lg bg-muted/20">
            <div className="flex flex-col items-center gap-3 text-center">
              <Video className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Add a motion guidance video</p>
              <Skeleton className="w-full h-9" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineModeContent(props: {
  componentProps: ShotImagesEditorProps;
  data: ShotImagesEditorDataModel;
  mode: ShotImagesEditorModeModel;
  callbacks: ShotImagesEditorCallbacks;
  timelineMediaValue: TimelineMediaContextValue;
  registerTrailingUpdater: (fn: (endFrame: number) => void) => void;
  onLocalPositionsChange?: (positions: Map<string, number>) => void;
}) {
  const {
    componentProps,
    data,
    mode,
    callbacks,
    timelineMediaValue,
    registerTrailingUpdater,
    onLocalPositionsChange,
  } = props;

  const {
    selectedShotId,
    projectId,
    batchVideoFrames,
    onImageReorder,
    onFramePositionsChange,
    onFileDrop,
    onGenerationDrop,
    onImageDelete,
    onImageDuplicate,
    duplicatingImageId,
    duplicateSuccessImageId,
    projectAspectRatio,
    readOnly = false,
    preloadedImages,
    defaultPrompt = '',
    defaultNegativePrompt = '',
    onImageUpload,
    isUploadingImage,
    uploadProgress = 0,
    allShots,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    maxFrameLimit = 81,
    selectedOutputId,
    onNewShotFromSelection,
    unpositionedGenerationsCount,
    onOpenUnpositionedPane,
  } = componentProps;

  return (
    <>
      <TimelineMediaProvider value={timelineMediaValue}>
        <Timeline
          key={`timeline-${selectedShotId}`}
          shotId={selectedShotId}
          projectId={projectId}
          frameSpacing={batchVideoFrames}
          onImageReorder={onImageReorder}
          onFramePositionsChange={onFramePositionsChange}
          onFileDrop={onFileDrop}
          onGenerationDrop={onGenerationDrop}
          onImageDelete={onImageDelete}
          onImageDuplicate={onImageDuplicate}
          duplicatingImageId={duplicatingImageId}
          duplicateSuccessImageId={duplicateSuccessImageId}
          projectAspectRatio={projectAspectRatio}
          readOnly={readOnly}
          shotGenerations={preloadedImages ? undefined : data.memoizedShotGenerations}
          allGenerations={preloadedImages}
          images={data.imagesWithBadges}
          onDragStateChange={callbacks.handleDragStateChange}
          onPairClick={mode.segmentSlot.handlePairClick}
          defaultPrompt={defaultPrompt}
          defaultNegativePrompt={defaultNegativePrompt}
          onClearEnhancedPrompt={callbacks.handleClearEnhancedPromptByIndex}
          onImageUpload={onImageUpload}
          isUploadingImage={isUploadingImage}
          uploadProgress={uploadProgress}
          allShots={allShots}
          selectedShotId={selectedShotId}
          onShotChange={onShotChange}
          onAddToShot={onAddToShot ? callbacks.handleAddToShotAdapter : undefined}
          onAddToShotWithoutPosition={onAddToShotWithoutPosition ? callbacks.handleAddToShotWithoutPositionAdapter : undefined}
          onCreateShot={onCreateShot ? callbacks.handleCreateShotAdapter : undefined}
          maxFrameLimit={maxFrameLimit}
          selectedOutputId={selectedOutputId}
          onSegmentFrameCountChange={mode.segmentSlot.updatePairFrameCount}
          segmentSlots={data.segmentSlots}
          isSegmentsLoading={data.isSegmentsLoading}
          hasPendingTask={data.hasPendingTask}
          onOpenSegmentSlot={(pairIndex) => mode.segmentSlot.handlePairClick(pairIndex)}
          pendingImageToOpen={mode.segmentSlot.pendingImageToOpen}
          pendingImageVariantId={mode.segmentSlot.pendingImageVariantId}
          onClearPendingImageToOpen={mode.handleClearPendingImageToOpen}
          navigateWithTransition={mode.navigateWithTransition}
          onNewShotFromSelection={onNewShotFromSelection}
          onRegisterTrailingUpdater={registerTrailingUpdater}
          onLocalPositionsChange={onLocalPositionsChange}
        />
      </TimelineMediaProvider>

      {unpositionedGenerationsCount > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div className="text-sm text-muted-foreground">
              {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
            </div>
            <Button variant="outline" size="sm" onClick={onOpenUnpositionedPane} className="text-xs">
              View & Position
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function BatchModeEditorContent(props: {
  componentProps: ShotImagesEditorProps;
  data: ShotImagesEditorDataModel;
  mode: ShotImagesEditorModeModel;
  callbacks: ShotImagesEditorCallbacks;
}) {
  const { componentProps, data, mode, callbacks } = props;

  const {
    selectedShotId,
    projectId,
    readOnly = false,
    isMobile,
    generationMode,
    columns,
    batchVideoFrames,
    onBatchImageDelete,
    onImageDuplicate,
    duplicatingImageId,
    duplicateSuccessImageId,
    onBatchFileDrop,
    onBatchGenerationDrop,
    defaultPrompt = '',
    defaultNegativePrompt = '',
    onSelectionChange,
    onImageUpload,
    isUploadingImage,
    allShots,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    onNewShotFromSelection,
    projectAspectRatio,
    primaryStructureVideoPath,
    primaryStructureVideoMetadata,
    primaryStructureVideoTreatment = 'adjust',
    primaryStructureVideoMotionStrength = 1.0,
    primaryStructureVideoType = 'flow',
    primaryStructureVideoUni3cEndPercent = 0.1,
    onPrimaryStructureVideoInputChange,
    onUni3cEndPercentChange,
    unpositionedGenerationsCount,
    onOpenUnpositionedPane,
  } = componentProps;

  return (
    <BatchModeContent
      selectedShotId={selectedShotId}
      projectId={projectId}
      readOnly={readOnly}
      isMobile={isMobile}
      generationMode={generationMode}
      images={data.imagesWithBadges}
      pairPrompts={data.pairPrompts}
      columns={columns}
      batchVideoFrames={batchVideoFrames}
      onImageReorder={callbacks.handleReorder}
      onImageDelete={callbacks.handleDelete}
      onBatchImageDelete={onBatchImageDelete}
      onImageDuplicate={onImageDuplicate}
      duplicatingImageId={duplicatingImageId}
      duplicateSuccessImageId={duplicateSuccessImageId}
      onFileDrop={onBatchFileDrop}
      onGenerationDrop={onBatchGenerationDrop}
      defaultPrompt={defaultPrompt}
      defaultNegativePrompt={defaultNegativePrompt}
      onClearEnhancedPrompt={callbacks.handleClearEnhancedPromptByIndex}
      onDragStateChange={callbacks.handleDragStateChange}
      onPairClick={mode.segmentSlot.handlePairClick}
      onSelectionChange={onSelectionChange}
      onImageUpload={onImageUpload}
      isUploadingImage={isUploadingImage}
      allShots={allShots}
      onShotChange={onShotChange}
      onAddToShot={onAddToShot ? callbacks.handleAddToShotAdapter : undefined}
      onAddToShotWithoutPosition={onAddToShotWithoutPosition ? callbacks.handleAddToShotWithoutPositionAdapter : undefined}
      onCreateShot={onCreateShot ? callbacks.handleCreateShotAdapter : undefined}
      onNewShotFromSelection={onNewShotFromSelection}
      segmentSlots={data.segmentSlots}
      onSegmentDelete={callbacks.handleDeleteSegment}
      deletingSegmentId={callbacks.deletingSegmentId}
      pendingImageToOpen={mode.segmentSlot.pendingImageToOpen}
      pendingImageVariantId={mode.segmentSlot.pendingImageVariantId}
      onClearPendingImageToOpen={mode.handleClearPendingImageToOpen}
      navigateWithTransition={mode.navigateWithTransition}
      projectAspectRatio={projectAspectRatio}
      primaryStructureVideoPath={primaryStructureVideoPath}
      primaryStructureVideoMetadata={primaryStructureVideoMetadata}
      primaryStructureVideoTreatment={primaryStructureVideoTreatment}
      primaryStructureVideoMotionStrength={primaryStructureVideoMotionStrength}
      primaryStructureVideoType={primaryStructureVideoType}
      primaryStructureVideoUni3cEndPercent={primaryStructureVideoUni3cEndPercent}
      onPrimaryStructureVideoInputChange={onPrimaryStructureVideoInputChange}
      onUni3cEndPercentChange={onUni3cEndPercentChange}
      unpositionedGenerationsCount={unpositionedGenerationsCount}
      onOpenUnpositionedPane={onOpenUnpositionedPane}
    />
  );
}

export function EditorContent(props: {
  componentProps: ShotImagesEditorProps;
  data: ShotImagesEditorDataModel;
  mode: ShotImagesEditorModeModel;
  callbacks: ShotImagesEditorCallbacks;
  timelineMediaValue: TimelineMediaContextValue;
  registerTrailingUpdater: (fn: (endFrame: number) => void) => void;
  onLocalPositionsChange?: (positions: Map<string, number>) => void;
}) {
  const { componentProps, data, mode, callbacks, timelineMediaValue, registerTrailingUpdater, onLocalPositionsChange } = props;

  const {
    isModeReady,
    selectedShotId,
    projectId,
    onPrimaryStructureVideoInputChange,
    skeleton,
    isMobile,
    generationMode,
  } = componentProps;

  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  // Show skeleton only when we genuinely don't have data to display.
  // Previously this gated on !isModeReady unconditionally, which caused a one-frame
  // skeleton flash when entering a shot (isModeReady starts false, is set true in an effect).
  // When preloaded images are available (from navigation state), skip the skeleton entirely.
  const showSkeleton = (!isModeReady && !data.memoizedShotGenerations.length) || (data.positionsLoading && !data.memoizedShotGenerations.length && !data.hasEverHadData);

  if (showSkeleton) {
    return (
      <CardContent>
        <SkeletonContent
          effectiveGenerationMode={effectiveGenerationMode}
          selectedShotId={selectedShotId}
          projectId={projectId}
          onPrimaryStructureVideoInputChange={onPrimaryStructureVideoInputChange}
          skeleton={skeleton}
        />
      </CardContent>
    );
  }

  return (
    <CardContent>
      <div className="p-1">
        {effectiveGenerationMode === 'timeline' ? (
          <TimelineModeContent
            componentProps={componentProps}
            data={data}
            mode={mode}
            callbacks={callbacks}
            timelineMediaValue={timelineMediaValue}
            registerTrailingUpdater={registerTrailingUpdater}
            onLocalPositionsChange={onLocalPositionsChange}
          />
        ) : (
          <BatchModeEditorContent
            componentProps={componentProps}
            data={data}
            mode={mode}
            callbacks={callbacks}
          />
        )}
      </div>
    </CardContent>
  );
}

export function EditorOverlays(props: {
  componentProps: ShotImagesEditorProps;
  mode: ShotImagesEditorModeModel;
}) {
  const { componentProps, mode } = props;
  const {
    readOnly = false,
    selectedShotId,
    projectAspectRatio,
    audioUrl,
  } = componentProps;

  return (
    <>
      <div
        ref={mode.transitionOverlayRef}
        className="fixed inset-0 z-[99999] bg-black pointer-events-none"
        aria-hidden="true"
        style={mode.segmentSlot.pendingImageToOpen ? { opacity: 1, display: 'block' } : { opacity: 0, display: 'none' }}
      />

      {mode.segmentSlot.segmentSlotModeData && (
        <MediaLightbox
          media={mode.segmentSlot.segmentSlotModeData.segmentVideo}
          segmentSlotMode={mode.segmentSlot.segmentSlotModeData}
          onClose={() => mode.segmentSlot.setSegmentSlotLightboxIndex(null)}
          shotId={selectedShotId}
          readOnly={readOnly}
          fetchVariantsForSelf
        />
      )}

      <PreviewTogetherDialog
        isOpen={mode.preview.isPreviewTogetherOpen}
        onOpenChange={(open) => {
          mode.preview.setIsPreviewTogetherOpen(open);
          if (!open) {
            mode.setPreviewInitialPairIndex(null);
          }
        }}
        previewableSegments={mode.preview.previewableSegments as PreviewSegment[]}
        projectAspectRatio={projectAspectRatio}
        audioUrl={audioUrl}
        initialPairIndex={mode.previewInitialPairIndex}
        onOpenInLightbox={(segmentIndex) => {
          mode.preview.setIsPreviewTogetherOpen(false);
          mode.segmentSlot.handlePairClick(segmentIndex);
        }}
      />
    </>
  );
}
