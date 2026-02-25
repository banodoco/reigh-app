import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { toOperationResultError } from '@/shared/lib/operationResult';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { runOptimisticCacheUpdate } from './optimisticCacheUpdate';
import {
  buildStyleReferenceMetadata,
  persistReferenceSelection,
  resolveReferenceThumbnailUrl,
  uploadAndProcessReference,
} from './referenceDomainService';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
} from '../../types';
import type { Resource } from '@/shared/hooks/useResources';

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

      const uploadResult = await uploadAndProcessReference({
        file,
        selectedProjectId,
      });
      if (!uploadResult.ok) {
        throw toOperationResultError(uploadResult);
      }

      const { originalUploadedUrl, processedUploadedUrl } = uploadResult.value;
      const thumbnailResult = await resolveReferenceThumbnailUrl({
        file,
        fallbackUrl: originalUploadedUrl,
      });
      const thumbnailUrl = thumbnailResult.ok ? thumbnailResult.value : originalUploadedUrl;
      if (!thumbnailResult.ok) {
        normalizeAndPresentError(toOperationResultError(thumbnailResult), {
          context: 'useReferenceUpload.handleStyleReferenceUpload.thumbnailFallback',
          showToast: false,
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
        id: nanoid(),
        resourceId: resource.id,
        createdAt: new Date().toISOString(),
      };

      runOptimisticCacheUpdate(() => {
        applyOptimisticUploadUpdate({
          queryClient,
          selectedProjectId,
          effectiveShotId,
          newPointer,
          resource,
        });
      }, 'useReferenceUpload.handleStyleReferenceUpload.optimisticUpdate');

      const persistResult = await persistReferenceSelection({
        queryClient,
        selectedProjectId,
        updateProjectImageSettings,
      });
      if (!persistResult.ok) {
        throw toOperationResultError(persistResult);
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
