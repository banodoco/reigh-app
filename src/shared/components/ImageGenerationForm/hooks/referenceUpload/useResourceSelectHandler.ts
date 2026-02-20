import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from '@/shared/components/ui/sonner';
import { extractSettingsFromCache, updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import type { Resource } from '@/shared/hooks/useResources';
import type {
  ProjectImageSettings,
  ReferenceImage,
  ReferenceMode,
} from '../../types';
import { getReferenceModeDefaults } from '../../types';

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
    settingsQueryKeys.tool('project-image-settings', input.selectedProjectId, undefined),
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
    settingsQueryKeys.tool('project-image-settings', input.selectedProjectId, undefined),
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

function buildReferencePointer(input: {
  resourceId: string;
  referenceMode: ReferenceMode;
  isLocalGenerationEnabled: boolean;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisScene: boolean;
  inThisSceneStrength: number;
}): ReferenceImage {
  const modeDefaults = input.referenceMode === 'custom'
    ? {
        styleReferenceStrength: input.styleReferenceStrength,
        subjectStrength: input.subjectStrength,
        inThisScene: input.inThisScene,
        inThisSceneStrength: input.inThisSceneStrength,
      }
    : getReferenceModeDefaults(input.referenceMode, input.isLocalGenerationEnabled);

  return {
    id: nanoid(),
    resourceId: input.resourceId,
    subjectDescription: '',
    styleBoostTerms: '',
    referenceMode: input.referenceMode,
    createdAt: new Date().toISOString(),
    ...modeDefaults,
  };
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

      const newPointer = buildReferencePointer({
        resourceId: resource.id,
        referenceMode,
        isLocalGenerationEnabled,
        styleReferenceStrength,
        subjectStrength,
        inThisScene,
        inThisSceneStrength,
      });

      try {
        applyNewPointerSelection({
          queryClient,
          selectedProjectId,
          effectiveShotId,
          newPointer,
        });
      } catch (error) {
        handleError(error, {
          context: 'useReferenceUpload.handleResourceSelect.optimisticUpdate',
          showToast: false,
        });
      }

      const currentData = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(settingsQueryKeys.tool('project-image-settings', selectedProjectId, undefined))
      ) || {};

      await updateProjectImageSettings('project', {
        references: currentData.references || [],
        selectedReferenceIdByShot: currentData.selectedReferenceIdByShot || {},
      });

      markAsInteracted();
    } catch (error) {
      handleError(error, {
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
