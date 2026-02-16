/**
 * useReferenceUpload - Handles uploading and selecting reference images
 *
 * Orchestrator hook that composes:
 * - Upload flow (new file -> thumbnail, processing, storage, resource creation)
 * - Select flow (existing resource -> pointer creation or selection switch)
 * - Resource mutations (delete, update name, toggle visibility) via useReferenceResourceMutations
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { nanoid } from 'nanoid';
import { supabase } from '@/integrations/supabase/client';
import { fileToDataURL, dataURLtoFile } from '@/shared/lib/utils';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import { storagePaths, generateThumbnailFilename, MEDIA_BUCKET } from '@/shared/lib/storagePaths';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { extractSettingsFromCache, updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { useCreateResource, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import {
  ReferenceImage,
  HydratedReferenceImage,
  ReferenceMode,
  ProjectImageSettings,
  getReferenceModeDefaults,
} from '../types';
import { useReferenceResourceMutations } from './useReferenceResourceMutations';

// ============================================================================
// Types
// ============================================================================

interface UseReferenceUploadProps {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  selectedReferenceIdByShot: Record<string, string | null>;
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  isLoadingProjectSettings: boolean;
  isLocalGenerationEnabled: boolean;
  updateProjectImageSettings: (scope: 'project' | 'shot', updates: Partial<ProjectImageSettings>) => Promise<void>;
  markAsInteracted: () => void;
  privacyDefaults: { resourcesPublic: boolean };
  // Current local state for creating pointers with correct defaults
  referenceMode: ReferenceMode;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisScene: boolean;
  inThisSceneStrength: number;
}

interface UseReferenceUploadReturn {
  isUploadingStyleReference: boolean;
  /** Local override for display image (set after upload, cleared when DB catches up) */
  styleReferenceOverride: string | null | undefined;
  setStyleReferenceOverride: React.Dispatch<React.SetStateAction<string | null | undefined>>;
  handleStyleReferenceUpload: (files: File[]) => Promise<void>;
  handleResourceSelect: (resource: Resource) => Promise<void>;
  handleDeleteReference: (referenceId: string) => Promise<void>;
  handleUpdateReferenceName: (referenceId: string, name: string) => Promise<void>;
  handleToggleVisibility: (resourceId: string, currentIsPublic: boolean) => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useReferenceUpload(props: UseReferenceUploadProps): UseReferenceUploadReturn {
  const {
    selectedProjectId,
    effectiveShotId,
    selectedReferenceIdByShot,
    referencePointers,
    hydratedReferences,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    referenceMode,
    styleReferenceStrength,
    subjectStrength,
    inThisScene,
    inThisSceneStrength,
  } = props;

  const queryClient = useQueryClient();

  // Resource creation hook (upload-specific)
  const createStyleReference = useCreateResource();

  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState(false);
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);

  // Compose resource mutation sub-hook (delete, update name, toggle visibility)
  const { handleDeleteReference, handleUpdateReferenceName, handleToggleVisibility } =
    useReferenceResourceMutations({
      selectedProjectId,
      referencePointers,
      hydratedReferences,
      selectedReferenceIdByShot,
      updateProjectImageSettings,
      markAsInteracted,
    });

  // ============================================================================
  // Upload New Reference
  // ============================================================================

  const handleStyleReferenceUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // GUARD: Don't add references while settings are loading
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
      const dataURL = await fileToDataURL(file);

      // Upload the original image first (for display purposes)
      const originalUploadedUrl = await uploadImageToStorage(file);

      // Generate and upload thumbnail for grid display
      let thumbnailUrl: string | null = null;
      try {
        const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);

        // Upload thumbnail to storage
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
            upsert: true
          });

        if (thumbnailUploadError) {
          handleError(thumbnailUploadError, { context: 'useReferenceUpload.thumbnailUpload', showToast: false });
          thumbnailUrl = originalUploadedUrl;
        } else {
          const { data: thumbnailUrlData } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
        }
      } catch (thumbnailError) {
        handleError(thumbnailError, { context: 'useReferenceUpload.thumbnailGeneration', showToast: false });
        thumbnailUrl = originalUploadedUrl;
      }

      // Process the image to match project aspect ratio (for generation)
      let processedDataURL = dataURL;
      if (selectedProjectId) {
        const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
        const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);

        if (processed) {
          processedDataURL = processed;
        } else {
          throw new Error('Failed to process image for aspect ratio');
        }
      }

      // Convert processed data URL back to File for upload
      const processedFile = dataURLtoFile(processedDataURL, `style-reference-processed-${Date.now()}.png`);
      if (!processedFile) {
        throw new Error('Failed to convert processed image to file');
      }

      // Upload processed version to storage
      const processedUploadedUrl = await uploadImageToStorage(processedFile);

      // Get user for metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create resource metadata
      const now = new Date().toISOString();
      const metadata: StyleReferenceMetadata = {
        name: `Reference ${(hydratedReferences.length + 1)}`,
        styleReferenceImage: processedUploadedUrl,
        styleReferenceImageOriginal: originalUploadedUrl,
        thumbnailUrl: thumbnailUrl,
        styleReferenceStrength: 1.1,
        subjectStrength: 0.0,
        subjectDescription: "",
        inThisScene: false,
        inThisSceneStrength: 1.0,
        referenceMode: 'style',
        styleBoostTerms: '',
        is_public: privacyDefaults.resourcesPublic,
        created_by: {
          is_you: true,
          username: user.email || 'user',
        },
        createdAt: now,
        updatedAt: now,
      };

      // Create resource in resources table
      const resource = await createStyleReference.mutateAsync({
        type: 'style-reference',
        metadata,
      });

      // Create lightweight pointer
      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
        createdAt: new Date().toISOString(),
      };

      // Optimistic UI updates
      try {
        queryClient.setQueryData(['resources', 'style-reference'], (prev: Resource[] | undefined) => {
          const prevResources = prev || [];
          return [...prevResources, resource];
        });

        queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
            references: [...(prevSettings?.references || []), newPointer],
            selectedReferenceIdByShot: {
              ...(prevSettings?.selectedReferenceIdByShot || {}),
              [effectiveShotId]: newPointer.id
            }
          }))
        );
      } catch (e) { /* intentionally ignored */ }

      // Read from cache after optimistic update
      const currentData = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined))
      ) || {};

      await updateProjectImageSettings('project', {
        references: currentData?.references || [],
        selectedReferenceIdByShot: currentData?.selectedReferenceIdByShot || {}
      });

      markAsInteracted();
      setStyleReferenceOverride(originalUploadedUrl);

    } catch (error) {
      handleError(error, { context: 'useReferenceUpload.handleStyleReferenceUpload', toastTitle: 'Failed to upload reference image' });
    } finally {
      setIsUploadingStyleReference(false);
    }
  }, [
    effectiveShotId,
    updateProjectImageSettings,
    markAsInteracted,
    selectedProjectId,
    hydratedReferences,
    queryClient,
    createStyleReference,
    isLoadingProjectSettings,
    privacyDefaults,
  ]);

  // ============================================================================
  // Select Existing Resource
  // ============================================================================

  const handleResourceSelect = useCallback(async (resource: Resource) => {
    if (isLoadingProjectSettings) {
      toast.error('Please wait for settings to load');
      return;
    }

    try {
      // Check if we already have this resource linked
      const existingPointer = referencePointers.find(ptr => ptr.resourceId === resource.id);

      if (existingPointer) {

        const optimisticUpdate = {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: existingPointer.id
        };

        try {
          queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
            updateSettingsCache<ProjectImageSettings>(prev, { selectedReferenceIdByShot: optimisticUpdate })
          );
        } catch (e) { /* intentionally ignored */ }

        await updateProjectImageSettings('project', {
          selectedReferenceIdByShot: optimisticUpdate
        });

        markAsInteracted();
        return;
      }

      // Create lightweight pointer to existing resource
      const modeDefaults = referenceMode === 'custom'
        ? { styleReferenceStrength, subjectStrength, inThisScene, inThisSceneStrength }
        : getReferenceModeDefaults(referenceMode, isLocalGenerationEnabled);

      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
        subjectDescription: '',
        styleBoostTerms: '',
        referenceMode: referenceMode,
        createdAt: new Date().toISOString(),
        ...modeDefaults,
      };

      // Optimistic UI update
      try {
        queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, (prevSettings) => ({
            references: [...(prevSettings?.references || []), newPointer],
            selectedReferenceIdByShot: {
              ...(prevSettings?.selectedReferenceIdByShot || {}),
              [effectiveShotId]: newPointer.id
            }
          }))
        );
      } catch (e) {
        handleError(e, { context: 'useReferenceUpload.handleResourceSelect.optimisticUpdate', showToast: false });
      }

      const currentData = extractSettingsFromCache<ProjectImageSettings>(
        queryClient.getQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined))
      ) || {};

      await updateProjectImageSettings('project', {
        references: currentData?.references || [],
        selectedReferenceIdByShot: currentData?.selectedReferenceIdByShot || {}
      });

      markAsInteracted();
    } catch (error) {
      handleError(error, { context: 'useReferenceUpload.handleResourceSelect', toastTitle: 'Failed to add reference' });
    }
  }, [
    effectiveShotId,
    updateProjectImageSettings,
    queryClient,
    selectedProjectId,
    markAsInteracted,
    referencePointers,
    selectedReferenceIdByShot,
    referenceMode,
    styleReferenceStrength,
    subjectStrength,
    inThisScene,
    inThisSceneStrength,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
  ]);

  return {
    isUploadingStyleReference,
    styleReferenceOverride,
    setStyleReferenceOverride,
    handleStyleReferenceUpload,
    handleResourceSelect,
    handleDeleteReference,
    handleUpdateReferenceName,
    handleToggleVisibility,
  };
}
