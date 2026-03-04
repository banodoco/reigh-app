import { useMemo } from 'react';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { ActiveLora } from '@/shared/types/lora';
import type { ImageGenerationFormUIState, FormUIActions } from '../state/useFormUIState';
import { useContextValue } from '../ImageGenerationFormContext';
import type {
  FormCoreState,
  FormPromptState,
  FormPromptHandlers,
  FormReferenceState,
  FormReferenceHandlers,
  FormLoraState,
  FormLoraHandlers,
} from '../ImageGenerationFormContext.types';

/** Grouped inputs matching the sub-hook return shapes */
interface UseFormContextBuilderProps {
  uiState: ImageGenerationFormUIState;
  uiActions: FormUIActions;
  core: {
    selectedProjectId: string | null;
    associatedShotId: string | null;
    effectiveShotId: string;
    isGenerating: boolean;
    ready: boolean;
  };
  promptManagement: Pick<
    ReturnType<typeof import('./usePromptManagement').usePromptManagement>,
    'prompts' | 'masterPromptText' | 'effectivePromptMode' | 'actionablePromptsCount' |
    'currentBeforePromptText' | 'currentAfterPromptText' | 'lastKnownPromptCount' |
    'setPrompts' | 'setMasterPromptText' | 'setEffectivePromptMode' |
    'setCurrentBeforePromptText' | 'setCurrentAfterPromptText' |
    'handleAddPrompt' | 'handleUpdatePrompt' | 'handleRemovePrompt' | 'handleDeleteAllPrompts'
  >;
  referenceManagement: Pick<
    ReturnType<typeof import('./useReferenceManagement').useReferenceManagement>,
    'referenceMode' | 'styleReferenceStrength' | 'subjectStrength' | 'subjectDescription' |
    'inThisScene' | 'inThisSceneStrength' | 'styleBoostTerms' | 'isUploadingStyleReference' |
    'styleReferenceImageDisplay' | 'handleSelectReference' | 'handleDeleteReference' |
    'handleUpdateReferenceName' | 'handleStyleReferenceUpload' | 'handleRemoveStyleReference' |
    'handleStyleStrengthChange' | 'handleSubjectStrengthChange' | 'handleSubjectDescriptionChange' |
    'handleSubjectDescriptionFocus' | 'handleSubjectDescriptionBlur' |
    'handleInThisSceneChange' | 'handleInThisSceneStrengthChange' |
    'handleReferenceModeChange' | 'handleStyleBoostTermsChange' |
    'handleToggleVisibility' | 'handleResourceSelect'
  >;
  references: {
    hydratedReferences: import('../types').HydratedReferenceImage[];
    displayedReferenceId: string | null;
  };
  loras: {
    selectedLoras: ActiveLora[];
    availableLoras: LoraModel[];
    handleAddLora: (lora: LoraModel) => void;
    handleRemoveLora: (id: string) => void;
    handleLoraStrengthChange: (id: string, strength: number) => void;
  };
  markAsInteracted: () => void;
}

export function useFormContextBuilder({
  uiState,
  uiActions,
  core,
  promptManagement: pm,
  referenceManagement: rm,
  references: refs,
  loras,
  markAsInteracted,
}: UseFormContextBuilderProps) {
  const coreState = useMemo<FormCoreState>(() => ({
    selectedProjectId: core.selectedProjectId,
    associatedShotId: core.associatedShotId,
    effectiveShotId: core.effectiveShotId,
    isGenerating: core.isGenerating,
    ready: core.ready,
  }), [core.selectedProjectId, core.associatedShotId, core.effectiveShotId, core.isGenerating, core.ready]);

  const promptState = useMemo<FormPromptState>(() => ({
    prompts: pm.prompts,
    masterPromptText: pm.masterPromptText,
    effectivePromptMode: pm.effectivePromptMode,
    actionablePromptsCount: pm.actionablePromptsCount,
    currentBeforePromptText: pm.currentBeforePromptText,
    currentAfterPromptText: pm.currentAfterPromptText,
    lastKnownPromptCount: pm.lastKnownPromptCount,
  }), [pm.prompts, pm.masterPromptText, pm.effectivePromptMode, pm.actionablePromptsCount, pm.currentBeforePromptText, pm.currentAfterPromptText, pm.lastKnownPromptCount]);

  const promptHandlersValue = useMemo<FormPromptHandlers>(() => ({
    setPrompts: pm.setPrompts,
    setMasterPromptText: pm.setMasterPromptText,
    setEffectivePromptMode: pm.setEffectivePromptMode,
    setCurrentBeforePromptText: pm.setCurrentBeforePromptText,
    setCurrentAfterPromptText: pm.setCurrentAfterPromptText,
    handleAddPrompt: pm.handleAddPrompt,
    handleUpdatePrompt: pm.handleUpdatePrompt,
    handleRemovePrompt: pm.handleRemovePrompt,
    handleDeleteAllPrompts: pm.handleDeleteAllPrompts,
    markAsInteracted,
  }), [pm.setPrompts, pm.setMasterPromptText, pm.setEffectivePromptMode, pm.setCurrentBeforePromptText, pm.setCurrentAfterPromptText, pm.handleAddPrompt, pm.handleUpdatePrompt, pm.handleRemovePrompt, pm.handleDeleteAllPrompts, markAsInteracted]);

  const referenceState = useMemo<FormReferenceState>(() => ({
    references: refs.hydratedReferences,
    selectedReferenceId: refs.displayedReferenceId,
    referenceMode: rm.referenceMode,
    styleReferenceStrength: rm.styleReferenceStrength,
    subjectStrength: rm.subjectStrength,
    subjectDescription: rm.subjectDescription,
    inThisScene: rm.inThisScene,
    inThisSceneStrength: rm.inThisSceneStrength,
    styleBoostTerms: rm.styleBoostTerms,
    isUploadingStyleReference: rm.isUploadingStyleReference,
    styleReferenceImageDisplay: rm.styleReferenceImageDisplay,
  }), [refs.hydratedReferences, refs.displayedReferenceId, rm.referenceMode, rm.styleReferenceStrength, rm.subjectStrength, rm.subjectDescription, rm.inThisScene, rm.inThisSceneStrength, rm.styleBoostTerms, rm.isUploadingStyleReference, rm.styleReferenceImageDisplay]);

  const referenceHandlersValue = useMemo<FormReferenceHandlers>(() => ({
    onSelectReference: rm.handleSelectReference,
    onDeleteReference: rm.handleDeleteReference,
    onUpdateReferenceName: rm.handleUpdateReferenceName,
    onStyleUpload: rm.handleStyleReferenceUpload,
    onStyleRemove: rm.handleRemoveStyleReference,
    onStyleStrengthChange: rm.handleStyleStrengthChange,
    onSubjectStrengthChange: rm.handleSubjectStrengthChange,
    onSubjectDescriptionChange: rm.handleSubjectDescriptionChange,
    onSubjectDescriptionFocus: rm.handleSubjectDescriptionFocus,
    onSubjectDescriptionBlur: rm.handleSubjectDescriptionBlur,
    onInThisSceneChange: rm.handleInThisSceneChange,
    onInThisSceneStrengthChange: rm.handleInThisSceneStrengthChange,
    onReferenceModeChange: rm.handleReferenceModeChange,
    onStyleBoostTermsChange: rm.handleStyleBoostTermsChange,
    onToggleVisibility: rm.handleToggleVisibility,
    onResourceSelect: rm.handleResourceSelect,
  }), [rm.handleSelectReference, rm.handleDeleteReference, rm.handleUpdateReferenceName, rm.handleStyleReferenceUpload, rm.handleRemoveStyleReference, rm.handleStyleStrengthChange, rm.handleSubjectStrengthChange, rm.handleSubjectDescriptionChange, rm.handleSubjectDescriptionFocus, rm.handleSubjectDescriptionBlur, rm.handleInThisSceneChange, rm.handleInThisSceneStrengthChange, rm.handleReferenceModeChange, rm.handleStyleBoostTermsChange, rm.handleToggleVisibility, rm.handleResourceSelect]);

  const loraState = useMemo<FormLoraState>(() => ({
    selectedLoras: loras.selectedLoras,
    availableLoras: loras.availableLoras,
  }), [loras.selectedLoras, loras.availableLoras]);

  const loraHandlersValue = useMemo<FormLoraHandlers>(() => ({
    handleAddLora: loras.handleAddLora,
    handleRemoveLora: loras.handleRemoveLora,
    handleLoraStrengthChange: loras.handleLoraStrengthChange,
  }), [loras.handleAddLora, loras.handleRemoveLora, loras.handleLoraStrengthChange]);

  return useContextValue({
    uiState,
    uiActions,
    core: coreState,
    prompts: promptState,
    promptHandlers: promptHandlersValue,
    references: referenceState,
    referenceHandlers: referenceHandlersValue,
    loras: loraState,
    loraHandlers: loraHandlersValue,
  });
}
