import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from '@/shared/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { fileToDataURL, dataURLtoFile } from '@/shared/lib/fileConversion';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import { generateThumbnailFilename, MEDIA_BUCKET, storagePaths } from '@/shared/lib/storagePaths';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { extractSettingsFromCache, updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
} from '../../types';
import type {
  Resource,
  StyleReferenceMetadata,
} from '@/shared/hooks/useResources';

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

interface UploadedReferenceUrls {
  originalUploadedUrl: string;
  processedUploadedUrl: string;
}

async function resolveThumbnailUrl(file: File, originalUploadedUrl: string): Promise<string> {
  try {
    const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }

    const thumbnailFilename = generateThumbnailFilename();
    const thumbnailPath = storagePaths.thumbnail(session.user.id, thumbnailFilename);
    const { error: thumbnailUploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(thumbnailPath, thumbnailResult.thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (thumbnailUploadError) {
      handleError(thumbnailUploadError, { context: 'useReferenceUpload.thumbnailUpload', showToast: false });
      return originalUploadedUrl;
    }

    const { data: thumbnailUrlData } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(thumbnailPath);
    return thumbnailUrlData.publicUrl;
  } catch (thumbnailError) {
    handleError(thumbnailError, { context: 'useReferenceUpload.thumbnailGeneration', showToast: false });
    return originalUploadedUrl;
  }
}

async function resolveUploadedReferenceUrls(
  file: File,
  selectedProjectId: string | undefined
): Promise<UploadedReferenceUrls> {
  const dataURL = await fileToDataURL(file);
  const originalUploadedUrl = await uploadImageToStorage(file);

  let processedDataURL = dataURL;
  if (selectedProjectId) {
    const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
    const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
    if (!processed) {
      throw new Error('Failed to process image for aspect ratio');
    }
    processedDataURL = processed;
  }

  const processedFile = dataURLtoFile(processedDataURL, `style-reference-processed-${Date.now()}.png`);
  if (!processedFile) {
    throw new Error('Failed to convert processed image to file');
  }

  const processedUploadedUrl = await uploadImageToStorage(processedFile);
  return { originalUploadedUrl, processedUploadedUrl };
}

function buildReferenceMetadata(input: {
  hydratedReferences: HydratedReferenceImage[];
  processedUploadedUrl: string;
  originalUploadedUrl: string;
  thumbnailUrl: string;
  resourcesPublic: boolean;
  userEmail: string | null;
}): StyleReferenceMetadata {
  const now = new Date().toISOString();
  return {
    name: `Reference ${(input.hydratedReferences.length + 1)}`,
    styleReferenceImage: input.processedUploadedUrl,
    styleReferenceImageOriginal: input.originalUploadedUrl,
    thumbnailUrl: input.thumbnailUrl,
    styleReferenceStrength: 1.1,
    subjectStrength: 0.0,
    subjectDescription: '',
    inThisScene: false,
    inThisSceneStrength: 1.0,
    referenceMode: 'style',
    styleBoostTerms: '',
    is_public: input.resourcesPublic,
    created_by: {
      is_you: true,
      username: input.userEmail || 'user',
    },
    createdAt: now,
    updatedAt: now,
  };
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
    settingsQueryKeys.tool('project-image-settings', selectedProjectId, undefined),
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

      const { originalUploadedUrl, processedUploadedUrl } = await resolveUploadedReferenceUrls(file, selectedProjectId);
      const thumbnailUrl = await resolveThumbnailUrl(file, originalUploadedUrl);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const metadata = buildReferenceMetadata({
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

      try {
        applyOptimisticUploadUpdate({
          queryClient,
          selectedProjectId,
          effectiveShotId,
          newPointer,
          resource,
        });
      } catch {
        // Intentionally ignored - cache update is best effort.
      }

      const currentData = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(settingsQueryKeys.tool('project-image-settings', selectedProjectId, undefined))
      ) || {};

      await updateProjectImageSettings('project', {
        references: currentData.references || [],
        selectedReferenceIdByShot: currentData.selectedReferenceIdByShot || {},
      });

      markAsInteracted();
      setStyleReferenceOverride(originalUploadedUrl);
    } catch (error) {
      handleError(error, {
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
