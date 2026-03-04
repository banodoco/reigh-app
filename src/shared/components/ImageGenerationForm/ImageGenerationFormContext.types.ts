import type React from 'react';
import type { ImageGenerationFormUIState, FormUIActions } from './state/useFormUIState';
import type { PromptEntry, PromptMode, HydratedReferenceImage, ReferenceMode } from './types';
import type { ActiveLora } from '@/shared/types/lora';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { Resource } from '@/shared/hooks/useResources';

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
export interface ImageGenerationFormContextValue {
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
