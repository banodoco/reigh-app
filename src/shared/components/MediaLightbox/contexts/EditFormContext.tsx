/**
 * EditFormContext
 *
 * Provides form-specific state for edit panels.
 * This includes prompts, generation counts, LoRA mode, and generation status.
 *
 * This context is provided by ImageLightbox only, as video editing
 * uses different form patterns (regenerate form props).
 */

import React, { createContext, useContext } from 'react';

// Import canonical types from single source of truth
import {
  type LoraMode,
  type QwenEditModel,
  type EditAdvancedSettings,
  DEFAULT_ADVANCED_SETTINGS,
} from '../hooks/editSettingsTypes';

// Re-export for backwards compatibility
export type { LoraMode };

// ============================================================================
// Types
// ============================================================================

export interface EditFormState {
  // ========================================
  // Inpaint form
  // ========================================
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;

  // ========================================
  // Img2Img form
  // ========================================
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (value: boolean) => void;

  // ========================================
  // LoRA mode
  // ========================================
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;

  // ========================================
  // Generation options
  // ========================================
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;

  // ========================================
  // Model selection
  // ========================================
  qwenEditModel: QwenEditModel;
  setQwenEditModel: (model: QwenEditModel) => void;

  // ========================================
  // Advanced settings
  // ========================================
  advancedSettings: EditAdvancedSettings;
  setAdvancedSettings: (settings: EditAdvancedSettings) => void;

  // ========================================
  // Generation status (for UI feedback)
  // ========================================
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
}

// ============================================================================
// Default Values
// ============================================================================

const EMPTY_EDIT_FORM: EditFormState = {
  // Inpaint form
  inpaintPrompt: '',
  setInpaintPrompt: () => {},
  inpaintNumGenerations: 1,
  setInpaintNumGenerations: () => {},

  // Img2Img form
  img2imgPrompt: '',
  setImg2imgPrompt: () => {},
  img2imgStrength: 0.6,
  setImg2imgStrength: () => {},
  enablePromptExpansion: false,
  setEnablePromptExpansion: () => {},

  // LoRA mode
  loraMode: 'none',
  setLoraMode: () => {},
  customLoraUrl: '',
  setCustomLoraUrl: () => {},

  // Generation options
  createAsGeneration: false,
  setCreateAsGeneration: () => {},

  // Model selection
  qwenEditModel: 'qwen-edit-2511',
  setQwenEditModel: () => {},

  // Advanced settings
  advancedSettings: DEFAULT_ADVANCED_SETTINGS,
  setAdvancedSettings: () => {},

  // Generation status
  isGeneratingInpaint: false,
  inpaintGenerateSuccess: false,
  isGeneratingImg2Img: false,
  img2imgGenerateSuccess: false,
  isGeneratingReposition: false,
  repositionGenerateSuccess: false,
  isSavingAsVariant: false,
  saveAsVariantSuccess: false,
  isCreatingMagicEditTasks: false,
  magicEditTasksCreated: false,
};

// ============================================================================
// Context
// ============================================================================

const EditFormContext = createContext<EditFormState | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface EditFormProviderProps {
  children: React.ReactNode;
  value: EditFormState;
}

export const EditFormProvider: React.FC<EditFormProviderProps> = ({
  children,
  value,
}) => {
  return (
    <EditFormContext.Provider value={value}>
      {children}
    </EditFormContext.Provider>
  );
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access edit form state. Throws if used outside EditFormProvider.
 */
export function useEditForm(): EditFormState {
  const context = useContext(EditFormContext);
  if (!context) {
    throw new Error('useEditForm must be used within an EditFormProvider');
  }
  return context;
}

/**
 * Safe version that returns defaults when used outside provider.
 * Use this for components that may render in both image and video lightbox.
 */
export function useEditFormSafe(): EditFormState {
  const context = useContext(EditFormContext);
  return context ?? EMPTY_EDIT_FORM;
}

/**
 * Check if we're inside an EditFormProvider.
 */
export function useHasEditForm(): boolean {
  const context = useContext(EditFormContext);
  return context !== null;
}

export default EditFormContext;
