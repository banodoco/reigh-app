import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { updateSettingsCache } from '@/shared/hooks/settings/useToolSettings';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { getOperationFailureLogData } from '@/shared/lib/operationResult';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import {
  buildStyleReferenceMetadata,
  resolveReferenceThumbnailUrl,
  tryUploadAndProcessReference,
} from './referenceDomainService';
import { persistOptimisticReferenceSelection } from './persistOptimisticReferenceSelection';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
} from '../../types';
import type { Resource } from '@/features/resources/hooks/useResources';

interface CreateStyleReferenceMutation {
  mutateAsync: (input: { type: 'style-reference'; metadata: StyleReferenceMetadata }) => Promise<Resource>;
}

interface UseStyleReferenceUploadHandlerInput {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  hydratedReferences: HydratedReferenceImage[];
  isLoadingProjectSettings: boolean;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  privacyDefaults: { resourcesPublic: boolean };
  queryClient: QueryClient;
  createStyleReference: CreateStyleReferenceMutation;
}

interface UseStyleReferenceUploadHandlerReturn {
  isUploadingStyleReference: boolean;
  styleReferenceOverride: string | null | undefined;
  setStyleReferenceOverride: Dispatch<SetStateAction<string | null | undefined>>;
  handleStyleReferenceUpload: (files: File[]) => Promise<void>;
}

function applyOptimisticUploadUpdate(input: {
  queryClient: QueryClient;
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  newPointer: ReferenceImage;
  resource: Resource;
}): void {
  const { queryClient, selectedProjectId, effectiveShotId, newPointer, resource } = input;
  queryClient.setQueryData(['resources', 'style-reference'], (prev: Resource[] | undefined) => {
    const previousResources = prev || [];
    return [...previousResources, resource];
  });

  queryClient.setQueryData(
    settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, selectedProjectId, undefined),
    (prev: unknown) =>
      updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
        references: [...(prevSettings?.references || []), newPointer],
        selectedReferenceIdByShot: {
          ...(prevSettings?.selectedReferenceIdByShot || {}),
          [effectiveShotId]: newPointer.id,
        },
      }))
  );
}

export function useStyleReferenceUploadHandler(
  input: UseStyleReferenceUploadHandlerInput
): UseStyleReferenceUploadHandlerReturn {
  const {
    selectedProjectId,
    effectiveShotId,
    hydratedReferences,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    queryClient,
    createStyleReference,
  } = input;

  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState(false);
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);

  const handleStyleReferenceUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    if (isLoadingProjectSettings) {
      toast.error('Please wait for settings to load');
      return;
    }

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      return;
    }

    try {
      setIsUploadingStyleReference(true);

      const uploadResult = await tryUploadAndProcessReference({
        file,
        selectedProjectId,
      });
      if (!uploadResult.ok) {
        normalizeAndPresentError(uploadResult.error, {
          context: 'useReferenceUpload.handleStyleReferenceUpload.tryUploadAndProcessReference',
          toastTitle: 'Failed to upload reference image',
          logData: getOperationFailureLogData(uploadResult),
        });
        return;
      }

      const { originalUploadedUrl, processedUploadedUrl } = uploadResult.value;
      const thumbnailResult = await resolveReferenceThumbnailUrl({
        file,
        fallbackUrl: originalUploadedUrl,
      });
      const thumbnailUrl = thumbnailResult.ok ? thumbnailResult.value : originalUploadedUrl;
      if (!thumbnailResult.ok) {
        normalizeAndPresentError(thumbnailResult.error, {
          context: 'useReferenceUpload.handleStyleReferenceUpload.thumbnailFallback',
          showToast: false,
          logData: getOperationFailureLogData(thumbnailResult),
        });
      }
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const metadata = buildStyleReferenceMetadata({
        hydratedReferences,
        processedUploadedUrl,
        originalUploadedUrl,
        thumbnailUrl,
        resourcesPublic: privacyDefaults.resourcesPublic,
        userEmail: user.email ?? null,
      });

      const resource = await createStyleReference.mutateAsync({
        type: 'style-reference',
        metadata,
      });

      const newPointer: ReferenceImage = {
        id: crypto.randomUUID(),
        resourceId: resource.id,
        createdAt: new Date().toISOString(),
      };

      const persistSelectionResult = await persistOptimisticReferenceSelection({
        queryClient,
        selectedProjectId,
        optimisticContext: 'useReferenceUpload.handleStyleReferenceUpload.optimisticUpdate',
        applyOptimisticUpdate: () => {
          applyOptimisticUploadUpdate({
            queryClient,
            selectedProjectId,
            effectiveShotId,
            newPointer,
            resource,
          });
        },
        updateProjectImageSettings,
      });
      if (!persistSelectionResult.ok) {
        normalizeAndPresentError(persistSelectionResult.error, {
          context: 'useReferenceUpload.handleStyleReferenceUpload.persistSelection',
          toastTitle: 'Failed to upload reference image',
          logData: getOperationFailureLogData(persistSelectionResult),
        });
        return;
      }

      markAsInteracted();
      setStyleReferenceOverride(originalUploadedUrl);
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useReferenceUpload.handleStyleReferenceUpload',
        toastTitle: 'Failed to upload reference image',
      });
    } finally {
      setIsUploadingStyleReference(false);
    }
  }, [
    createStyleReference,
    effectiveShotId,
    hydratedReferences,
    isLoadingProjectSettings,
    markAsInteracted,
    privacyDefaults,
    queryClient,
    selectedProjectId,
    updateProjectImageSettings,
  ]);

  return {
    isUploadingStyleReference,
    styleReferenceOverride,
    setStyleReferenceOverride,
    handleStyleReferenceUpload,
  };
}
