/**
 * useEditModePanelState
 *
 * Encapsulates the non-JSX logic for EditModePanel:
 * - Props-first state resolution (props override context when provided)
 * - Local state: prompt-edited tracking, mode-switch LoRA reset
 * - Mode selector item configuration
 * - Responsive style helpers
 *
 * Keeps EditModePanel as a pure rendering component.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Paintbrush, Pencil, Type, Move, Wand2, ArrowUp } from 'lucide-react';
import React from 'react';
import type { ImageEditState } from '../contexts/ImageEditContext';
import type { LightboxCoreState, LightboxVariantState } from '../contexts/LightboxStateContext';
import { useLightboxCoreSafe, useLightboxVariantsSafe } from '../contexts/LightboxStateContext';
import { useImageEditCanvasSafe } from '../contexts/ImageEditCanvasContext';
import { useImageEditFormSafe } from '../contexts/ImageEditFormContext';
import { useImageEditStatusSafe } from '../contexts/ImageEditStatusContext';

// ============================================================================
// Types
// ============================================================================

interface UseEditModePanelStateParams {
  variant: 'desktop' | 'mobile';
  currentMediaId: string;

  // Cloud mode controls
  isCloudMode?: boolean;
  handleUpscale?: () => Promise<void>;

  // Optional state overrides (props-first pattern)
  coreState?: Pick<LightboxCoreState, 'onClose'>;
  imageEditState?: ImageEditState;
  variantsState?: Pick<LightboxVariantState,
    | 'variants'
    | 'activeVariant'
    | 'handleVariantSelect'
    | 'handleMakePrimary'
    | 'isLoadingVariants'
    | 'handlePromoteToGeneration'
    | 'isPromoting'
    | 'handleDeleteVariant'
    | 'onLoadVariantSettings'
  >;
}

export interface ModeSelectorItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useEditModePanelState({
  variant,
  currentMediaId,
  isCloudMode,
  handleUpscale,
  coreState,
  imageEditState,
  variantsState,
}: UseEditModePanelStateParams) {
  const isMobile = variant === 'mobile';

  // ========================================
  // STATE: Props-first with context fallback
  // ========================================
  const contextCore = useLightboxCoreSafe();
  const contextCanvas = useImageEditCanvasSafe();
  const contextForm = useImageEditFormSafe();
  const contextStatus = useImageEditStatusSafe();
  const contextVariants = useLightboxVariantsSafe();

  // Core state
  const { onClose } = coreState ?? contextCore;

  // Canvas state (mode, brush, reposition)
  const {
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    handleExitMagicEditMode,
    hasTransformChanges,
  } = imageEditState ?? contextCanvas;

  // Form state (prompts, LoRA, model, settings)
  const {
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    setEnablePromptExpansion,
    qwenEditModel,
    setQwenEditModel,
  } = imageEditState ?? contextForm;

  // Generation status
  const {
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
  } = imageEditState ?? contextStatus;

  // Variants state
  const {
    variants,
    activeVariant,
    handleVariantSelect: onVariantSelect,
    handleMakePrimary: onMakePrimary,
    isLoadingVariants,
    handlePromoteToGeneration: onPromoteToGeneration,
    isPromoting,
    handleDeleteVariant: onDeleteVariant,
    onLoadVariantSettings,
  } = variantsState ?? contextVariants;

  const activeVariantId = activeVariant?.id || null;

  // ========================================
  // LOCAL STATE & EFFECTS
  // ========================================

  // Track previous edit mode to detect changes
  const prevEditModeRef = useRef(editMode);

  // Track if user has interacted with the prompt field
  const [hasUserEditedPrompt, setHasUserEditedPrompt] = useState(false);

  // Reset the flag when media changes
  const prevMediaIdRef = useRef(currentMediaId);
  useEffect(() => {
    if (currentMediaId !== prevMediaIdRef.current) {
      setHasUserEditedPrompt(false);
      prevMediaIdRef.current = currentMediaId;
    }
  }, [currentMediaId]);

  // Auto-reset LoRA mode to "none" when switching to inpaint or annotate
  useEffect(() => {
    const prevMode = prevEditModeRef.current;
    if (prevMode !== editMode && (editMode === 'inpaint' || editMode === 'annotate')) {
      setLoraMode('none');
    }
    prevEditModeRef.current = editMode;
  }, [editMode, setLoraMode]);

  // ========================================
  // HANDLERS
  // ========================================

  const handleClearLora = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoraMode('none');
  };

  // ========================================
  // MODE SELECTOR ITEMS
  // ========================================

  const modeSelectorItems: ModeSelectorItem[] = [
    {
      id: 'text',
      label: 'Text',
      icon: React.createElement(Type),
      onClick: () => { setIsInpaintMode(true); setEditMode('text'); },
    },
    {
      id: 'inpaint',
      label: 'Paint',
      icon: React.createElement(Paintbrush),
      onClick: () => { setIsInpaintMode(true); setEditMode('inpaint'); },
    },
    {
      id: 'annotate',
      label: 'Annotate',
      icon: React.createElement(Pencil),
      onClick: () => { setIsInpaintMode(true); setEditMode('annotate'); },
    },
    {
      id: 'reposition',
      label: 'Move',
      icon: React.createElement(Move),
      onClick: () => { setIsInpaintMode(true); setEditMode('reposition'); },
    },
    {
      id: 'img2img',
      label: 'Img2Img',
      icon: React.createElement(Wand2),
      onClick: () => { setIsInpaintMode(true); setEditMode('img2img'); },
    },
    // Enhance mode (upscale) - only shown when cloud mode is enabled
    ...(isCloudMode && handleUpscale ? [{
      id: 'upscale',
      label: 'Enhance',
      icon: React.createElement(ArrowUp),
      onClick: () => { setIsInpaintMode(false); setEditMode('upscale'); },
    }] : []),
  ];

  // ========================================
  // RESPONSIVE STYLES
  // ========================================

  const labelSize = isMobile ? 'text-[10px] uppercase tracking-wide text-muted-foreground' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[50px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 2 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm'; // 16px on mobile prevents iOS zoom
  const generationsSpacing = isMobile ? 'space-y-0.5' : 'space-y-2';

  return {
    isMobile,
    // Core
    onClose,
    // Canvas
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    handleExitMagicEditMode,
    hasTransformChanges,
    // Form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    setEnablePromptExpansion,
    qwenEditModel,
    setQwenEditModel,
    // Status
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    // Variants
    variants,
    activeVariantId,
    onVariantSelect,
    onMakePrimary,
    isLoadingVariants,
    onPromoteToGeneration,
    isPromoting,
    onDeleteVariant,
    onLoadVariantSettings,
    // Local state
    hasUserEditedPrompt,
    setHasUserEditedPrompt,
    // Handlers
    handleClearLora,
    // Mode selector
    modeSelectorItems,
    // Responsive styles
    labelSize,
    textareaMinHeight,
    textareaRows,
    textareaPadding,
    textareaTextSize,
    generationsSpacing,
  };
}
