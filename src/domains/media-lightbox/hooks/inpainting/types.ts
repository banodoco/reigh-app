import type { GenerationRow } from '@/domains/generation/types';

// Import canonical types from single source of truth
import type { EditAdvancedSettings, EditMode, QwenEditModel } from '../../model/editSettingsTypes';

// StrokeOverlayHandle lives here to avoid a circular import
// (StrokeOverlay → shapeHelpers → types → StrokeOverlay).
export interface StrokeOverlayHandle {
  /** Renders all strokes as white-on-black mask at image resolution. */
  exportMask: (options?: { pixelRatio?: number }) => string | null;
  getSelectedShapeId: () => string | null;
  undo: () => void;
  clear: () => void;
  deleteSelected: () => void;
  toggleFreeForm: () => void;
}

// Re-export for backwards compatibility
export type { EditAdvancedSettings, EditMode, QwenEditModel };

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

export type AnnotationMode = 'rectangle' | null;

interface ImageDimensions {
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
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  handleExitInpaintMode: () => void;
  loras?: Array<{ url: string; strength: number }>;
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  qwenEditModel?: QwenEditModel;
  imageUrl?: string;
  thumbnailUrl?: string;
  editMode: EditMode;
  annotationMode?: AnnotationMode;
  inpaintPrompt?: string;
  inpaintNumGenerations?: number;
  setEditMode: (mode: EditMode) => void;
  setAnnotationMode?: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;
  setInpaintPrompt?: (prompt: string) => void;
  setInpaintNumGenerations?: (num: number) => void;
  /** Start with isInpaintMode=true (skips the "select an option" step) */
  initialActive?: boolean;
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
  setEditMode: (mode: EditMode) => void;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;

  // Handlers
  handleEnterInpaintMode: () => void;
  handleUndo: () => void;
  handleClearMask: () => void;
  handleGenerateInpaint: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleDeleteSelected: () => void;
  handleToggleFreeForm: () => void;
  getDeleteButtonPosition: () => { x: number; y: number } | null;

  // StrokeOverlay callbacks (passed as props to StrokeOverlay)
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint: () => void;

  // Refs
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;

  // Canvas state
  isImageLoaded: boolean;
  imageLoadError: string | null;
}

export interface StrokeCache {
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  brushSize: number;
}
