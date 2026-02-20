import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HiresFixConfig, HydratedReferenceImage, ReferenceMode } from '../../types';
import { getReferenceModeDefaults } from '../../types';
import type { ReferenceActionHandlersOutput } from './types';

interface UseReferenceModeHandlerInput {
  selectedReferenceId: string | null;
  isLocalGenerationEnabled: boolean;
  styleReferenceStrength: number;
  subjectStrength: number;
  pendingReferenceModeUpdate: MutableRefObject<ReferenceMode | null>;
  setReferenceMode: Dispatch<SetStateAction<ReferenceMode>>;
  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setHiresFixConfig?: Dispatch<SetStateAction<Partial<HiresFixConfig>>>;
  handleUpdateReference: ReferenceActionHandlersOutput['handleUpdateReference'];
}

export function useReferenceModeHandler(
  input: UseReferenceModeHandlerInput
): ReferenceActionHandlersOutput['handleReferenceModeChange'] {
  const {
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
  } = input;

  return useCallback(async (mode: ReferenceMode) => {
    if (!selectedReferenceId) {
      return;
    }

    const defaults = getReferenceModeDefaults(mode, isLocalGenerationEnabled);
    const updates: Partial<HydratedReferenceImage> = {
      referenceMode: mode,
      ...defaults,
    };

    if (mode === 'custom') {
      const currentTotal = styleReferenceStrength + subjectStrength;
      if (currentTotal >= 0.5) {
        delete updates.styleReferenceStrength;
        delete updates.subjectStrength;
        delete updates.inThisScene;
        delete updates.inThisSceneStrength;
      }
    }

    pendingReferenceModeUpdate.current = mode;
    setReferenceMode(mode);

    if (updates.styleReferenceStrength !== undefined) {
      setStyleReferenceStrength(updates.styleReferenceStrength);
    }
    if (updates.subjectStrength !== undefined) {
      setSubjectStrength(updates.subjectStrength);
    }
    if (updates.inThisScene !== undefined) {
      setInThisScene(updates.inThisScene);
    }
    if (updates.inThisSceneStrength !== undefined) {
      setInThisSceneStrength(updates.inThisSceneStrength);
    }

    if ((mode === 'subject' || mode === 'scene') && setHiresFixConfig) {
      setHiresFixConfig((prev) => ({ ...prev, hires_denoise: 0.5 }));
    }

    await handleUpdateReference(selectedReferenceId, updates);
  }, [
    handleUpdateReference,
    isLocalGenerationEnabled,
    pendingReferenceModeUpdate,
    selectedReferenceId,
    setHiresFixConfig,
    setInThisScene,
    setInThisSceneStrength,
    setReferenceMode,
    setStyleReferenceStrength,
    setSubjectStrength,
    styleReferenceStrength,
    subjectStrength,
  ]);
}
