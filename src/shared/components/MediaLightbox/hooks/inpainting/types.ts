import type { KonvaEventObject } from 'konva/lib/Node';
import type { GenerationRow } from '@/types/shots';
import type { StrokeOverlayHandle } from '../../components/StrokeOverlay';

// Import canonical types from single source of truth
import type { EditAdvancedSettings, QwenEditModel } from '../editSettingsTypes';

// Re-export for backwards compatibility
export type { EditAdvancedSettings, QwenEditModel };

// ============================================
// Core Types
// ============================================

export interface BrushStroke {
  id: string;
  points: Array<{ x: number; y: number }>; // 2 points for rectangle, 4 points for free-form quad
  isErasing: boolean;
  brushSize: number;
  shapeType?: 'line' | 'rectangle';
  isFreeForm?: boolean; // True if corners have been independently dragged
}

export type EditMode = 'text' | 'inpaint' | 'annotate';

export type AnnotationMode = 'rectangle' | null;

export interface CanvasSize {
  width: number;  // Display width in CSS pixels
  height: number; // Display height in CSS pixels
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// ============================================
// Hook Props & Return Types
// ============================================

export interface UseInpaintingProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  isVideo: boolean;
  imageDimensions: ImageDimensions | null;
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  handleExitInpaintMode: () => void;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  imageUrl?: string;
  thumbnailUrl?: string;
  initialEditMode?: EditMode;
}

export interface UseInpaintingReturn {
  // State
  isInpaintMode: boolean;
  brushStrokes: BrushStroke[];
  isEraseMode: boolean;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  brushSize: number;
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isDrawing: boolean;
  currentStroke: Array<{ x: number; y: number }>;
  isAnnotateMode: boolean;
  editMode: EditMode;
  annotationMode: AnnotationMode;
  selectedShapeId: string | null;
  showTextModeHint: boolean;

  // Setters
  setIsInpaintMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInpaintPrompt: (prompt: string) => void;
  setInpaintNumGenerations: (num: number) => void;
  setBrushSize: (size: number) => void;
  setIsEraseMode: (isErasing: boolean) => void;
  setIsAnnotateMode: (isAnnotate: boolean | ((prev: boolean) => boolean)) => void;
  setEditMode: (mode: EditMode | ((prev: EditMode) => EditMode)) => void;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;

  // Handlers
  handleEnterInpaintMode: () => void;
  handleKonvaPointerDown: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerMove: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  handleShapeClick: (strokeId: string, point: { x: number; y: number }) => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleDeleteSelected: () => void;
  handleToggleFreeForm: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;

  // Refs
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;

  // Canvas state
  isImageLoaded: boolean;
  imageLoadError: string | null;
  redrawStrokes: (strokes: BrushStroke[]) => void;
}

// ============================================
// Internal State Types
// ============================================

export interface MediaStateCache {
  editMode: EditMode;
  annotationMode: AnnotationMode;
}

export interface StrokeCache {
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  prompt: string;
  numGenerations: number;
  brushSize: number;
}

export interface DragState {
  isDraggingShape: boolean;
  isDraggingControlPoint: boolean;
  dragOffset: { x: number; y: number } | null;
  dragMode: 'move' | 'resize';
  draggingCornerIndex: number | null;
}
