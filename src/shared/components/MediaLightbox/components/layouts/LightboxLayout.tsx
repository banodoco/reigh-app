/**
 * LightboxLayout - Unified layout for all lightbox configurations
 *
 * Replaces DesktopSidePanelLayout, MobileStackedLayout, and CenteredLayout.
 * All conditional rendering derives from two values:
 *   - showPanel: whether the controls panel renders
 *   - shouldShowSidePanel: whether the panel goes right (side-by-side) or bottom (stacked)
 */

import React from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Eraser, Square, Undo2, X, Diamond, Trash2 } from 'lucide-react';
import type { LightboxLayoutProps } from './types';

// Context hooks
import {
  useLightboxCoreSafe,
  useLightboxMediaSafe,
  useLightboxVariantsSafe,
  useLightboxNavigationSafe,
  useLightboxEditSafe,
} from '../../contexts/LightboxStateContext';

// Sub-components
import { VariantOverlayBadge } from './VariantOverlayBadge';
import { NewImageOverlayButton } from './NewImageOverlayButton';
import { AdjacentSegmentNavigation } from './AdjacentSegmentNavigation';
import { ConstituentImageNavigation } from './ConstituentImageNavigation';

// Existing components
import { NavigationArrows } from '../NavigationArrows';
import { FloatingToolControls } from '../FloatingToolControls';
import {
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
} from '../ButtonGroups';
import { ControlsPanel } from '../ControlsPanel';
import { MediaDisplayWithCanvas } from '../MediaDisplayWithCanvas';
import { VideoEditModeDisplay } from '../VideoEditModeDisplay';
import { VideoTrimModeDisplay } from '../VideoTrimModeDisplay';
import { WorkflowControls } from '../WorkflowControls';
import { WorkflowControlsBar } from '../WorkflowControlsBar';

export const LightboxLayout: React.FC<LightboxLayoutProps> = (props) => {
  // ========================================
  // CONTEXT STATE
  // ========================================
  const core = useLightboxCoreSafe();
  const mediaState = useLightboxMediaSafe();
  const variantsState = useLightboxVariantsSafe();
  const navigation = useLightboxNavigationSafe();
  const editState = useLightboxEditSafe();

  const { onClose, readOnly, isMobile, actualGenerationId, selectedProjectId } = core;
  const { media, isVideo, effectiveMediaUrl, effectiveVideoUrl, imageDimensions, setImageDimensions, effectiveImageDimensions } = mediaState;
  const { variants, activeVariant, primaryVariant, promoteSuccess, isPromoting, handlePromoteToGeneration, isMakingMainVariant, canMakeMainVariant, handleMakeMainVariant } = variantsState;
  const { showNavigation, hasNext, hasPrevious, handleSlotNavNext, handleSlotNavPrev, swipeNavigation } = navigation;
  const { isInpaintMode, isSpecialEditMode, editMode } = editState;

  // ========================================
  // PROPS
  // ========================================
  const {
    showPanel,
    shouldShowSidePanel,

    // Video edit
    isVideoTrimModeActive,
    isVideoEditModeActive,
    trimVideoRef,
    trimState,
    setVideoDuration,
    setTrimCurrentTime,
    videoEditing,

    // Canvas/annotation
    isAnnotateMode,
    brushStrokes,
    currentStroke,
    isDrawing,
    isEraseMode,
    setIsEraseMode,
    brushSize,
    setBrushSize,
    annotationMode,
    selectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    strokeOverlayRef,
    handleUndo,
    handleClearMask,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    imageContainerRef,
    canvasRef,
    maskCanvasRef,
    isFlippedHorizontally,
    isSaving,

    // Panel state
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,

    // Reposition rotation (for corner drag-to-rotate)
    onRepositionRotationChange,
    repositionRotation,

    // Reposition scale (for +/- zoom buttons on image)
    onRepositionScaleChange,
    repositionScale,

    // Composed prop objects
    buttonGroupProps,
    workflowBarProps,
    floatingToolProps,
    controlsPanelProps,

    // Workflow controls (below media, centered only)
    workflowControlsProps,

    // Special navigation
    adjacentSegments,
    segmentSlotMode,
  } = props;

  // ========================================
  // DERIVED LAYOUT VALUES
  // ========================================
  // shouldShowSidePanel = side-by-side (iPad landscape, desktop); !shouldShowSidePanel && showPanel = stacked (mobile/portrait)
  const isSidePanelLayout = showPanel && shouldShowSidePanel;
  const isStackedLayout = showPanel && !shouldShowSidePanel;

  const enableSwipe = !showPanel || !shouldShowSidePanel;
  const navArrowVariant = isSidePanelLayout ? 'desktop' : 'mobile';
  const floatingToolVariant = isMobile ? 'mobile' : 'tablet';

  // MediaDisplayWithCanvas variant/container
  const mediaDisplayVariant = showPanel
    ? (isSidePanelLayout ? 'desktop-side-panel' : 'mobile-stacked')
    : 'regular-centered';
  const mediaDisplayContainerClassName = isSidePanelLayout
    ? 'max-w-full max-h-full'
    : 'w-full h-full';
  const mediaDisplayDebugContext = showPanel
    ? (isSidePanelLayout ? 'Desktop' : 'Mobile Stacked')
    : 'Regular Centered';

  // Top center offset: stacked layout uses responsive top-4 md:top-16
  const topCenterClassName = isStackedLayout
    ? 'absolute top-4 md:top-16 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2'
    : 'absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2';

  // ========================================
  // SHARED MEDIA CONTENT RENDERING
  // ========================================
  const renderMediaContent = () => {
    if (isVideo && isVideoEditModeActive && videoEditing) {
      return (
        <VideoEditModeDisplay
          videoRef={videoEditing.videoRef}
          videoUrl={effectiveVideoUrl}
          posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
          videoDuration={trimState.videoDuration}
          onLoadedMetadata={setVideoDuration}
          selections={videoEditing.selections}
          activeSelectionId={videoEditing.activeSelectionId}
          onSelectionChange={videoEditing.handleUpdateSelection}
          onSelectionClick={videoEditing.setActiveSelectionId}
          onRemoveSelection={videoEditing.handleRemoveSelection}
          onAddSelection={videoEditing.handleAddSelection}
        />
      );
    }

    if (isVideo && isVideoTrimModeActive) {
      return (
        <VideoTrimModeDisplay
          videoRef={trimVideoRef}
          videoUrl={effectiveVideoUrl}
          posterUrl={activeVariant?.thumbnail_url || media.thumbUrl}
          trimState={trimState}
          onLoadedMetadata={setVideoDuration}
          onTimeUpdate={setTrimCurrentTime}
        />
      );
    }

    // All layouts route through MediaDisplayWithCanvas (handles StyledVideoPlayer internally)
    return (
      <MediaDisplayWithCanvas
        effectiveImageUrl={isVideo ? effectiveVideoUrl : effectiveMediaUrl}
        thumbUrl={activeVariant?.thumbnail_url || media.thumbUrl}
        isVideo={isVideo}
        isFlippedHorizontally={isFlippedHorizontally}
        isSaving={isSaving}
        isInpaintMode={isInpaintMode}
        editMode={editMode}
        repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
        repositionDragHandlers={editMode === 'reposition' ? repositionDragHandlers : undefined}
        isRepositionDragging={isRepositionDragging}
        onRepositionRotationChange={editMode === 'reposition' ? onRepositionRotationChange : undefined}
        repositionRotation={repositionRotation}
        onRepositionScaleChange={editMode === 'reposition' ? onRepositionScaleChange : undefined}
        repositionScale={repositionScale}
        imageContainerRef={imageContainerRef}
        canvasRef={canvasRef}
        maskCanvasRef={maskCanvasRef}
        onImageLoad={setImageDimensions}
        onVideoLoadedMetadata={(e) => {
          const video = e.currentTarget;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setVideoDuration(video.duration);
          }
        }}
        variant={mediaDisplayVariant}
        containerClassName={mediaDisplayContainerClassName}
        tasksPaneWidth={isSidePanelLayout && effectiveTasksPaneOpen ? effectiveTasksPaneWidth : 0}
        debugContext={mediaDisplayDebugContext}
        // Konva-based stroke overlay props
        imageDimensions={effectiveImageDimensions}
        brushStrokes={brushStrokes}
        currentStroke={currentStroke}
        isDrawing={isDrawing}
        isEraseMode={isEraseMode}
        brushSize={brushSize}
        annotationMode={editMode === 'annotate' ? annotationMode : null}
        selectedShapeId={selectedShapeId}
        onStrokePointerDown={handleKonvaPointerDown}
        onStrokePointerMove={handleKonvaPointerMove}
        onStrokePointerUp={handleKonvaPointerUp}
        onShapeClick={handleShapeClick}
        strokeOverlayRef={strokeOverlayRef}
      />
    );
  };

  // ========================================
  // SHARED ANNOTATION BUTTONS
  // ========================================
  const renderAnnotationButtons = () => {
    if (!selectedShapeId || !isAnnotateMode) return null;

    const buttonPos = getDeleteButtonPosition();
    if (!buttonPos) return null;

    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    const isFreeForm = selectedShape?.isFreeForm || false;

    return (
      <div className="fixed z-[100] flex gap-2" style={{
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        transform: 'translate(-50%, -50%)'
      }}>
        <button
          onClick={handleToggleFreeForm}
          className={cn(
            "rounded-full p-2 shadow-lg transition-colors",
            isFreeForm
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-gray-700 hover:bg-gray-600 text-white"
          )}
          title={isFreeForm
            ? "Switch to rectangle mode (edges move linearly)"
            : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
        >
          {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
        <button
          onClick={handleDeleteSelected}
          className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
          title="Delete annotation (or press DELETE key)"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  // ========================================
  // RENDER
  // ========================================

  if (showPanel) {
    // ======== PANEL LAYOUT (Desktop side panel / Mobile stacked) ========
    const isDesktopPanel = isSidePanelLayout;

    return (
      <div
        data-lightbox-bg
        className={cn(
          "w-full h-full bg-black/90",
          isDesktopPanel ? "flex" : "flex flex-col"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media section */}
        <div
          data-lightbox-bg
          className={cn(
            "flex items-center justify-center relative overflow-hidden",
            isDesktopPanel
              ? "flex-1"
              : "flex-none touch-pan-y z-10"
          )}
          style={isDesktopPanel
            ? { width: '60%' }
            : {
                height: '50%',
                transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
                transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
              }
          }
          onClick={(e) => e.stopPropagation()}
          {...(!isDesktopPanel ? swipeNavigation.swipeHandlers : {})}
        >
          {/* Desktop: nav arrows before media */}
          {isDesktopPanel && (
            <NavigationArrows
              showNavigation={showNavigation}
              readOnly={readOnly}
              onPrevious={handleSlotNavPrev}
              onNext={handleSlotNavNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              variant="desktop"
            />
          )}

          {renderMediaContent()}
          {renderAnnotationButtons()}

          {/* Top Center - segment nav + variant badge */}
          <div className={topCenterClassName}>
            {adjacentSegments && !isVideo && (
              <AdjacentSegmentNavigation adjacentSegments={adjacentSegments} />
            )}
            <VariantOverlayBadge
              activeVariant={activeVariant}
              variants={variants}
              readOnly={readOnly}
              isMakingMainVariant={isMakingMainVariant}
              canMakeMainVariant={canMakeMainVariant}
              onMakeMainVariant={handleMakeMainVariant}
            />
          </div>

          {/* Top Left - New image button */}
          <NewImageOverlayButton
            isVideo={isVideo}
            readOnly={readOnly}
            activeVariantId={activeVariant?.id}
            primaryVariantId={primaryVariant?.id}
            selectedProjectId={selectedProjectId}
            isPromoting={isPromoting}
            promoteSuccess={promoteSuccess}
            onPromote={handlePromoteToGeneration}
          />

          {/* Floating Tool Controls (panel layouts only) */}
          {isSpecialEditMode && floatingToolProps && (
            <FloatingToolControls
              variant={floatingToolVariant}
              repositionTransform={floatingToolProps.repositionTransform}
              onRepositionScaleChange={floatingToolProps.onRepositionScaleChange}
              onRepositionRotationChange={floatingToolProps.onRepositionRotationChange}
              onRepositionFlipH={floatingToolProps.onRepositionFlipH}
              onRepositionFlipV={floatingToolProps.onRepositionFlipV}
              onRepositionReset={floatingToolProps.onRepositionReset}
            />
          )}

          {/* Button Groups */}
          <BottomLeftControls {...buttonGroupProps.bottomLeft} />
          <BottomRightControls {...buttonGroupProps.bottomRight} />
          <TopRightControls {...buttonGroupProps.topRight} />

          {/* Constituent Image Navigation */}
          {segmentSlotMode?.onNavigateToImage && (
            <ConstituentImageNavigation
              startImageId={segmentSlotMode.pairData.startImage?.id}
              endImageId={segmentSlotMode.pairData.endImage?.id}
              startImageUrl={segmentSlotMode.pairData.startImage?.thumbUrl || segmentSlotMode.pairData.startImage?.url}
              endImageUrl={segmentSlotMode.pairData.endImage?.thumbUrl || segmentSlotMode.pairData.endImage?.url}
              onNavigateToImage={segmentSlotMode.onNavigateToImage}
              variant="overlay"
            />
          )}

          {/* Bottom Workflow Controls Bar */}
          <WorkflowControlsBar
            onAddToShot={workflowBarProps.onAddToShot}
            onDelete={workflowBarProps.onDelete}
            onApplySettings={workflowBarProps.onApplySettings}
            isSpecialEditMode={isSpecialEditMode}
            isVideo={isVideo}
            mediaId={actualGenerationId}
            imageUrl={effectiveMediaUrl}
            thumbUrl={media.thumbUrl}
            allShots={workflowBarProps.allShots}
            selectedShotId={workflowBarProps.selectedShotId}
            onShotChange={workflowBarProps.onShotChange}
            onCreateShot={workflowBarProps.onCreateShot}
            isAlreadyPositionedInSelectedShot={workflowBarProps.isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={workflowBarProps.isAlreadyAssociatedWithoutPosition}
            showTickForImageId={workflowBarProps.showTickForImageId}
            showTickForSecondaryImageId={workflowBarProps.showTickForSecondaryImageId}
            onAddToShotWithoutPosition={workflowBarProps.onAddToShotWithoutPosition}
            onShowTick={workflowBarProps.onShowTick}
            onShowSecondaryTick={workflowBarProps.onShowSecondaryTick}
            onOptimisticPositioned={workflowBarProps.onOptimisticPositioned}
            onOptimisticUnpositioned={workflowBarProps.onOptimisticUnpositioned}
            contentRef={workflowBarProps.contentRef}
            handleApplySettings={workflowBarProps.handleApplySettings}
            onNavigateToShot={workflowBarProps.handleNavigateToShotFromSelector}
            onClose={onClose}
            onAddVariantAsNewGeneration={workflowBarProps.handleAddVariantAsNewGenerationToShot}
            activeVariantId={activeVariant?.id || primaryVariant?.id}
            currentTimelineFrame={media.timeline_frame}
          />

          {/* Stacked: nav arrows after media */}
          {!isDesktopPanel && (
            <NavigationArrows
              showNavigation={showNavigation}
              readOnly={readOnly}
              onPrevious={handleSlotNavPrev}
              onNext={handleSlotNavNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              variant="mobile"
            />
          )}
        </div>

        {/* Controls Panel */}
        <div
          data-task-details-panel
          className={cn(
            "bg-background overflow-hidden relative z-[60] overscroll-contain",
            isDesktopPanel
              ? "border-l border-border h-full"
              : "border-t border-border overflow-y-auto"
          )}
          style={isDesktopPanel ? { width: '40%' } : { height: '50%' }}
        >
          <ControlsPanel
            variant={isDesktopPanel ? 'desktop' : 'mobile'}
            {...controlsPanelProps!}
          />
        </div>
      </div>
    );
  }

  // ======== CENTERED LAYOUT (no panel) ========
  return (
    <div
      data-lightbox-bg
      className="relative flex flex-col items-center gap-3 sm:gap-4 md:gap-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 w-full h-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Media Container with swipe navigation */}
      <div
        data-lightbox-bg
        className={cn(
          "relative flex items-center justify-center max-w-full my-auto",
          isMobile && isInpaintMode && "pointer-events-auto",
          "touch-pan-y"
        )}
        style={{
          height: 'calc(100vh - 220px)',
          maxHeight: 'calc(100vh - 220px)',
          transform: swipeNavigation.isSwiping ? `translateX(${swipeNavigation.swipeOffset}px)` : undefined,
          transition: swipeNavigation.isSwiping ? 'none' : 'transform 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
        {...swipeNavigation.swipeHandlers}
      >
        {renderMediaContent()}
        {renderAnnotationButtons()}

        {/* Top Center - segment nav + variant badge */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] flex flex-col items-center gap-2">
          {adjacentSegments && !isVideo && (
            <AdjacentSegmentNavigation adjacentSegments={adjacentSegments} />
          )}
          <VariantOverlayBadge
            activeVariant={activeVariant}
            variants={variants}
            readOnly={readOnly}
            isMakingMainVariant={isMakingMainVariant}
            canMakeMainVariant={canMakeMainVariant}
            onMakeMainVariant={handleMakeMainVariant}
          />
        </div>

        {/* Top Left - New image button */}
        <NewImageOverlayButton
          isVideo={isVideo}
          readOnly={readOnly}
          activeVariantId={activeVariant?.id}
          primaryVariantId={primaryVariant?.id}
          selectedProjectId={selectedProjectId}
          isPromoting={isPromoting}
          promoteSuccess={promoteSuccess}
          onPromote={handlePromoteToGeneration}
        />

        {/* Compact Edit Controls (centered layout only, no panel to hold them) */}
        {!readOnly && isSpecialEditMode && editMode !== 'text' && (
          <div
            className="absolute top-20 left-4 z-[70] select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 w-40 border border-border shadow-xl">
              {/* Brush Size Slider - Only in Inpaint mode */}
              {editMode === 'inpaint' && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Size:</label>
                    <span className="text-xs text-muted-foreground">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={brushSize}
                    onChange={(e) => setBrushSize!(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              )}

              {/* Paint/Erase Toggle */}
              {editMode === 'inpaint' && (
                <Button
                  variant={isEraseMode ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setIsEraseMode!(!isEraseMode)}
                  className={cn(
                    "w-full text-xs h-7",
                    isEraseMode && "bg-purple-600 hover:bg-purple-700"
                  )}
                >
                  <Eraser className="h-3 w-3 mr-1" />
                  {isEraseMode ? 'Erase' : 'Paint'}
                </Button>
              )}

              {editMode === 'annotate' && (
                <div className="flex gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 text-xs h-7"
                    disabled
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Undo | Clear */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleUndo}
                      disabled={brushStrokes.length === 0}
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
                      onClick={handleClearMask}
                      disabled={brushStrokes.length === 0}
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
        )}

        {/* Button Groups */}
        <TopRightControls {...buttonGroupProps.topRight} />
        <BottomLeftControls {...buttonGroupProps.bottomLeft} />
        <BottomRightControls {...buttonGroupProps.bottomRight} />

        {/* Constituent Image Navigation */}
        {segmentSlotMode?.onNavigateToImage && (
          <ConstituentImageNavigation
            startImageId={segmentSlotMode.pairData.startImage?.id}
            endImageId={segmentSlotMode.pairData.endImage?.id}
            startImageUrl={segmentSlotMode.pairData.startImage?.thumbUrl || segmentSlotMode.pairData.startImage?.url}
            endImageUrl={segmentSlotMode.pairData.endImage?.thumbUrl || segmentSlotMode.pairData.endImage?.url}
            onNavigateToImage={segmentSlotMode.onNavigateToImage}
            variant="overlay"
          />
        )}

        {/* Bottom Workflow Controls Bar */}
        <WorkflowControlsBar
          onAddToShot={workflowBarProps.onAddToShot}
          onDelete={workflowBarProps.onDelete}
          onApplySettings={workflowBarProps.onApplySettings}
          isSpecialEditMode={isSpecialEditMode}
          isVideo={isVideo}
          mediaId={actualGenerationId}
          imageUrl={effectiveMediaUrl}
          thumbUrl={media.thumbUrl}
          allShots={workflowBarProps.allShots}
          selectedShotId={workflowBarProps.selectedShotId}
          onShotChange={workflowBarProps.onShotChange}
          onCreateShot={workflowBarProps.onCreateShot}
          isAlreadyPositionedInSelectedShot={workflowBarProps.isAlreadyPositionedInSelectedShot}
          isAlreadyAssociatedWithoutPosition={workflowBarProps.isAlreadyAssociatedWithoutPosition}
          showTickForImageId={workflowBarProps.showTickForImageId}
          showTickForSecondaryImageId={workflowBarProps.showTickForSecondaryImageId}
          onAddToShotWithoutPosition={workflowBarProps.onAddToShotWithoutPosition}
          onShowTick={workflowBarProps.onShowTick}
          onShowSecondaryTick={workflowBarProps.onShowSecondaryTick}
          onOptimisticPositioned={workflowBarProps.onOptimisticPositioned}
          onOptimisticUnpositioned={workflowBarProps.onOptimisticUnpositioned}
          contentRef={workflowBarProps.contentRef}
          handleApplySettings={workflowBarProps.handleApplySettings}
          onNavigateToShot={workflowBarProps.handleNavigateToShotFromSelector}
          onClose={onClose}
          onAddVariantAsNewGeneration={workflowBarProps.handleAddVariantAsNewGenerationToShot}
          activeVariantId={activeVariant?.id || primaryVariant?.id}
          currentTimelineFrame={media.timeline_frame}
        />

        {/* Navigation Arrows */}
        <NavigationArrows
          showNavigation={showNavigation}
          readOnly={readOnly}
          onPrevious={handleSlotNavPrev}
          onNext={handleSlotNavNext}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          variant="mobile"
        />
      </div>

      {/* Workflow Controls - Below Media (centered layout only) */}
      {!readOnly && !isSpecialEditMode && workflowControlsProps && (
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <WorkflowControls
            mediaId={actualGenerationId}
            imageUrl={effectiveMediaUrl}
            thumbUrl={media.thumbUrl}
            isVideo={isVideo}
            isInpaintMode={isInpaintMode}
            allShots={workflowControlsProps.allShots}
            selectedShotId={workflowControlsProps.selectedShotId}
            onShotChange={workflowControlsProps.onShotChange}
            onCreateShot={workflowControlsProps.onCreateShot}
            contentRef={workflowControlsProps.contentRef}
            isAlreadyPositionedInSelectedShot={workflowControlsProps.isAlreadyPositionedInSelectedShot}
            isAlreadyAssociatedWithoutPosition={workflowControlsProps.isAlreadyAssociatedWithoutPosition}
            showTickForImageId={workflowControlsProps.showTickForImageId}
            showTickForSecondaryImageId={workflowControlsProps.showTickForSecondaryImageId}
            onAddToShot={workflowControlsProps.onAddToShot}
            onAddToShotWithoutPosition={workflowControlsProps.onAddToShotWithoutPosition}
            onShowTick={workflowControlsProps.onShowTick}
            onApplySettings={workflowControlsProps.onApplySettings}
            handleApplySettings={workflowControlsProps.handleApplySettings}
            onDelete={workflowControlsProps.onDelete}
            handleDelete={workflowControlsProps.handleDelete}
            isDeleting={workflowControlsProps.isDeleting}
            onNavigateToShot={workflowControlsProps.handleNavigateToShotFromSelector}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
};
