import { useCallback } from 'react';
import { useImageTransform } from './reposition/useImageTransform';
import { useCanvasTransform } from './reposition/useCanvasTransform';
import { useRepositionDrag } from './reposition/useRepositionDrag';
import { useRepositionTaskCreation } from './reposition/useRepositionTaskCreation';
import { useRepositionVariantSave } from './reposition/useRepositionVariantSave';
import type {
  ImageTransform,
  UseRepositionModeProps,
  UseRepositionModeReturn,
} from './reposition/types';

// Re-export types for backward compatibility
export type { ImageTransform, UseRepositionModeProps, UseRepositionModeReturn };

/**
 * Hook for managing image reposition mode.
 * Orchestrates transform state, drag interaction, mask generation, and task/variant creation.
 *
 * This is a composition of focused hooks:
 * - useImageTransform: Transform state with per-variant caching
 * - useCanvasTransform: CSS transform preview and canvas manipulation
 * - useRepositionDrag: Drag-to-move pointer event handling
 * - useRepositionTaskCreation: Inpaint task creation with mask generation
 * - useRepositionVariantSave: Save as variant/generation with thumbnail
 */
export const useRepositionMode = ({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  imageDimensions,
  imageContainerRef,
  loras,
  inpaintPrompt,
  inpaintNumGenerations,
  onVariantCreated,
  refetchVariants,
  createAsGeneration,
  advancedSettings,
  activeVariantLocation,
  activeVariantId,
  activeVariantParams,
  qwenEditModel,
}: UseRepositionModeProps): UseRepositionModeReturn => {
  // Transform state management with per-variant caching
  const transformHook = useImageTransform({
    activeVariantId,
    mediaId: media.id,
    activeVariantParams,
  });

  const {
    transform,
    hasTransformChanges,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    getCacheKey,
    clearCacheForKey,
    markSkipNextCache,
  } = transformHook;

  // Canvas transform for preview and actual transformation
  const { getTransformStyle, createTransformedCanvas } = useCanvasTransform({
    transform,
    imageDimensions,
    media,
    activeVariantLocation,
  });

  // Drag handler for transform updates
  const onTransformChange = useCallback((updates: Partial<ImageTransform>) => {
    if (updates.translateX !== undefined) setTranslateX(updates.translateX);
    if (updates.translateY !== undefined) setTranslateY(updates.translateY);
  }, [setTranslateX, setTranslateY]);

  // Drag-to-move functionality
  const { isDragging, dragHandlers } = useRepositionDrag({
    transform,
    imageDimensions,
    imageContainerRef,
    onTransformChange,
  });

  // Inpaint task creation
  const {
    isGeneratingReposition,
    repositionGenerateSuccess,
    handleGenerateReposition,
  } = useRepositionTaskCreation({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    imageDimensions,
    loras,
    inpaintPrompt,
    inpaintNumGenerations,
    transform,
    hasTransformChanges,
    createAsGeneration,
    advancedSettings,
    activeVariantId,
    qwenEditModel,
    createTransformedCanvas,
  });

  // Variant/generation save
  const {
    isSavingAsVariant,
    saveAsVariantSuccess,
    handleSaveAsVariant,
  } = useRepositionVariantSave({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    imageDimensions,
    transform,
    hasTransformChanges,
    createAsGeneration,
    activeVariantId,
    onVariantCreated,
    refetchVariants,
    resetTransform,
    createTransformedCanvas,
    getCacheKey,
    clearCacheForKey,
    markSkipNextCache,
  });

  return {
    transform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
    isDragging,
    dragHandlers,
  };
};
