/**
 * ImageEditContext
 *
 * Provides image-specific edit state to lightbox components.
 * This context is only provided by ImageLightbox, not VideoLightbox.
 *
 * Includes state for:
 * - Inpaint mode (brush painting on image)
 * - Annotate mode (shapes/arrows on image)
 * - Reposition mode (transform image)
 * - Magic edit mode (AI-powered edits)
 * - Img2Img mode
 */

import React, { createContext, useContext } from 'react';
import type { BrushStroke, AnnotationMode } from '../hooks/inpainting/types';
import type { ImageTransform } from '../hooks/useRepositionMode';

// ============================================================================
// Types
// ============================================================================

type ImageEditMode = 'inpaint' | 'annotate' | 'reposition' | 'img2img' | 'text' | 'upscale' | null;

export interface ImageEditState {
  // ========================================
  // Mode state
  // ========================================
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
  isSpecialEditMode: boolean; // true if any edit mode is active
  editMode: ImageEditMode;

  // ========================================
  // Mode setters
  // ========================================
  setIsInpaintMode: (value: boolean) => void;
  setIsMagicEditMode: (value: boolean) => void;
  setEditMode: (mode: ImageEditMode) => void;

  // ========================================
  // Mode entry/exit handlers
  // ========================================
  handleEnterInpaintMode: () => void;
  handleExitInpaintMode: () => void;
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;

  // ========================================
  // Brush/Inpaint state
  // ========================================
  brushSize: number;
  setBrushSize: (size: number) => void;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushStrokes: BrushStroke[];

  // ========================================
  // Annotation state
  // ========================================
  isAnnotateMode: boolean;
  setIsAnnotateMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  annotationMode: AnnotationMode;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;
  selectedShapeId: string | null;

  // ========================================
  // Undo/Clear
  // ========================================
  handleUndo: () => void;
  handleClearMask: () => void;

  // ========================================
  // Reposition state (read-only values - handlers stay as props)
  // ========================================
  repositionTransform: ImageTransform | null;
  hasTransformChanges: boolean;

  // ========================================
  // Panel UI state
  // ========================================
  inpaintPanelPosition: 'left' | 'right';
  setInpaintPanelPosition: (pos: 'left' | 'right') => void;
}

// ============================================================================
// Default Values
// ============================================================================

const EMPTY_IMAGE_EDIT: ImageEditState = {
  // Mode state
  isInpaintMode: false,
  isMagicEditMode: false,
  isSpecialEditMode: false,
  editMode: null,

  // Mode setters
  setIsInpaintMode: () => {},
  setIsMagicEditMode: () => {},
  setEditMode: () => {},

  // Mode entry/exit
  handleEnterInpaintMode: () => {},
  handleExitInpaintMode: () => {},
  handleEnterMagicEditMode: () => {},
  handleExitMagicEditMode: () => {},

  // Brush/Inpaint
  brushSize: 20,
  setBrushSize: () => {},
  isEraseMode: false,
  setIsEraseMode: () => {},
  brushStrokes: [],

  // Annotation
  isAnnotateMode: false,
  setIsAnnotateMode: () => {},
  annotationMode: null,
  setAnnotationMode: () => {},
  selectedShapeId: null,

  // Undo/Clear
  handleUndo: () => {},
  handleClearMask: () => {},

  // Reposition
  repositionTransform: null,
  hasTransformChanges: false,

  // Panel UI
  inpaintPanelPosition: 'right',
  setInpaintPanelPosition: () => {},
};

// ============================================================================
// Context
// ============================================================================

const ImageEditContext = createContext<ImageEditState | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ImageEditProviderProps {
  children: React.ReactNode;
  value: ImageEditState;
}

export const ImageEditProvider: React.FC<ImageEditProviderProps> = ({
  children,
  value,
}) => {
  return (
    <ImageEditContext.Provider value={value}>
      {children}
    </ImageEditContext.Provider>
  );
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Safe version that returns defaults when used outside provider.
 * Use this for components that may render in both image and video lightbox.
 */
export function useImageEditSafe(): ImageEditState {
  const context = useContext(ImageEditContext);
  return context ?? EMPTY_IMAGE_EDIT;
}

// Note: useImageEdit and useIsImageLightbox are not exported as they are not used.
// All internal consumers use useImageEditSafe for safe operation outside the provider.

// Note: Default export removed as it was not used externally.
