import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Type, Paintbrush, Pencil, Move, Wand2 } from 'lucide-react';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useImageEditCanvasSafe } from '../contexts/ImageEditCanvasContext';
import { BrushSizeSlider } from './controls/BrushSizeSlider';
import { PaintEraseToggle } from './controls/PaintEraseToggle';
import { AnnotationModeToggle } from './controls/AnnotationModeToggle';
import { UndoClearButtons } from './controls/UndoClearButtons';
import { PositionToggleButton } from './controls/PositionToggleButton';
import { RepositionControls } from './controls/RepositionControls';
interface FloatingToolControlsProps {
  variant: 'tablet' | 'mobile';
}

/**
 * Floating Tool Controls Component
 *
 * Displays mode selection toggle and mode-specific canvas controls.
 * Includes mode toggle (Text/Inpaint/Annotate/Reposition/Img2Img) at the top.
 * Used on both tablet (landscape, with sidebar) and mobile (portrait, no sidebar).
 *
 * Uses ImageEditContext for edit state (mode, brush, annotations).
 * Receives only specialized reposition handlers as props.
 */
export const FloatingToolControls: React.FC<FloatingToolControlsProps> = ({
  variant,
}) => {
  // Get canvas/tool state from context (includes reposition handlers)
  const {
    editMode,
    setEditMode,
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    annotationMode,
    setAnnotationMode,
    brushStrokes,
    handleUndo,
    handleClearMask,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    repositionTransform,
    setScale: onRepositionScaleChange,
    setRotation: onRepositionRotationChange,
    toggleFlipH: onRepositionFlipH,
    toggleFlipV: onRepositionFlipV,
    resetTransform: onRepositionReset,
  } = useImageEditCanvasSafe();

  const isTablet = variant === 'tablet';
  const isMobile = useIsMobile();

  // Map panel position (context uses 'left'/'right', this component uses 'top'/'bottom')
  // Note: The context stores 'left'/'right' but we display as 'top'/'bottom' for the floating panel
  const panelPosition = inpaintPanelPosition === 'left' ? 'top' : 'bottom';
  const onSetPanelPosition = (position: 'top' | 'bottom') => {
    setInpaintPanelPosition(position === 'top' ? 'left' : 'right');
  };

  // Variant-specific styling - widened for 5 mode buttons
  const containerWidth = isTablet ? 'w-48' : 'w-40';
  const leftPosition = isTablet ? 'left-4' : 'left-2';
  const topBottomPosition = isTablet
    ? (panelPosition === 'top' ? 'top-16' : 'bottom-4')
    : (panelPosition === 'top' ? 'top-14' : 'bottom-2');

  const iconSize = isTablet ? 'h-4 w-4' : 'h-3.5 w-3.5';

  // Handle edit mode changes
  const handleSetEditMode = (mode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img') => {
    setEditMode(mode);
  };

  return (
    <div className={cn("absolute z-[70]", leftPosition, topBottomPosition)}>
      {/* Position Toggle Button - at top when panel is at bottom */}
      {panelPosition === 'bottom' && (
        <PositionToggleButton
          direction="up"
          onClick={() => onSetPanelPosition('top')}
        />
      )}

      <div className={cn(
        "bg-background backdrop-blur-md rounded-lg p-2 space-y-1.5 border border-border shadow-xl",
        containerWidth
      )}>
        {/* Mode Toggle - Text | Inpaint | Annotate | Reposition | Img2Img */}
        {/* Mobile: 3+2 grid, Tablet: 5 in a row */}
        <div className={cn(
          "bg-muted rounded-md p-1",
          isMobile ? "grid grid-cols-3 gap-0.5" : "flex items-center gap-0.5"
        )}>
          <button
            onClick={() => handleSetEditMode('text')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'text'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Text mode"
          >
            <Type className={iconSize} />
          </button>
          <button
            onClick={() => handleSetEditMode('inpaint')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'inpaint'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Inpaint mode"
          >
            <Paintbrush className={iconSize} />
          </button>
          <button
            onClick={() => handleSetEditMode('annotate')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'annotate'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Annotate mode"
          >
            <Pencil className={iconSize} />
          </button>
          <button
            onClick={() => handleSetEditMode('reposition')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'reposition'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Reposition mode - move, scale, rotate to fill edges with AI"
          >
            <Move className={iconSize} />
          </button>
          <button
            onClick={() => handleSetEditMode('img2img')}
            className={cn(
              "flex-1 flex items-center justify-center p-2 rounded transition-all",
              editMode === 'img2img'
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
            title="Img2Img mode - transform entire image with prompt"
          >
            <Wand2 className={iconSize} />
          </button>
        </div>

        {/* Inpaint Mode Controls */}
        {editMode === 'inpaint' && (
          <>
            <BrushSizeSlider
              value={brushSize}
              onChange={setBrushSize}
              variant={variant}
            />
            <PaintEraseToggle
              isEraseMode={isEraseMode}
              onToggle={setIsEraseMode}
              variant={variant}
            />
          </>
        )}

        {/* Annotate Mode Controls */}
        {editMode === 'annotate' && (
          <AnnotationModeToggle
            mode={annotationMode}
            onChange={setAnnotationMode}
            variant={variant}
          />
        )}

        {/* Reposition Mode Controls */}
        {editMode === 'reposition' && repositionTransform && (
          <RepositionControls
            transform={repositionTransform}
            onScaleChange={onRepositionScaleChange}
            onRotationChange={onRepositionRotationChange}
            onFlipH={onRepositionFlipH}
            onFlipV={onRepositionFlipV}
            onReset={onRepositionReset}
            variant={variant}
          />
        )}

        {/* Common Controls - Undo & Clear (only for inpaint and annotate modes) */}
        {(editMode === 'inpaint' || editMode === 'annotate') && (
          <UndoClearButtons
            onUndo={handleUndo}
            onClear={handleClearMask}
            disabled={brushStrokes.length === 0}
            variant={variant}
          />
        )}
      </div>

      {/* Position Toggle Button - at bottom when panel is at top */}
      {panelPosition === 'top' && (
        <PositionToggleButton
          direction="down"
          onClick={() => onSetPanelPosition('bottom')}
        />
      )}
    </div>
  );
};
