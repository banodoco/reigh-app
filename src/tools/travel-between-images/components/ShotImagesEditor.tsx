/**
 * ShotImagesEditor - Main editor for shot images in travel-between-images tool.
 *
 * Architecture:
 * - This component is a thin orchestrator that:
 *   1. Coordinates data hooks
 *   2. Dispatches to TimelineModeContent or BatchModeContent
 *   3. Renders shared UI (header, dialogs, overlays)
 *
 * Hooks (in ./ShotImagesEditor/hooks/):
 * - usePairData: Pure computation of pair data from images
 * - useFrameCountUpdater: Timeline frame count updates with compression
 * - useSegmentSlotMode: Segment editor state and SegmentSlotModeData
 * - useShotGenerationsData: Data management and variant badges
 * - useLightboxTransition: Overlay transitions between lightboxes
 * - usePreviewSegments: Preview dialog segments
 * - useDownloadImages: Zip download functionality
 * - useSmoothContinuations: Timeline gap compaction
 *
 * Components (in ./ShotImagesEditor/components/):
 * - TimelineModeContent: Timeline component wrapper
 * - BatchModeContent: ShotImageManager + BatchGuidanceVideo
 * - PreviewTogetherDialog: Video preview dialog
 */

import React, { useState, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Download, Loader2, Play, Video } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

import MediaLightbox from '@/shared/components/MediaLightbox';
import { SegmentEditorModal } from '@/shared/components/MediaLightbox/components';
import { SectionHeader } from '@/tools/image-generation/components/ImageGenerationForm/components/SectionHeader';

import {
  PreviewTogetherDialog,
  TimelineModeContent,
  BatchModeContent,
  type PreviewSegment,
} from './ShotImagesEditor/components';

import { useEnhancedShotImageReorder } from '@/shared/hooks/useEnhancedShotImageReorder';
import { useSegmentOutputsForShot } from '../hooks/useSegmentOutputsForShot';
import { usePendingSegmentTasks } from '@/shared/hooks/usePendingSegmentTasks';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';

import {
  useLightboxTransition,
  useSegmentSlotMode,
  useShotGenerationsData,
  usePreviewSegments,
  useDownloadImages,
  useSmoothContinuations,
} from './ShotImagesEditor/hooks';

import type { ShotImagesEditorProps } from './ShotImagesEditor/types';

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = (props) => {
  const {
    isModeReady,
    settingsError,
    isMobile,
    generationMode,
    onGenerationModeChange,
    selectedShotId,
    preloadedImages,
    readOnly = false,
    projectId,
    shotName,
    batchVideoFrames,
    onImageReorder,
    onFramePositionsChange,
    onFileDrop,
    onGenerationDrop,
    onBatchFileDrop,
    onBatchGenerationDrop,
    pendingPositions,
    onPendingPositionApplied,
    onImageDelete,
    onBatchImageDelete,
    onImageDuplicate,
    columns,
    skeleton,
    unpositionedGenerationsCount,
    onOpenUnpositionedPane,
    onImageUpload,
    isUploadingImage,
    uploadProgress = 0,
    duplicatingImageId,
    duplicateSuccessImageId,
    projectAspectRatio,
    defaultPrompt = '',
    defaultNegativePrompt = '',
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment = 'adjust',
    structureVideoMotionStrength = 1.0,
    structureVideoType = 'flow',
    uni3cEndPercent = 0.1,
    onStructureVideoChange,
    onUni3cEndPercentChange,
    structureVideos,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    onSetStructureVideos,
    audioUrl,
    audioMetadata,
    onAudioChange,
    onSelectionChange,
    allShots,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onCreateShot,
    onNewShotFromSelection,
    onDragStateChange,
    onTrailingDurationChange,
    maxFrameLimit = 81,
    smoothContinuations = false,
    selectedOutputId,
    onSelectedOutputChange,
  } = props;

  // ==========================================================================
  // DERIVED VALUES
  // ==========================================================================

  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  const resolvedProjectResolution = projectAspectRatio
    ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio]
    : undefined;

  // ==========================================================================
  // LOCAL STATE
  // ==========================================================================

  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Ref for trailing end frame updates through the position system.
  // TimelineContainer registers its handler here; useFrameCountUpdater calls it.
  const trailingFrameUpdateRef = useRef<((endFrame: number) => void) | null>(null);
  const registerTrailingUpdater = useCallback((fn: (endFrame: number) => void) => {
    trailingFrameUpdateRef.current = fn;
  }, []);

  // ==========================================================================
  // DATA HOOKS
  // ==========================================================================

  const {
    shotGenerations,
    memoizedShotGenerations,
    imagesWithBadges,
    pairPrompts,
    isLoading: positionsLoading,
    updateTimelineFrame,
    batchExchangePositions,
    deleteItem,
    loadPositions,
    clearEnhancedPrompt,
    getImagesForMode,
    hasEverHadData,
  } = useShotGenerationsData({
    selectedShotId,
    projectId,
    generationMode: effectiveGenerationMode,
    preloadedImages,
  });

  const { segmentSlots, selectedParentId } = useSegmentOutputsForShot(
    selectedShotId,
    projectId || '',
    undefined,
    selectedOutputId,
    onSelectedOutputChange,
    readOnly ? preloadedImages : undefined
  );

  const { addOptimisticPending } = usePendingSegmentTasks(selectedShotId, projectId || null);

  // ==========================================================================
  // UI STATE HOOKS
  // ==========================================================================

  const {
    transitionOverlayRef,
    hideTransitionOverlay,
    navigateWithTransition,
  } = useLightboxTransition();

  const {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    pendingImageToOpen,
    setPendingImageToOpen,
    pairDataByIndex,
    segmentSlotModeData,
    handlePairClick,
    updatePairFrameCount,
  } = useSegmentSlotMode({
    selectedShotId,
    projectId,
    effectiveGenerationMode,
    batchVideoFrames,
    shotGenerations,
    segmentSlots,
    selectedParentId,
    defaultPrompt,
    defaultNegativePrompt,
    resolvedProjectResolution,
    structureVideos,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    onSetStructureVideos,
    maxFrameLimit,
    loadPositions,
    navigateWithTransition,
    addOptimisticPending,
    trailingFrameUpdateRef,
  });

  const {
    isPreviewTogetherOpen,
    setIsPreviewTogetherOpen,
    previewableSegments,
    hasVideosToPreview,
  } = usePreviewSegments({
    generationMode: effectiveGenerationMode,
    batchVideoFrames,
    shotGenerations,
    segmentSlots,
  });

  const { isDownloadingImages, handleDownloadAllImages } = useDownloadImages({
    images: imagesWithBadges,
    shotName,
  });

  useSmoothContinuations({
    smoothContinuations,
    images: imagesWithBadges,
    maxFrameLimit,
    updateTimelineFrame,
    readOnly,
  });

  // ==========================================================================
  // CALLBACKS
  // ==========================================================================

  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  const handleDeleteSegment = useCallback(async (generationId: string) => {
    setDeletingSegmentId(generationId);
    try {
      const { data: beforeData } = await supabase
        .from('generations')
        .select('id, parent_generation_id, pair_shot_generation_id, params')
        .eq('id', generationId)
        .single();

      if (!beforeData) return;

      const paramsObj = beforeData.params as Record<string, unknown> | null;
      const individualParams = paramsObj?.individual_segment_params as Record<string, unknown> | undefined;
      const pairShotGenId = beforeData.pair_shot_generation_id ||
        individualParams?.pair_shot_generation_id ||
        paramsObj?.pair_shot_generation_id;

      let idsToDelete = [generationId];
      if (pairShotGenId && beforeData.parent_generation_id) {
        const { data: siblings } = await supabase
          .from('generations')
          .select('id, pair_shot_generation_id, params')
          .eq('parent_generation_id', beforeData.parent_generation_id);

        idsToDelete = (siblings || [])
          .filter(child => {
            const childParamsObj = child.params as Record<string, unknown> | null;
            const childIndividualParams = childParamsObj?.individual_segment_params as Record<string, unknown> | undefined;
            const childPairId = child.pair_shot_generation_id ||
              childIndividualParams?.pair_shot_generation_id ||
              childParamsObj?.pair_shot_generation_id;
            return childPairId === pairShotGenId;
          })
          .map(child => child.id);
      }

      await supabase.from('generations').delete().in('id', idsToDelete);

      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === 'segment-child-generations' },
        (oldData: unknown) => {
          if (Array.isArray(oldData)) {
            return oldData.filter((item: { id: string }) => !idsToDelete.includes(item.id));
          }
          return oldData;
        }
      );
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'segment-child-generations',
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
    } catch (error) {
      handleError(error, { context: 'SegmentDelete', toastTitle: 'Failed to delete segment' });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [queryClient]);

  // Shot management adapters
  const handleAddToShotAdapter = useCallback(async (targetShotId: string, generationId: string) => {
    if (!onAddToShot || !targetShotId) return false;
    try {
      await onAddToShot(targetShotId, generationId);
      return true;
    } catch { return false; }
  }, [onAddToShot]);

  const handleAddToShotWithoutPositionAdapter = useCallback(async (targetShotId: string, generationId: string) => {
    if (!onAddToShotWithoutPosition || !targetShotId) return false;
    try {
      await onAddToShotWithoutPosition(targetShotId, generationId);
      return true;
    } catch { return false; }
  }, [onAddToShotWithoutPosition]);

  const handleCreateShotAdapter = useCallback(async (shotName: string) => {
    if (!onCreateShot) return { shotId: '', shotName: '' };
    const shotId = await onCreateShot(shotName);
    return { shotId, shotName };
  }, [onCreateShot]);

  const handleTimelineChange = useCallback(async () => {
    await loadPositions({ silent: true });
  }, [loadPositions]);

  const handleClearEnhancedPromptByIndex = useCallback(async (pairIndex: number) => {
    const sorted = [...shotGenerations].filter((sg) => !isVideoAny(sg))
      .sort((a, b) => (a.timeline_frame || 0) - (b.timeline_frame || 0));
    const item = sorted[pairIndex];
    if (item) await clearEnhancedPrompt(item.id);
  }, [shotGenerations, clearEnhancedPrompt]);

  const handleClearPendingImageToOpen = useCallback(() => {
    setPendingImageToOpen(null);
    setTimeout(() => {
      hideTransitionOverlay();
      document.body.classList.remove('lightbox-transitioning');
    }, 200);
  }, [hideTransitionOverlay, setPendingImageToOpen]);

  // Reorder hook
  const { handleReorder, handleDelete } = useEnhancedShotImageReorder(
    selectedShotId,
    {
      shotGenerations,
      getImagesForMode,
      exchangePositions: async () => {},
      exchangePositionsNoReload: async () => {},
      batchExchangePositions,
      deleteItem: preloadedImages ? (id: string) => onImageDelete?.(id) : deleteItem,
      loadPositions,
      isLoading: positionsLoading,
    } as Parameters<typeof useEnhancedShotImageReorder>[1]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const showSkeleton = !isModeReady || (positionsLoading && !memoizedShotGenerations.length && !hasEverHadData);

  return (
    <Card className="w-full">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}
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
                      onClick={() => setIsPreviewTogetherOpen(true)}
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
                      onClick={handleDownloadAllImages}
                      disabled={isDownloadingImages || !imagesWithBadges?.length}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      {isDownloadingImages ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
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
              onValueChange={(v) => !readOnly && (v === 'batch' || v === 'timeline') && onGenerationModeChange(v)}
              disabled={readOnly}
            >
              <SegmentedControlItem value="timeline">Timeline</SegmentedControlItem>
              <SegmentedControlItem value="batch">Batch</SegmentedControlItem>
            </SegmentedControl>
          )}
        </div>
      </CardHeader>

      {/* ================================================================== */}
      {/* CONTENT                                                            */}
      {/* ================================================================== */}
      <CardContent>
        {showSkeleton ? (
          <div className="p-1">
            {effectiveGenerationMode === 'batch' ? (
              <>
                <div className="mb-4"><SectionHeader title="Input Images" theme="blue" /></div>
                {skeleton}
                {selectedShotId && projectId && onStructureVideoChange && (
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
              </>
            ) : skeleton}
          </div>
        ) : (
          <div className="p-1">
            {effectiveGenerationMode === 'timeline' ? (
              <TimelineModeContent
                selectedShotId={selectedShotId}
                projectId={projectId}
                readOnly={readOnly}
                images={imagesWithBadges}
                memoizedShotGenerations={memoizedShotGenerations}
                preloadedImages={preloadedImages}
                batchVideoFrames={batchVideoFrames}
                updateTimelineFrame={updateTimelineFrame}
                pendingPositions={pendingPositions}
                onPendingPositionApplied={onPendingPositionApplied}
                maxFrameLimit={maxFrameLimit}
                onImageReorder={onImageReorder}
                onFramePositionsChange={onFramePositionsChange}
                onFileDrop={onFileDrop}
                onGenerationDrop={onGenerationDrop}
                onImageDelete={onImageDelete}
                onImageDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                onClearEnhancedPrompt={handleClearEnhancedPromptByIndex}
                onTimelineChange={handleTimelineChange}
                onDragStateChange={handleDragStateChange}
                onPairClick={handlePairClick}
                structureVideoPath={structureVideoPath}
                structureVideoMetadata={structureVideoMetadata}
                structureVideoTreatment={structureVideoTreatment}
                structureVideoMotionStrength={structureVideoMotionStrength}
                structureVideoType={structureVideoType}
                uni3cEndPercent={uni3cEndPercent}
                onStructureVideoChange={onStructureVideoChange}
                onUni3cEndPercentChange={onUni3cEndPercentChange}
                structureVideos={structureVideos}
                onAddStructureVideo={onAddStructureVideo}
                onUpdateStructureVideo={onUpdateStructureVideo}
                onRemoveStructureVideo={onRemoveStructureVideo}
                audioUrl={audioUrl}
                audioMetadata={audioMetadata}
                onAudioChange={onAudioChange}
                onImageUpload={onImageUpload}
                isUploadingImage={isUploadingImage}
                uploadProgress={uploadProgress}
                allShots={allShots}
                onShotChange={onShotChange}
                onAddToShot={onAddToShot ? handleAddToShotAdapter : undefined}
                onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                onCreateShot={onCreateShot ? handleCreateShotAdapter : undefined}
                onNewShotFromSelection={onNewShotFromSelection}
                segmentSlots={segmentSlots}
                selectedOutputId={selectedOutputId}
                onSelectedOutputChange={onSelectedOutputChange}
                onSegmentFrameCountChange={updatePairFrameCount}
                pendingImageToOpen={pendingImageToOpen}
                onClearPendingImageToOpen={handleClearPendingImageToOpen}
                navigateWithTransition={navigateWithTransition}
                projectAspectRatio={projectAspectRatio}
                unpositionedGenerationsCount={unpositionedGenerationsCount}
                onOpenUnpositionedPane={onOpenUnpositionedPane}
                onRegisterTrailingUpdater={registerTrailingUpdater}
              />
            ) : (
              <BatchModeContent
                selectedShotId={selectedShotId}
                projectId={projectId}
                readOnly={readOnly}
                isMobile={isMobile}
                generationMode={generationMode}
                images={imagesWithBadges}
                pairPrompts={pairPrompts}
                columns={columns}
                batchVideoFrames={batchVideoFrames}
                onImageReorder={handleReorder}
                onImageDelete={handleDelete}
                onBatchImageDelete={onBatchImageDelete}
                onImageDuplicate={onImageDuplicate}
                duplicatingImageId={duplicatingImageId}
                duplicateSuccessImageId={duplicateSuccessImageId}
                onFileDrop={onBatchFileDrop}
                onGenerationDrop={onBatchGenerationDrop}
                defaultPrompt={defaultPrompt}
                defaultNegativePrompt={defaultNegativePrompt}
                onClearEnhancedPrompt={handleClearEnhancedPromptByIndex}
                onDragStateChange={handleDragStateChange}
                onPairClick={handlePairClick}
                onSelectionChange={onSelectionChange}
                onImageUpload={onImageUpload}
                isUploadingImage={isUploadingImage}
                allShots={allShots}
                onShotChange={onShotChange}
                onAddToShot={onAddToShot ? handleAddToShotAdapter : undefined}
                onAddToShotWithoutPosition={onAddToShotWithoutPosition ? handleAddToShotWithoutPositionAdapter : undefined}
                onCreateShot={onCreateShot ? handleCreateShotAdapter : undefined}
                onNewShotFromSelection={onNewShotFromSelection}
                segmentSlots={segmentSlots}
                onSegmentDelete={handleDeleteSegment}
                deletingSegmentId={deletingSegmentId}
                pendingImageToOpen={pendingImageToOpen}
                onClearPendingImageToOpen={handleClearPendingImageToOpen}
                navigateWithTransition={navigateWithTransition}
                projectAspectRatio={projectAspectRatio}
                structureVideoPath={structureVideoPath}
                structureVideoMetadata={structureVideoMetadata}
                structureVideoTreatment={structureVideoTreatment}
                structureVideoMotionStrength={structureVideoMotionStrength}
                structureVideoType={structureVideoType}
                uni3cEndPercent={uni3cEndPercent}
                onStructureVideoChange={onStructureVideoChange}
                onUni3cEndPercentChange={onUni3cEndPercentChange}
                unpositionedGenerationsCount={unpositionedGenerationsCount}
                onOpenUnpositionedPane={onOpenUnpositionedPane}
              />
            )}
          </div>
        )}
      </CardContent>

      {/* ================================================================== */}
      {/* OVERLAYS & DIALOGS                                                 */}
      {/* ================================================================== */}

      {/* Transition overlay */}
      <div
        ref={transitionOverlayRef}
        className="fixed inset-0 z-[99999] bg-black pointer-events-none"
        aria-hidden="true"
        style={{ opacity: 0, display: 'none' }}
      />

      {/* Segment Slot Editor */}
      {segmentSlotModeData && (
        segmentSlotModeData.segmentVideo ? (
          <MediaLightbox
            media={segmentSlotModeData.segmentVideo}
            segmentSlotMode={segmentSlotModeData}
            onClose={() => setSegmentSlotLightboxIndex(null)}
            shotId={selectedShotId}
            readOnly={readOnly}
            fetchVariantsForSelf
          />
        ) : (
          <SegmentEditorModal
            segmentSlotMode={segmentSlotModeData}
            onClose={() => setSegmentSlotLightboxIndex(null)}
            readOnly={readOnly}
          />
        )
      )}

      {/* Preview Together Dialog */}
      <PreviewTogetherDialog
        isOpen={isPreviewTogetherOpen}
        onOpenChange={setIsPreviewTogetherOpen}
        previewableSegments={previewableSegments as PreviewSegment[]}
        projectAspectRatio={projectAspectRatio}
        audioUrl={audioUrl}
      />
    </Card>
  );
};

export default React.memo(ShotImagesEditor);
