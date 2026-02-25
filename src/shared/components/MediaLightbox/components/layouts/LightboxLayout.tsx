/**
 * LightboxLayout - Unified layout for all lightbox configurations.
 */

import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Eraser, Square, Undo2, X } from 'lucide-react';
import type { LightboxLayoutProps } from './types';
import {
  useLightboxCoreSafe,
  useLightboxMediaSafe,
  useLightboxVariantsSafe,
  useLightboxNavigationSafe,
} from '../../contexts/LightboxStateContext';
import { useImageEditCanvasSafe } from '../../contexts/ImageEditCanvasContext';
import { useVideoEditSafe } from '../../contexts/VideoEditContext';
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AdjacentSegmentNavigation } from './AdjacentSegmentNavigation';
import { PreviewSequencePill } from './PreviewSequencePill';
import { ConstituentImageNavigation } from './ConstituentImageNavigation';
import { NavigationArrows } from '../NavigationArrows';
import { FloatingToolControls } from '../FloatingToolControls';
import { AnnotationFloatingControls } from '../AnnotationFloatingControls';
import {
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from '../ButtonGroups';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import { VideoEditModeDisplay } from '../VideoEditModeDisplay';
import { VideoTrimModeDisplay } from '../VideoTrimModeDisplay';
import { WorkflowControls } from '../WorkflowControls';
import { WorkflowControlsBar } from '../WorkflowControlsBar';

function useLightboxLayoutModel(props: LightboxLayoutProps) {
  const core = useLightboxCoreSafe();
  const mediaState = useLightboxMediaSafe();
  const variantsState = useLightboxVariantsSafe();
  const navigation = useLightboxNavigationSafe();
  const imageEdit = useImageEditCanvasSafe();
  const videoEdit = useVideoEditSafe();

  const isSidePanelLayout = props.showPanel && props.shouldShowSidePanel;
  const isStackedLayout = props.showPanel && !props.shouldShowSidePanel;
  const floatingToolVariant: 'mobile' | 'tablet' = core.isMobile ? 'mobile' : 'tablet';
  const mediaDisplayVariant: 'desktop-side-panel' | 'mobile-stacked' | 'regular-centered' = props.showPanel
    ? (isSidePanelLayout ? 'desktop-side-panel' : 'mobile-stacked')
    : 'regular-centered';
  const mediaDisplayContainerClassName = isSidePanelLayout
    ? 'max-w-full max-h-full'
    : 'w-full h-full';
  const mediaDisplayDebugContext = props.showPanel
    ? (isSidePanelLayout ? 'Desktop' : 'Mobile Stacked')
    : 'Regular Centered';
  const topCenterClassName = isStackedLayout
    ? 'absolute top-4 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2'
    : 'absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2';

  return {
    props,
    core,
    mediaState,
    variantsState,
    navigation,
    imageEdit,
    videoEdit,
    isSidePanelLayout,
    isStackedLayout,
    floatingToolVariant,
    mediaDisplayVariant,
    mediaDisplayContainerClassName,
    mediaDisplayDebugContext,
    topCenterClassName,
  };
}

type LightboxLayoutModel = ReturnType<typeof useLightboxLayoutModel>;

function MediaContent({ model }: { model: LightboxLayoutModel }) {
  const { mediaState, variantsState, videoEdit } = model;

  if (mediaState.isVideo && videoEdit.isVideoEditModeActive && videoEdit.videoEditing) {
    return (
      <VideoEditModeDisplay
        videoRef={videoEdit.videoEditing.videoRef}
        videoUrl={mediaState.effectiveVideoUrl}
        posterUrl={variantsState.activeVariant?.thumbnail_url || mediaState.media.thumbUrl}
        videoDuration={videoEdit.videoDuration}
        onLoadedMetadata={videoEdit.setVideoDuration}
        selections={videoEdit.videoEditing.selections}
        activeSelectionId={videoEdit.videoEditing.activeSelectionId}
        onSelectionChange={videoEdit.videoEditing.handleUpdateSelection}
        onSelectionClick={videoEdit.videoEditing.setActiveSelectionId}
        onRemoveSelection={videoEdit.videoEditing.handleRemoveSelection}
        onAddSelection={videoEdit.videoEditing.handleAddSelection}
      />
    );
  }

  if (mediaState.isVideo && videoEdit.isVideoTrimModeActive) {
    return (
      <VideoTrimModeDisplay
        videoRef={videoEdit.trimVideoRef}
        videoUrl={mediaState.effectiveVideoUrl}
        posterUrl={variantsState.activeVariant?.thumbnail_url || mediaState.media.thumbUrl}
        trimState={videoEdit.trimState}
        onLoadedMetadata={videoEdit.setVideoDuration}
        onTimeUpdate={videoEdit.setTrimCurrentTime}
      />
    );
  }

  return (
    <MediaDisplayWithCanvas
      effectiveImageUrl={mediaState.isVideo ? mediaState.effectiveVideoUrl : mediaState.effectiveMediaUrl}
      thumbUrl={variantsState.activeVariant?.thumbnail_url || mediaState.media.thumbUrl}
      isVideo={mediaState.isVideo}
      onImageLoad={mediaState.setImageDimensions}
      onVideoLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (Number.isFinite(video.duration) && video.duration > 0) {
          videoEdit.setVideoDuration(video.duration);
        }
      }}
      variant={model.mediaDisplayVariant}
      containerClassName={model.mediaDisplayContainerClassName}
      tasksPaneWidth={model.isSidePanelLayout && model.props.effectiveTasksPaneOpen ? model.props.effectiveTasksPaneWidth : 0}
      debugContext={model.mediaDisplayDebugContext}
      imageDimensions={mediaState.effectiveImageDimensions}
    />
  );
}

function TopCenterOverlay({ model, className }: { model: LightboxLayoutModel; className: string }) {
  return (
    <div className={className}>
      {model.props.adjacentSegments && !model.mediaState.isVideo && (
        <AdjacentSegmentNavigation adjacentSegments={model.props.adjacentSegments} />
      )}
      {model.mediaState.isVideo && model.props.segmentSlotMode?.adjacentVideoThumbnails && model.props.segmentSlotMode?.onOpenPreviewDialog && (
        <PreviewSequencePill
          adjacentVideoThumbnails={model.props.segmentSlotMode.adjacentVideoThumbnails}
          onOpenPreviewDialog={model.props.segmentSlotMode.onOpenPreviewDialog}
        />
      )}
      <VariantOverlayBadge
        activeVariant={model.variantsState.activeVariant ?? undefined}
        variants={model.variantsState.variants}
        readOnly={model.core.readOnly}
        isMakingMainVariant={model.variantsState.isMakingMainVariant}
        canMakeMainVariant={model.variantsState.canMakeMainVariant}
        onMakeMainVariant={model.variantsState.handleMakeMainVariant}
      />
    </div>
  );
}

function OverlayElements({ model, topCenterClassName, showFloatingTools }: {
  model: LightboxLayoutModel;
  topCenterClassName: string;
  showFloatingTools: boolean;
}) {
  const { core, mediaState, variantsState, props } = model;
  const buttonGroups = props.buttonGroups;

  return (
    <>
      <TopCenterOverlay model={model} className={topCenterClassName} />

      <NewImageOverlayButton
        isVideo={mediaState.isVideo}
        readOnly={core.readOnly}
        activeVariantId={variantsState.activeVariant?.id}
        primaryVariantId={variantsState.primaryVariant?.id}
        selectedProjectId={core.selectedProjectId}
        isPromoting={variantsState.isPromoting}
        promoteSuccess={variantsState.promoteSuccess}
        onPromote={variantsState.handlePromoteToGeneration}
      />

      {showFloatingTools && model.imageEdit.isSpecialEditMode && (
        <FloatingToolControls variant={model.floatingToolVariant} />
      )}

      <BottomLeftControls {...buttonGroups.bottomLeft} />
      <BottomRightControls {...buttonGroups.bottomRight} />
      <TopRightControls {...buttonGroups.topRight} />

      {props.segmentSlotMode?.onNavigateToImage && (
        <ConstituentImageNavigation
          startImageId={props.segmentSlotMode.pairData.startImage?.id}
          endImageId={props.segmentSlotMode.pairData.endImage?.id}
          startImageUrl={props.segmentSlotMode.pairData.startImage?.thumbUrl || props.segmentSlotMode.pairData.startImage?.url}
          endImageUrl={props.segmentSlotMode.pairData.endImage?.thumbUrl || props.segmentSlotMode.pairData.endImage?.url}
          onNavigateToImage={props.segmentSlotMode.onNavigateToImage}
          variant="overlay"
        />
      )}

      <WorkflowControlsBar {...props.workflowBar} />
    </>
  );
}

function CompactEditControls({ model }: { model: LightboxLayoutModel }) {
  const { core, imageEdit } = model;
  if (core.readOnly || !imageEdit.isSpecialEditMode || imageEdit.editMode === 'text') return null;

  return (
    <div className="absolute top-20 left-4 z-[70] select-none" onClick={(event) => event.stopPropagation()}>
      <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
        {imageEdit.editMode === 'inpaint' && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Size:</label>
              <span className="text-xs text-muted-foreground">{imageEdit.brushSize}px</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              value={imageEdit.brushSize}
              onChange={(event) => imageEdit.setBrushSize(parseInt(event.target.value, 10))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        )}

        {imageEdit.editMode === 'inpaint' && (
          <Button
            variant={imageEdit.isEraseMode ? 'default' : 'secondary'}
            size="sm"
            onClick={() => imageEdit.setIsEraseMode(!imageEdit.isEraseMode)}
            className={cn('w-full text-xs h-7', imageEdit.isEraseMode && 'bg-purple-600 hover:bg-purple-700')}
          >
            <Eraser className="h-3 w-3 mr-1" />
            {imageEdit.isEraseMode ? 'Erase' : 'Paint'}
          </Button>
        )}

        {imageEdit.editMode === 'annotate' && (
          <div className="flex gap-1">
            <Button variant="default" size="sm" className="flex-1 text-xs h-7" disabled>
              <Square className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={imageEdit.handleUndo}
                disabled={imageEdit.brushStrokes.length === 0}
                className="flex-1 text-xs h-7"
              >
                <Undo2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">Undo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={imageEdit.handleClearMask}
                disabled={imageEdit.brushStrokes.length === 0}
                className="flex-1 text-xs h-7"
              >
                <X className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">Clear all</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function PanelLayoutView({ model }: { model: LightboxLayoutModel }) {
  const isDesktopPanel = model.isSidePanelLayout;
  const showAnnotationControls = model.imageEdit.isSpecialEditMode && model.imageEdit.editMode === 'annotate';

  return (
    <div
      data-lightbox-bg
      className={cn('w-full h-full bg-black/90', isDesktopPanel ? 'flex' : 'flex flex-col')}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        data-lightbox-bg
        className={cn('flex items-center justify-center relative overflow-hidden', isDesktopPanel ? 'flex-1 touch-none' : 'flex-none touch-none z-10')}
        style={isDesktopPanel
          ? { width: '60%' }
          : {
              height: '50%',
              transform: model.navigation.swipeNavigation.isSwiping
                ? `translateX(${model.navigation.swipeNavigation.swipeOffset}px)`
                : undefined,
              transition: model.navigation.swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
            }}
        onClick={(event) => event.stopPropagation()}
        {...(!isDesktopPanel ? model.navigation.swipeNavigation.swipeHandlers : {})}
      >
        {isDesktopPanel && (
          <NavigationArrows
            showNavigation={model.navigation.showNavigation}
            readOnly={model.core.readOnly}
            onPrevious={model.navigation.handleSlotNavPrev}
            onNext={model.navigation.handleSlotNavNext}
            hasPrevious={model.navigation.hasPrevious}
            hasNext={model.navigation.hasNext}
            variant="desktop"
          />
        )}

        <MediaContent model={model} />
        {showAnnotationControls && (
          <AnnotationFloatingControls
            selectedShapeId={model.imageEdit.selectedShapeId}
            isAnnotateMode={model.imageEdit.isAnnotateMode}
            brushStrokes={model.imageEdit.brushStrokes}
            getDeleteButtonPosition={model.imageEdit.getDeleteButtonPosition}
            onToggleFreeForm={model.imageEdit.handleToggleFreeForm}
            onDeleteSelected={model.imageEdit.handleDeleteSelected}
            positionStrategy="fixed"
            freeFormActiveClassName="bg-purple-600 hover:bg-purple-700 text-white"
            freeFormInactiveClassName="bg-gray-700 hover:bg-gray-600 text-white"
            deleteButtonClassName="bg-red-600 hover:bg-red-700 text-white"
          />
        )}
        <OverlayElements model={model} topCenterClassName={model.topCenterClassName} showFloatingTools={true} />

        {!isDesktopPanel && (
          <NavigationArrows
            showNavigation={model.navigation.showNavigation}
            readOnly={model.core.readOnly}
            onPrevious={model.navigation.handleSlotNavPrev}
            onNext={model.navigation.handleSlotNavNext}
            hasPrevious={model.navigation.hasPrevious}
            hasNext={model.navigation.hasNext}
            variant="mobile"
          />
        )}
      </div>

      <div
        data-task-details-panel
        className={cn('bg-background overflow-hidden relative z-[60] overscroll-none', isDesktopPanel ? 'border-l border-border h-full' : 'border-t border-border overflow-y-auto')}
        style={isDesktopPanel ? { width: '40%' } : { height: '50%' }}
      >
        {model.props.controlsPanelContent}
      </div>
    </div>
  );
}

function CenteredLayoutView({ model }: { model: LightboxLayoutModel }) {
  const workflowControlsProps = model.props.workflowControls ?? null;
  const showAnnotationControls = model.imageEdit.isSpecialEditMode && model.imageEdit.editMode === 'annotate';

  return (
    <div
      data-lightbox-bg
      className="relative flex flex-col items-center gap-3 sm:gap-4 md:gap-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 w-full h-full touch-none"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        data-lightbox-bg
        className={cn(
          'relative flex items-center justify-center max-w-full my-auto',
          model.core.isMobile && model.imageEdit.isInpaintMode && 'pointer-events-auto',
          'touch-none'
        )}
        style={{
          height: 'calc(100vh - 220px)',
          maxHeight: 'calc(100vh - 220px)',
          transform: model.navigation.swipeNavigation.isSwiping
            ? `translateX(${model.navigation.swipeNavigation.swipeOffset}px)`
            : undefined,
          transition: model.navigation.swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onClick={(event) => event.stopPropagation()}
        {...model.navigation.swipeNavigation.swipeHandlers}
      >
        <MediaContent model={model} />
        {showAnnotationControls && (
          <AnnotationFloatingControls
            selectedShapeId={model.imageEdit.selectedShapeId}
            isAnnotateMode={model.imageEdit.isAnnotateMode}
            brushStrokes={model.imageEdit.brushStrokes}
            getDeleteButtonPosition={model.imageEdit.getDeleteButtonPosition}
            onToggleFreeForm={model.imageEdit.handleToggleFreeForm}
            onDeleteSelected={model.imageEdit.handleDeleteSelected}
            positionStrategy="fixed"
            freeFormActiveClassName="bg-purple-600 hover:bg-purple-700 text-white"
            freeFormInactiveClassName="bg-gray-700 hover:bg-gray-600 text-white"
            deleteButtonClassName="bg-red-600 hover:bg-red-700 text-white"
          />
        )}
        <OverlayElements
          model={model}
          topCenterClassName="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2"
          showFloatingTools={false}
        />
        <CompactEditControls model={model} />

        <NavigationArrows
          showNavigation={model.navigation.showNavigation}
          readOnly={model.core.readOnly}
          onPrevious={model.navigation.handleSlotNavPrev}
          onNext={model.navigation.handleSlotNavNext}
          hasPrevious={model.navigation.hasPrevious}
          hasNext={model.navigation.hasNext}
          variant="mobile"
        />
      </div>

      {!model.core.readOnly && !model.imageEdit.isSpecialEditMode && workflowControlsProps && (
        <div className="w-full" onClick={(event) => event.stopPropagation()}>
          <WorkflowControls {...workflowControlsProps} />
        </div>
      )}
    </div>
  );
}

export const LightboxLayout: React.FC<LightboxLayoutProps> = (props) => {
  const model = useLightboxLayoutModel(props);
  return props.showPanel
    ? <PanelLayoutView model={model} />
    : <CenteredLayoutView model={model} />;
};
