/**
 * ImageEditFormContext
 *
 * Form state for image editing: prompts, strengths, LoRA, model selection,
 * advanced settings, number of generations, variant toggle.
 *
 * Consumer: EditModePanel (only).
 * Split from ImageEditContext to avoid re-renders of canvas/overlay components
 * when the user is typing prompts or adjusting form controls.
 */

import React, { createContext, useContext } from 'react';
import type {
  LoraMode,
  QwenEditModel,
  EditAdvancedSettings,
} from '../hooks/editSettingsTypes';
import { DEFAULT_ADVANCED_SETTINGS } from '../hooks/editSettingsTypes';

export type { LoraMode };

// ============================================================================
// Types
// ============================================================================

export interface ImageEditFormState {
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (value: boolean) => void;
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;
  qwenEditModel: QwenEditModel;
  setQwenEditModel: (model: QwenEditModel) => void;
  advancedSettings: EditAdvancedSettings;
  setAdvancedSettings: (settings: EditAdvancedSettings) => void;
}

// ============================================================================
// Defaults
// ============================================================================

const EMPTY_FORM: ImageEditFormState = {
  inpaintPrompt: '',
  setInpaintPrompt: () => {},
  inpaintNumGenerations: 1,
  setInpaintNumGenerations: () => {},
  img2imgPrompt: '',
  setImg2imgPrompt: () => {},
  img2imgStrength: 0.6,
  setImg2imgStrength: () => {},
  enablePromptExpansion: false,
  setEnablePromptExpansion: () => {},
  loraMode: 'none',
  setLoraMode: () => {},
  customLoraUrl: '',
  setCustomLoraUrl: () => {},
  createAsGeneration: false,
  setCreateAsGeneration: () => {},
  qwenEditModel: 'qwen-edit-2511',
  setQwenEditModel: () => {},
  advancedSettings: DEFAULT_ADVANCED_SETTINGS,
  setAdvancedSettings: () => {},
};

// ============================================================================
// Context + Hook
// ============================================================================

const ImageEditFormContext = createContext<ImageEditFormState | null>(null);

interface ImageEditFormProviderProps {
  children: React.ReactNode;
  value: ImageEditFormState;
}

export const ImageEditFormProvider: React.FC<ImageEditFormProviderProps> = ({
  children,
  value,
}) => {
  return (
    <ImageEditFormContext.Provider value={value}>
      {children}
    </ImageEditFormContext.Provider>
  );
};

/**
 * Returns form edit state, or safe defaults when used outside provider.
 */
export function useImageEditFormSafe(): ImageEditFormState {
  const context = useContext(ImageEditFormContext);
  return context ?? EMPTY_FORM;
}
