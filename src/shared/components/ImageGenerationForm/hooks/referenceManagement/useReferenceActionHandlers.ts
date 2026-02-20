import { useReferenceModeHandler } from './useReferenceModeHandler';
import { useReferenceSelectionHandlers } from './useReferenceSelectionHandlers';
import type { ReferenceActionHandlersInput, ReferenceActionHandlersOutput } from './types';
import { useReferenceUpdater } from './useReferenceUpdater';
import { useReferenceValueHandlers } from './useReferenceValueHandlers';

export function useReferenceActionHandlers(
  input: ReferenceActionHandlersInput
): ReferenceActionHandlersOutput {
  const {
    selectedReferenceId,
    selectedReferenceIdByShot,
    effectiveShotId,
    referencePointers,
    selectedProjectId,
    associatedShotId,
    shotPromptSettings,
    updateProjectImageSettings,
    markAsInteracted,
    isLocalGenerationEnabled,
    styleReferenceStrength,
    subjectStrength,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
    setReferenceMode,
    setIsEditingSubjectDescription,
    setHiresFixConfig,
    pendingReferenceModeUpdate,
    queryClient,
    handleDeleteReference,
  } = input;

  const handleUpdateReference = useReferenceUpdater({
    referencePointers,
    updateProjectImageSettings,
    markAsInteracted,
  });

  const { handleSelectReference, handleRemoveStyleReference } = useReferenceSelectionHandlers({
    selectedReferenceId,
    selectedReferenceIdByShot,
    effectiveShotId,
    selectedProjectId,
    associatedShotId,
    shotPromptSettings,
    updateProjectImageSettings,
    markAsInteracted,
    queryClient,
    handleDeleteReference,
  });

  const {
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
  } = useReferenceValueHandlers({
    selectedReferenceId,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
    setIsEditingSubjectDescription,
    handleUpdateReference,
  });

  const handleReferenceModeChange = useReferenceModeHandler({
    selectedReferenceId,
    isLocalGenerationEnabled,
    styleReferenceStrength,
    subjectStrength,
    pendingReferenceModeUpdate,
    setReferenceMode,
    setStyleReferenceStrength,
    setSubjectStrength,
    setInThisScene,
    setInThisSceneStrength,
    setHiresFixConfig,
    handleUpdateReference,
  });

  return {
    handleSelectReference,
    handleUpdateReference,
    handleRemoveStyleReference,
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
    handleReferenceModeChange,
  };
}
