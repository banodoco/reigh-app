import { useCallback } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
} from '../../types';
import type { ReferenceActionHandlersOutput } from './types';

interface UseReferenceUpdaterInput {
  referencePointers: ReferenceImage[];
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
}

export function useReferenceUpdater(
  input: UseReferenceUpdaterInput
): ReferenceActionHandlersOutput['handleUpdateReference'] {
  const { referencePointers, updateProjectImageSettings, markAsInteracted } = input;

  return useCallback(async (referenceId: string, updates: Partial<HydratedReferenceImage>) => {
    const currentPointer = referencePointers.find((pointer) => pointer.id === referenceId);
    if (!currentPointer) {
      console.error('[useReferenceManagement] Could not find reference pointer:', referenceId);
      return;
    }

    const updatedPointer: ReferenceImage = {
      ...currentPointer,
      ...(updates.referenceMode !== undefined && { referenceMode: updates.referenceMode }),
      ...(updates.styleReferenceStrength !== undefined && {
        styleReferenceStrength: updates.styleReferenceStrength,
      }),
      ...(updates.subjectStrength !== undefined && {
        subjectStrength: updates.subjectStrength,
      }),
      ...(updates.subjectDescription !== undefined && {
        subjectDescription: updates.subjectDescription,
      }),
      ...(updates.inThisScene !== undefined && { inThisScene: updates.inThisScene }),
      ...(updates.inThisSceneStrength !== undefined && {
        inThisSceneStrength: updates.inThisSceneStrength,
      }),
      ...(updates.styleBoostTerms !== undefined && {
        styleBoostTerms: updates.styleBoostTerms,
      }),
    };

    const updatedReferences = referencePointers.map((pointer) =>
      pointer.id === referenceId ? updatedPointer : pointer
    );

    try {
      await updateProjectImageSettings('project', {
        references: updatedReferences,
      });
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useReferenceManagement.handleUpdateReference',
        toastTitle: 'Failed to update reference settings',
      });
    }

    markAsInteracted();
  }, [markAsInteracted, referencePointers, updateProjectImageSettings]);
}
