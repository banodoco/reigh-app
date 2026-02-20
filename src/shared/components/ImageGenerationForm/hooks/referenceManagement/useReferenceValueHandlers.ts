import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ReferenceActionHandlersOutput } from './types';

interface UseReferenceValueHandlersInput {
  selectedReferenceId: string | null;
  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setSubjectDescription: Dispatch<SetStateAction<string>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setStyleBoostTerms: Dispatch<SetStateAction<string>>;
  setIsEditingSubjectDescription: Dispatch<SetStateAction<boolean>>;
  handleUpdateReference: ReferenceActionHandlersOutput['handleUpdateReference'];
}

interface ReferenceValueHandlers {
  handleStyleStrengthChange: ReferenceActionHandlersOutput['handleStyleStrengthChange'];
  handleSubjectStrengthChange: ReferenceActionHandlersOutput['handleSubjectStrengthChange'];
  handleSubjectDescriptionChange: ReferenceActionHandlersOutput['handleSubjectDescriptionChange'];
  handleSubjectDescriptionFocus: ReferenceActionHandlersOutput['handleSubjectDescriptionFocus'];
  handleSubjectDescriptionBlur: ReferenceActionHandlersOutput['handleSubjectDescriptionBlur'];
  handleInThisSceneChange: ReferenceActionHandlersOutput['handleInThisSceneChange'];
  handleInThisSceneStrengthChange: ReferenceActionHandlersOutput['handleInThisSceneStrengthChange'];
  handleStyleBoostTermsChange: ReferenceActionHandlersOutput['handleStyleBoostTermsChange'];
}

export function useReferenceValueHandlers(
  input: UseReferenceValueHandlersInput
): ReferenceValueHandlers {
  const {
    selectedReferenceId,
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setStyleBoostTerms,
    setIsEditingSubjectDescription,
    handleUpdateReference,
  } = input;

  const handleStyleStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) {
      return;
    }

    setStyleReferenceStrength(value);
    await handleUpdateReference(selectedReferenceId, { styleReferenceStrength: value });
  }, [handleUpdateReference, selectedReferenceId, setStyleReferenceStrength]);

  const handleSubjectStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) {
      return;
    }

    setSubjectStrength(value);
    await handleUpdateReference(selectedReferenceId, { subjectStrength: value });
  }, [handleUpdateReference, selectedReferenceId, setSubjectStrength]);

  const handleSubjectDescriptionChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) {
      return;
    }

    setSubjectDescription(value);
    await handleUpdateReference(selectedReferenceId, { subjectDescription: value });
  }, [handleUpdateReference, selectedReferenceId, setSubjectDescription]);

  const handleSubjectDescriptionFocus = useCallback(() => {
    setIsEditingSubjectDescription(true);
  }, [setIsEditingSubjectDescription]);

  const handleSubjectDescriptionBlur = useCallback(() => {
    setIsEditingSubjectDescription(false);
  }, [setIsEditingSubjectDescription]);

  const handleInThisSceneChange = useCallback(async (value: boolean) => {
    if (!selectedReferenceId) {
      return;
    }

    setInThisScene(value);
    await handleUpdateReference(selectedReferenceId, { inThisScene: value });
  }, [handleUpdateReference, selectedReferenceId, setInThisScene]);

  const handleInThisSceneStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) {
      return;
    }

    setInThisSceneStrength(value);
    await handleUpdateReference(selectedReferenceId, { inThisSceneStrength: value });
  }, [handleUpdateReference, selectedReferenceId, setInThisSceneStrength]);

  const handleStyleBoostTermsChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) {
      return;
    }

    setStyleBoostTerms(value);
    await handleUpdateReference(selectedReferenceId, { styleBoostTerms: value });
  }, [handleUpdateReference, selectedReferenceId, setStyleBoostTerms]);

  return {
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
  };
}
