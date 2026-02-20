import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';

interface SelectedLora {
  id: string;
  path: string;
  name: string;
  strength?: number | string;
}

interface UseShotEditorBridgeArgs {
  parentGetGenerationDataRef?: MutableRefObject<(() => unknown) | null>;
  parentGenerateVideoRef?: MutableRefObject<((variantNameParam?: string) => void | Promise<void>) | null>;
  parentNameClickRef?: MutableRefObject<(() => void) | null>;
  parentOnSelectionChange?: (hasSelection: boolean) => void;
  structureVideoPath: string | null;
  structureVideoType: string | null;
  structureVideoTreatment: string | null;
  structureVideoMotionStrength: number | null;
  effectiveAspectRatio?: string;
  selectedLoras: SelectedLora[];
  clearAllEnhancedPrompts: () => Promise<void>;
  handleGenerateBatch: (variantNameParam?: string) => void | Promise<void>;
  handleNameClick: () => void;
  textBeforePrompts: string;
  textAfterPrompts: string;
  prompt: string;
  negativePrompt: string;
  enhancePrompt: boolean;
  batchVideoFrames: number;
  lastVideoGeneration?: string | null;
}

export function useShotEditorBridge(args: UseShotEditorBridgeArgs) {
  const {
    parentGetGenerationDataRef,
    parentGenerateVideoRef,
    parentNameClickRef,
    parentOnSelectionChange,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    effectiveAspectRatio,
    selectedLoras,
    clearAllEnhancedPrompts,
    handleGenerateBatch,
    handleNameClick,
    textBeforePrompts,
    textAfterPrompts,
    prompt,
    negativePrompt,
    enhancePrompt,
    batchVideoFrames,
    lastVideoGeneration,
  } = args;

  const parentOnSelectionChangeRef = useRef(parentOnSelectionChange);
  parentOnSelectionChangeRef.current = parentOnSelectionChange;

  useEffect(() => {
    if (!parentGetGenerationDataRef) {
      return;
    }

    parentGetGenerationDataRef.current = () => ({
      structureVideo: {
        path: structureVideoPath,
        type: structureVideoType === 'flow' ? null : structureVideoType,
        treatment: structureVideoTreatment,
        motionStrength: structureVideoMotionStrength,
      },
      aspectRatio: effectiveAspectRatio,
      loras: selectedLoras.map((lora) => ({
        id: lora.id,
        path: lora.path,
        strength: parseFloat(lora.strength?.toString() ?? '0') || 0,
        name: lora.name,
      })),
      clearEnhancedPrompts: clearAllEnhancedPrompts,
    });
  }, [
    parentGetGenerationDataRef,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    effectiveAspectRatio,
    selectedLoras,
    clearAllEnhancedPrompts,
  ]);

  useEffect(() => {
    if (parentGenerateVideoRef) {
      parentGenerateVideoRef.current = handleGenerateBatch;
    }
  }, [parentGenerateVideoRef, handleGenerateBatch]);

  useEffect(() => {
    if (parentNameClickRef) {
      parentNameClickRef.current = handleNameClick;
    }
  }, [parentNameClickRef, handleNameClick]);

  const handleSelectionChangeLocal = useCallback((hasSelection: boolean) => {
    parentOnSelectionChangeRef.current?.(hasSelection);
  }, []);

  const currentMotionSettings = useMemo(() => {
    const base = {
      textBeforePrompts,
      textAfterPrompts,
      basePrompt: prompt,
      negativePrompt,
      enhancePrompt,
      durationFrames: batchVideoFrames,
      selectedLoras: selectedLoras.map((lora) => ({
        id: lora.id,
        name: lora.name,
        strength: parseFloat(lora.strength?.toString() ?? '0') || 0,
      })),
    };

    return lastVideoGeneration
      ? { ...base, lastGeneratedVideoUrl: lastVideoGeneration }
      : base;
  }, [
    textBeforePrompts,
    textAfterPrompts,
    prompt,
    negativePrompt,
    enhancePrompt,
    batchVideoFrames,
    lastVideoGeneration,
    selectedLoras,
  ]);

  return {
    handleSelectionChangeLocal,
    currentMotionSettings,
  };
}
