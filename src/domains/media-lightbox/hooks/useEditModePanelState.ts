/** View-model state for EditModePanel. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Paintbrush, Pencil, Type, Move, Wand2, ArrowUp } from 'lucide-react';
import React from 'react';
import type { ImageEditState } from '../contexts/ImageEditContext';
import type { LightboxCoreState, LightboxVariantState } from '../contexts/LightboxStateContext';
import { useLightboxCoreSafe, useLightboxVariantsSafe } from '../contexts/LightboxStateContext';
import { useImageEditCanvasSafe } from '../contexts/ImageEditCanvasContext';
import { useImageEditFormSafe } from '../contexts/ImageEditFormContext';
import { useImageEditStatusSafe } from '../contexts/ImageEditStatusContext';

interface UseEditModePanelStateParams {
  variant: 'desktop' | 'mobile';
  currentMediaId: string;

  isCloudMode?: boolean;
  handleUpscale?: () => Promise<void>;

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
  const contextCore = useLightboxCoreSafe();
  const contextCanvas = useImageEditCanvasSafe();
  const contextForm = useImageEditFormSafe();
  const contextStatus = useImageEditStatusSafe();
  const contextVariants = useLightboxVariantsSafe();

  const { onClose } = coreState ?? contextCore;

  const {
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    handleExitMagicEditMode,
    hasTransformChanges,
  } = imageEditState ?? contextCanvas;

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
  const prevEditModeRef = useRef(editMode);
  const [hasUserEditedPrompt, setHasUserEditedPrompt] = useState(false);
  const prevMediaIdRef = useRef(currentMediaId);
  useEffect(() => {
    if (currentMediaId !== prevMediaIdRef.current) {
      setHasUserEditedPrompt(false);
      prevMediaIdRef.current = currentMediaId;
    }
  }, [currentMediaId]);

  useEffect(() => {
    const prevMode = prevEditModeRef.current;
    if (prevMode !== editMode && (editMode === 'inpaint' || editMode === 'annotate')) {
      setLoraMode('none');
    }
    prevEditModeRef.current = editMode;
  }, [editMode, setLoraMode]);

  const handleClearLora = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoraMode('none');
  };

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
    ...(isCloudMode && handleUpscale ? [{
      id: 'upscale',
      label: 'Enhance',
      icon: React.createElement(ArrowUp),
      onClick: () => { setIsInpaintMode(false); setEditMode('upscale'); },
    }] : []),
  ];

  const labelSize = isMobile ? 'text-[10px] uppercase tracking-wide text-muted-foreground' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[50px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 2 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm'; // 16px on mobile prevents iOS zoom
  const generationsSpacing = isMobile ? 'space-y-0.5' : 'space-y-2';

  return {
    isMobile,
    onClose,
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    handleExitMagicEditMode,
    hasTransformChanges,
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
    variants,
    activeVariantId,
    onVariantSelect,
    onMakePrimary,
    isLoadingVariants,
    onPromoteToGeneration,
    isPromoting,
    onDeleteVariant,
    onLoadVariantSettings,
    hasUserEditedPrompt,
    setHasUserEditedPrompt,
    handleClearLora,
    modeSelectorItems,
    labelSize,
    textareaMinHeight,
    textareaRows,
    textareaPadding,
    textareaTextSize,
    generationsSpacing,
  };
}
