/**
 * Shared types for MediaLightbox layout components
 */

import React from 'react';
import type { BrushStroke, AnnotationMode } from '../../hooks/useInpainting';
import type { EditMode } from '../../hooks/useGenerationEditSettings';
import type { ControlsPanelProps } from '../ControlsPanel';
import type { StrokeOverlayHandle } from '../StrokeOverlay';
import type { ImageTransform } from '../../hooks/useRepositionMode';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../../types';

/**
 * Video edit mode props
 */
interface LayoutVideoEditProps {
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  trimState: {
    videoDuration: number;
    startTime: number;
    endTime: number;
    setStartTime: (time: number) => void;
    setEndTime: (time: number) => void;
  };
  setVideoDuration: (duration: number) => void;
  setTrimCurrentTime: (time: number) => void;
  videoEditing: {
    videoRef: React.RefObject<HTMLVideoElement>;
    selections: PortionSelection[];
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, start: number, end: number) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
  } | null;
}

/**
 * Edit mode (inpaint/annotate/reposition) props
 */
interface LayoutEditModeProps {
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  isSpecialEditMode: boolean;
  editMode: EditMode | null;
  brushStrokes: BrushStroke[];
  isEraseMode: boolean;
  setIsEraseMode?: (value: boolean) => void;
  brushSize: number;
  setBrushSize?: (size: number) => void;
  annotationMode: AnnotationMode | null;
  setAnnotationMode?: (mode: AnnotationMode | null) => void;
  selectedShapeId: string | null;
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint: () => void;
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  handleUndo: () => void;
  handleClearMask: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
  isRepositionDragging: boolean;
  repositionDragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  } | null;
  getTransformStyle: () => React.CSSProperties;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
}

/**
 * Button group props (from useButtonGroupProps)
 */
interface LayoutButtonGroupProps {
  topLeft: React.ReactNode;
  topRight: React.ReactNode;
  bottomLeft: React.ReactNode;
  bottomRight: React.ReactNode;
}

/**
 * Workflow controls bar props
 */
interface LayoutWorkflowBarProps {
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  onApplySettings?: (metadata: Record<string, unknown>) => void;
  allShots: Array<{ id: string; name: string }>;
  selectedShotId: string | undefined;
  onShotChange?: (shotId: string) => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{ shotId?: string; shotName?: string } | void>;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticUnpositioned?: (imageId: string, shotId: string) => void;
  contentRef: React.RefObject<HTMLDivElement>;
  handleApplySettings: () => void;
  handleNavigateToShotFromSelector?: (shot: { id: string; name: string }) => void;
  handleAddVariantAsNewGenerationToShot?: (shotId: string, variantId: string, currentTimelineFrame?: number) => Promise<boolean>;
}

/**
 * Panel-related props (task pane state)
 */
interface LayoutPanelProps {
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
}

/**
 * Simplified floating tool props as consumed by LightboxLayout
 * (FloatingToolControls reads most state from ImageEditContext)
 */
interface LayoutFloatingToolPropsSimple {
  repositionTransform: ImageTransform;
  onRepositionScaleChange: (value: number) => void;
  onRepositionRotationChange: (value: number) => void;
  onRepositionFlipH: () => void;
  onRepositionFlipV: () => void;
  onRepositionReset: () => void;
}

/**
 * Workflow controls props for below-media controls (centered layout only)
 */
interface LayoutWorkflowControlsProps extends LayoutWorkflowBarProps {
  isDeleting?: string | null;
  handleDelete: () => void;
}

/**
 * Unified layout props for LightboxLayout
 * Combines panel and centered layout needs with a `showPanel` flag.
 */
export interface LightboxLayoutProps extends
  LayoutVideoEditProps,
  LayoutEditModeProps,
  LayoutPanelProps {
  showPanel: boolean;
  /** True when panel should be side-by-side (tablet+ landscape); false = stacked (mobile/portrait) */
  shouldShowSidePanel: boolean;

  // Button groups
  buttonGroupProps: LayoutButtonGroupProps;

  // Workflow controls bar (always present)
  workflowBarProps: LayoutWorkflowBarProps;

  // Reposition rotation (for corner drag-to-rotate on image bounds)
  onRepositionRotationChange?: (degrees: number) => void;
  repositionRotation?: number;

  // Reposition scale (for +/- zoom buttons on image)
  onRepositionScaleChange?: (value: number) => void;
  repositionScale?: number;

  // Floating tool controls (panel layouts only)
  floatingToolProps?: LayoutFloatingToolPropsSimple;

  // Controls panel props (panel layouts only)
  controlsPanelProps?: Omit<ControlsPanelProps, 'variant'>;

  // Workflow controls below media (centered layout only)
  workflowControlsProps?: LayoutWorkflowControlsProps;

  // Adjacent segment navigation
  adjacentSegments?: AdjacentSegmentsData;

  // Segment slot mode
  segmentSlotMode?: SegmentSlotModeData;
}

// Re-export ControlsPanelProps for convenience
export type { ControlsPanelProps } from '../ControlsPanel';
