import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { updateSettingsCache } from '@/shared/hooks/settings/useToolSettings';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { toOperationResultError } from '@/shared/lib/operationResult';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { runOptimisticCacheUpdate } from './optimisticCacheUpdate';
import {
  createReferencePointer,
  persistReferenceSelection,
} from './referenceDomainService';
import type { Resource } from '@/shared/hooks/useResources';
import type {
  ProjectImageSettings,
  ReferenceImage,
  ReferenceMode,
} from '../../types';

interface UseResourceSelectHandlerInput {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  selectedReferenceIdByShot: Record<string, string | null>;
  referencePointers: ReferenceImage[];
  isLoadingProjectSettings: boolean;
  isLocalGenerationEnabled: boolean;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  referenceMode: ReferenceMode;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisScene: boolean;
  inThisSceneStrength: number;
  queryClient: QueryClient;
}

function applyExistingPointerSelection(input: {
  queryClient: QueryClient;
  selectedProjectId: string | undefined;
  selectedReferenceIdByShot: Record<string, string | null>;
  effectiveShotId: string;
  pointerId: string;
}): Record<string, string | null> {
  const optimisticUpdate = {
    ...input.selectedReferenceIdByShot,
    [input.effectiveShotId]: input.pointerId,
  };

  input.queryClient.setQueryData(
    settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, input.selectedProjectId, undefined),
    (prev: unknown) =>
      updateSettingsCache<ProjectImageSettings>(prev, {
        selectedReferenceIdByShot: optimisticUpdate,
      })
  );

  return optimisticUpdate;
}

function applyNewPointerSelection(input: {
  queryClient: QueryClient;
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  newPointer: ReferenceImage;
}): void {
  input.queryClient.setQueryData(
    settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, input.selectedProjectId, undefined),
    (prev: unknown) =>
      updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
        references: [...(prevSettings?.references || []), input.newPointer],
        selectedReferenceIdByShot: {
          ...(prevSettings?.selectedReferenceIdByShot || {}),
          [input.effectiveShotId]: input.newPointer.id,
        },
      }))
  );
}

export function useResourceSelectHandler(
  input: UseResourceSelectHandlerInput
): (resource: Resource) => Promise<void> {
  const {
    selectedProjectId,
    effectiveShotId,
    selectedReferenceIdByShot,
    referencePointers,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    referenceMode,
    styleReferenceStrength,
    subjectStrength,
    inThisScene,
    inThisSceneStrength,
    queryClient,
  } = input;

  return useCallback(async (resource: Resource) => {
    if (isLoadingProjectSettings) {
      toast.error('Please wait for settings to load');
      return;
    }

    try {
      const existingPointer = referencePointers.find((pointer) => pointer.resourceId === resource.id);
      if (existingPointer) {
        const optimisticUpdate = applyExistingPointerSelection({
          queryClient,
          selectedProjectId,
          selectedReferenceIdByShot,
          effectiveShotId,
          pointerId: existingPointer.id,
        });

        await updateProjectImageSettings('project', {
          selectedReferenceIdByShot: optimisticUpdate,
        });

        markAsInteracted();
        return;
      }

      const newPointer = createReferencePointer({
        resourceId: resource.id,
        referenceMode,
        isLocalGenerationEnabled,
        styleReferenceStrength,
        subjectStrength,
        inThisScene,
        inThisSceneStrength,
      });

      const optimisticUpdateResult = runOptimisticCacheUpdate(() => {
        applyNewPointerSelection({
          queryClient,
          selectedProjectId,
          effectiveShotId,
          newPointer,
        });
      }, 'useReferenceUpload.handleResourceSelect.optimisticUpdate');
      if (!optimisticUpdateResult.ok) {
        throw toOperationResultError(optimisticUpdateResult);
      }

      const persistResult = await persistReferenceSelection({
        queryClient,
        selectedProjectId,
        updateProjectImageSettings,
      });
      if (!persistResult.ok) {
        throw toOperationResultError(persistResult);
      }

      markAsInteracted();
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useReferenceUpload.handleResourceSelect',
        toastTitle: 'Failed to add reference',
      });
    }
  }, [
    effectiveShotId,
    inThisScene,
    inThisSceneStrength,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    markAsInteracted,
    queryClient,
    referenceMode,
    referencePointers,
    selectedProjectId,
    selectedReferenceIdByShot,
    styleReferenceStrength,
    subjectStrength,
    updateProjectImageSettings,
  ]);
}
