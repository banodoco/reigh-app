import { useCallback } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  EditAdvancedSettings,
  EditMode,
  QwenEditModel,
} from '../../model/editSettingsTypes';
import type { EditMode as InpaintingEditMode } from '../inpainting/types';
import { useInpainting } from '../useInpainting';
import { useEditSettingsSync } from '../persistence/useEditSettingsSync';

interface VariantContextValue {
  id?: string | null;
  location?: string | null;
}

interface UseManagedInpaintingStateInput {
  media: GenerationRow;
  selectedProjectId: string | null;
  actualGenerationId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  imageDimensions: { width: number; height: number } | null;
  effectiveEditModeLoras: Array<{ url: string; strength: number }> | undefined;
  activeVariant: VariantContextValue | null;
  effectiveImageUrl: string;
  thumbnailUrl?: string;
  createAsGeneration: boolean;
  advancedSettings: EditAdvancedSettings;
  qwenEditModel: QwenEditModel;
  persistedEditMode: EditMode;
  persistedNumGenerations: number;
  persistedPrompt: string;
  isEditSettingsReady: boolean;
  hasPersistedSettings: boolean;
  setPersistedEditMode: (mode: EditMode) => void;
  setPersistedNumGenerations: (num: number) => void;
  setPersistedPrompt: (prompt: string) => void;
}

function toInpaintingEditMode(mode: EditMode): InpaintingEditMode {
  if (mode === 'inpaint' || mode === 'annotate' || mode === 'text') {
    return mode;
  }
  return 'text';
}

export function useManagedInpaintingState(input: UseManagedInpaintingStateInput) {
  const {
    media,
    selectedProjectId,
    actualGenerationId,
    shotId,
    toolTypeOverride,
    imageContainerRef,
    imageDimensions,
    effectiveEditModeLoras,
    activeVariant,
    effectiveImageUrl,
    thumbnailUrl,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    isEditSettingsReady,
    hasPersistedSettings,
    setPersistedEditMode,
    setPersistedNumGenerations,
    setPersistedPrompt,
  } = input;

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo: false,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: effectiveEditModeLoras,
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    imageUrl: activeVariant?.location || effectiveImageUrl,
    thumbnailUrl: thumbnailUrl || media.thumbUrl,
    initialEditMode: toInpaintingEditMode(persistedEditMode),
  });

  const {
    isInpaintMode,
    editMode,
    setIsInpaintMode,
    setEditMode,
    brushStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    setInpaintPrompt,
    setInpaintNumGenerations,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
  } = inpaintingHook;

  useEditSettingsSync({
    actualGenerationId: actualGenerationId ?? undefined,
    isEditSettingsReady,
    hasPersistedSettings,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode: (mode) => setEditMode(toInpaintingEditMode(mode)),
    setInpaintNumGenerations,
    setInpaintPrompt,
    setPersistedEditMode: (mode) => setPersistedEditMode(mode),
    setPersistedNumGenerations,
    setPersistedPrompt,
  });

  const handleExitInpaintMode = useCallback(() => {
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  return {
    inpaintingHook,
    isInpaintMode,
    editMode,
    setIsInpaintMode,
    setEditMode,
    brushStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    setInpaintPrompt,
    setInpaintNumGenerations,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleExitInpaintMode,
  };
}
