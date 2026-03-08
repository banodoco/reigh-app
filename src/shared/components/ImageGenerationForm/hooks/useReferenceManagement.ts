/**
 * useReferenceManagement - Manages reference image state and operations
 */

import { useQueryClient } from '@tanstack/react-query';
import { useReferenceUpload } from './useReferenceUpload';
import { useReferenceActionHandlers } from './referenceManagement/useReferenceActionHandlers';
import { useReferenceDisplayState } from './referenceManagement/useReferenceDisplayState';
import type {
  ReferenceManagementInput,
  ReferenceManagementOutput,
} from './referenceManagement/types';
import { useReferenceUiState } from './referenceManagement/useReferenceUiState';

;

export function useReferenceManagement(
  input: ReferenceManagementInput
): ReferenceManagementOutput {
  const {
    selectedProjectId,
    effectiveShotId,
    selectedReferenceId,
    selectedReferenceIdByShot,
    referencePointers,
    hydratedReferences,
    selectedReference,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    associatedShotId,
    shotPromptSettings,
    setHiresFixConfig,
  } = input;

  const queryClient = useQueryClient();
  const state = useReferenceUiState();

  const upload = useReferenceUpload({
    selectedProjectId,
    effectiveShotId,
    selectedReferenceIdByShot,
    referencePointers,
    hydratedReferences,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    referenceMode: state.referenceMode,
    styleReferenceStrength: state.styleReferenceStrength,
    subjectStrength: state.subjectStrength,
    inThisScene: state.inThisScene,
    inThisSceneStrength: state.inThisSceneStrength,
  });

  const displayState = useReferenceDisplayState({
    selectedReference,
    selectedReferenceId,
    styleReferenceOverride: upload.styleReferenceOverride,
    setStyleReferenceOverride: upload.setStyleReferenceOverride,
    setReferenceMode: state.setReferenceMode,
    setStyleReferenceStrength: state.setStyleReferenceStrength,
    setSubjectStrength: state.setSubjectStrength,
    setSubjectDescription: state.setSubjectDescription,
    setInThisScene: state.setInThisScene,
    setInThisSceneStrength: state.setInThisSceneStrength,
    setStyleBoostTerms: state.setStyleBoostTerms,
  });

  const handlers = useReferenceActionHandlers({
    identity: {
      selectedReferenceId,
      selectedReferenceIdByShot,
      effectiveShotId,
      referencePointers,
      selectedProjectId,
      associatedShotId,
      shotPromptSettings,
    },
    referenceState: {
      isLocalGenerationEnabled,
      styleReferenceStrength: state.styleReferenceStrength,
      subjectStrength: state.subjectStrength,
    },
    stateSetters: {
      setStyleReferenceStrength: state.setStyleReferenceStrength,
      setSubjectStrength: state.setSubjectStrength,
      setSubjectDescription: state.setSubjectDescription,
      setInThisScene: state.setInThisScene,
      setInThisSceneStrength: state.setInThisSceneStrength,
      setStyleBoostTerms: state.setStyleBoostTerms,
      setReferenceMode: state.setReferenceMode,
      setIsEditingSubjectDescription: state.setIsEditingSubjectDescription,
      setHiresFixConfig,
    },
    mutations: {
      updateProjectImageSettings,
      markAsInteracted,
      pendingReferenceModeUpdate: displayState.pendingReferenceModeUpdate,
      queryClient,
      handleDeleteReference: upload.handleDeleteReference,
    },
  });

  return {
    styleReferenceStrength: state.styleReferenceStrength,
    subjectStrength: state.subjectStrength,
    subjectDescription: state.subjectDescription,
    isEditingSubjectDescription: state.isEditingSubjectDescription,
    inThisScene: state.inThisScene,
    inThisSceneStrength: state.inThisSceneStrength,
    referenceMode: state.referenceMode,
    styleBoostTerms: state.styleBoostTerms,
    isUploadingStyleReference: upload.isUploadingStyleReference,
    styleReferenceOverride: upload.styleReferenceOverride,

    styleReferenceImageDisplay: displayState.styleReferenceImageDisplay,
    styleReferenceImageGeneration: displayState.styleReferenceImageGeneration,

    handleStyleReferenceUpload: upload.handleStyleReferenceUpload,
    handleResourceSelect: upload.handleResourceSelect,
    handleSelectReference: handlers.handleSelectReference,
    handleDeleteReference: upload.handleDeleteReference,
    handleUpdateReference: handlers.handleUpdateReference,
    handleUpdateReferenceName: upload.handleUpdateReferenceName,
    handleToggleVisibility: upload.handleToggleVisibility,
    handleRemoveStyleReference: handlers.handleRemoveStyleReference,
    handleStyleStrengthChange: handlers.handleStyleStrengthChange,
    handleSubjectStrengthChange: handlers.handleSubjectStrengthChange,
    handleSubjectDescriptionChange: handlers.handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus: handlers.handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur: handlers.handleSubjectDescriptionBlur,
    handleInThisSceneChange: handlers.handleInThisSceneChange,
    handleInThisSceneStrengthChange: handlers.handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange: handlers.handleStyleBoostTermsChange,
    handleReferenceModeChange: handlers.handleReferenceModeChange,
  };
}
