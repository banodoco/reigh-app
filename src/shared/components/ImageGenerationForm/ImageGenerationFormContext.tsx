/**
 * ImageGenerationFormContext - Shared state for ImageGenerationForm sections
 *
 * Provides commonly-used state and actions to sub-components without prop drilling.
 * Sections pull from context instead of receiving 20-30 props each.
 *
 * Pattern from refactoring_patterns.md "Complex Editor Pattern":
 * - Sections pull from context → minimal props
 * - UI state from reducer → predictable updates
 * - Handlers memoized → stable references
 */

import React, { createContext, useContext, useMemo } from 'react';
import { ImageGenerationFormUIState, FormUIActions } from './state/useFormUIState';
import { PromptEntry, PromptMode, HydratedReferenceImage, ReferenceMode } from './types';
import type { ActiveLora } from '@/shared/types/lora';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { Resource } from '@/shared/hooks/useResources';

// ============================================================================
// Context Value Types
// ============================================================================

/** Core form state */
export interface FormCoreState {
  selectedProjectId: string | null;
  associatedShotId: string | null;
  effectiveShotId: string;
  isGenerating: boolean;
  ready: boolean;
}

/** Prompt-related state */
export interface FormPromptState {
  prompts: PromptEntry[];
  masterPromptText: string;
  effectivePromptMode: PromptMode;
  actionablePromptsCount: number;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  lastKnownPromptCount: number;
}

/** Prompt handlers */
export interface FormPromptHandlers {
  setPrompts: React.Dispatch<React.SetStateAction<PromptEntry[]>>;
  setMasterPromptText: (text: string) => void;
  setEffectivePromptMode: (mode: PromptMode) => void;
  setCurrentBeforePromptText: (text: string) => void;
  setCurrentAfterPromptText: (text: string) => void;
  handleAddPrompt: () => void;
  handleUpdatePrompt: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  handleRemovePrompt: (id: string) => void;
  handleDeleteAllPrompts: () => void;
  markAsInteracted: () => void;
}

/** Reference-related state */
export interface FormReferenceState {
  references: HydratedReferenceImage[];
  selectedReferenceId: string | null;
  referenceMode: ReferenceMode;
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  styleBoostTerms: string;
  isUploadingStyleReference: boolean;
  styleReferenceImageDisplay: string | null;
}

/** Reference handlers */
export interface FormReferenceHandlers {
  onSelectReference: (id: string) => void | Promise<void>;
  onDeleteReference: (id: string) => void | Promise<void>;
  onUpdateReferenceName: (id: string, name: string) => void | Promise<void>;
  onStyleUpload: (files: File[]) => Promise<void>;
  onStyleRemove: () => void | Promise<void>;
  onStyleStrengthChange: (value: number) => void | Promise<void>;
  onSubjectStrengthChange: (value: number) => void | Promise<void>;
  onSubjectDescriptionChange: (value: string) => void | Promise<void>;
  onSubjectDescriptionFocus: () => void;
  onSubjectDescriptionBlur: () => void;
  onInThisSceneChange: (value: boolean) => void | Promise<void>;
  onInThisSceneStrengthChange: (value: number) => void | Promise<void>;
  onReferenceModeChange: (mode: ReferenceMode) => void | Promise<void>;
  onStyleBoostTermsChange: (terms: string) => void | Promise<void>;
  onToggleVisibility: (resourceId: string, isPublic: boolean) => void | Promise<void>;
  onResourceSelect: (resource: Resource) => void | Promise<void>;
}

/** LORA-related state */
export interface FormLoraState {
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
}

/** LORA handlers */
export interface FormLoraHandlers {
  handleAddLora: (lora: LoraModel) => void;
  handleRemoveLora: (id: string) => void;
  handleLoraStrengthChange: (id: string, strength: number) => void;
}

/** Full context value */
interface ImageGenerationFormContextValue {
  // UI state from reducer
  uiState: ImageGenerationFormUIState;
  uiActions: FormUIActions;

  // Core state
  core: FormCoreState;

  // Prompt state and handlers
  prompts: FormPromptState;
  promptHandlers: FormPromptHandlers;

  // Reference state and handlers
  references: FormReferenceState;
  referenceHandlers: FormReferenceHandlers;

  // LORA state and handlers
  loras: FormLoraState;
  loraHandlers: FormLoraHandlers;
}

// ============================================================================
// Context
// ============================================================================

const ImageGenerationFormContext = createContext<ImageGenerationFormContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

function useImageGenerationFormContext(): ImageGenerationFormContextValue {
  const context = useContext(ImageGenerationFormContext);
  if (!context) {
    throw new Error(
      'useImageGenerationFormContext must be used within ImageGenerationFormProvider'
    );
  }
  return context;
}

// Convenience hooks for specific domains
export function useFormUIContext() {
  const { uiState, uiActions } = useImageGenerationFormContext();
  return { uiState, uiActions };
}

export function useFormCoreContext() {
  const { core } = useImageGenerationFormContext();
  return core;
}

export function useFormPromptsContext() {
  const { prompts, promptHandlers } = useImageGenerationFormContext();
  return { ...prompts, ...promptHandlers };
}

export function useFormReferencesContext() {
  const { references, referenceHandlers } = useImageGenerationFormContext();
  return { ...references, ...referenceHandlers };
}

export function useFormLorasContext() {
  const { loras, loraHandlers } = useImageGenerationFormContext();
  return { ...loras, ...loraHandlers };
}

// ============================================================================
// Provider
// ============================================================================

interface ImageGenerationFormProviderProps {
  value: ImageGenerationFormContextValue;
  children: React.ReactNode;
}

export function ImageGenerationFormProvider({
  value,
  children,
}: ImageGenerationFormProviderProps) {
  return (
    <ImageGenerationFormContext.Provider value={value}>
      {children}
    </ImageGenerationFormContext.Provider>
  );
}

// ============================================================================
// Context Value Builder Hook
// ============================================================================

interface UseContextValueProps {
  uiState: ImageGenerationFormUIState;
  uiActions: FormUIActions;
  core: FormCoreState;
  prompts: FormPromptState;
  promptHandlers: FormPromptHandlers;
  references: FormReferenceState;
  referenceHandlers: FormReferenceHandlers;
  loras: FormLoraState;
  loraHandlers: FormLoraHandlers;
}

/**
 * Builds memoized context value from component state.
 * Call this in the main component and pass to ImageGenerationFormProvider.
 */
export function useContextValue(props: UseContextValueProps): ImageGenerationFormContextValue {
  const {
    uiState,
    uiActions,
    core,
    prompts,
    promptHandlers,
    references,
    referenceHandlers,
    loras,
    loraHandlers,
  } = props;

  return useMemo<ImageGenerationFormContextValue>(() => ({
    uiState,
    uiActions,
    core,
    prompts,
    promptHandlers,
    references,
    referenceHandlers,
    loras,
    loraHandlers,
  }), [
    uiState,
    uiActions,
    core,
    prompts,
    promptHandlers,
    references,
    referenceHandlers,
    loras,
    loraHandlers,
  ]);
}
