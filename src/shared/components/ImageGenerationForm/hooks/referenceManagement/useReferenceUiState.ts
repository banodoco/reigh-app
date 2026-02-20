import { useState } from 'react';
import type { ReferenceMode } from '../../types';
import type { ReferenceManagementState } from './types';

export function useReferenceUiState(): ReferenceManagementState {
  const [styleReferenceStrength, setStyleReferenceStrength] = useState<number>(1.0);
  const [subjectStrength, setSubjectStrength] = useState<number>(0.0);
  const [subjectDescription, setSubjectDescription] = useState<string>('');
  const [isEditingSubjectDescription, setIsEditingSubjectDescription] =
    useState<boolean>(false);
  const [inThisScene, setInThisScene] = useState<boolean>(false);
  const [inThisSceneStrength, setInThisSceneStrength] = useState<number>(0.5);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('style');
  const [styleBoostTerms, setStyleBoostTerms] = useState<string>('');

  return {
    styleReferenceStrength,
    subjectStrength,
    subjectDescription,
    isEditingSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    styleBoostTerms,

    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setIsEditingSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setReferenceMode,
    setStyleBoostTerms,
  };
}
