import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import type { ProjectImageSettings } from '../../types';
import type { ReferenceActionHandlersOutput } from './types';

interface UseReferenceSelectionHandlersInput {
  selectedReferenceId: string | null;
  selectedReferenceIdByShot: Record<string, string | null>;
  effectiveShotId: string;
  selectedProjectId: string | undefined;
  associatedShotId: string | null;
  shotPromptSettings?: { updateField: <T>(field: string, value: T) => void };
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  queryClient: QueryClient;
  handleDeleteReference: (referenceId: string) => Promise<void>;
}

interface ReferenceSelectionHandlers {
  handleSelectReference: ReferenceActionHandlersOutput['handleSelectReference'];
  handleRemoveStyleReference: ReferenceActionHandlersOutput['handleRemoveStyleReference'];
}

export function useReferenceSelectionHandlers(
  input: UseReferenceSelectionHandlersInput
): ReferenceSelectionHandlers {
  const {
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
  } = input;

  const handleSelectReference = useCallback(async (referenceId: string) => {
    if (associatedShotId && shotPromptSettings) {
      shotPromptSettings.updateField('selectedReferenceId', referenceId);
    }

    const optimisticUpdate = {
      ...selectedReferenceIdByShot,
      [effectiveShotId]: referenceId,
    };

    try {
      queryClient.setQueryData(
        settingsQueryKeys.tool('project-image-settings', selectedProjectId, undefined),
        (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, {
            selectedReferenceIdByShot: optimisticUpdate,
          })
      );
    } catch {
      // Intentionally ignored - cache update is best effort.
    }

    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate,
    });

    markAsInteracted();
  }, [
    associatedShotId,
    effectiveShotId,
    markAsInteracted,
    queryClient,
    selectedProjectId,
    selectedReferenceIdByShot,
    shotPromptSettings,
    updateProjectImageSettings,
  ]);

  const handleRemoveStyleReference = useCallback(async () => {
    if (!selectedReferenceId) {
      return;
    }

    await handleDeleteReference(selectedReferenceId);
  }, [handleDeleteReference, selectedReferenceId]);

  return {
    handleSelectReference,
    handleRemoveStyleReference,
  };
}
