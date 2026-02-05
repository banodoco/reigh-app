/**
 * useReferenceManagement - Manages reference image state and operations
 *
 * Extracted from ImageGenerationForm to handle:
 * - Local UI state for reference settings (strengths, mode, etc.)
 * - CRUD operations for references (upload, select, delete, update)
 * - Syncing reference settings to project storage
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { useCreateResource, useUpdateResource, useDeleteResource, StyleReferenceMetadata, Resource } from '@/shared/hooks/useResources';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import {
  ReferenceImage,
  HydratedReferenceImage,
  ReferenceMode,
  ProjectImageSettings,
  getReferenceModeDefaults,
  HiresFixConfig,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseReferenceManagementProps {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  selectedReferenceId: string | null;
  selectedReferenceIdByShot: Record<string, string | null>;
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  selectedReference: HydratedReferenceImage | null;
  isLoadingProjectSettings: boolean;
  isLocalGenerationEnabled: boolean;
  updateProjectImageSettings: (scope: 'project' | 'shot', updates: Partial<ProjectImageSettings>) => Promise<void>;
  markAsInteracted: () => void;
  privacyDefaults: { resourcesPublic: boolean };
  // Optional: shot settings for shot-level reference selection
  associatedShotId: string | null;
  shotPromptSettings?: {
    updateField: <T>(field: string, value: T) => void;
  };
  // Callback when hires fix config should be updated (for mode changes)
  setHiresFixConfig?: React.Dispatch<React.SetStateAction<Partial<HiresFixConfig>>>;
}

export interface UseReferenceManagementReturn {
  // Local UI state
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  isEditingSubjectDescription: boolean;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
  styleBoostTerms: string;
  isUploadingStyleReference: boolean;
  styleReferenceOverride: string | null | undefined;

  // Display computed values
  styleReferenceImageDisplay: string | null;
  styleReferenceImageGeneration: string | null;

  // Handlers
  handleStyleReferenceUpload: (files: File[]) => Promise<void>;
  handleResourceSelect: (resource: Resource) => Promise<void>;
  handleSelectReference: (referenceId: string) => Promise<void>;
  handleDeleteReference: (referenceId: string) => Promise<void>;
  handleUpdateReference: (referenceId: string, updates: Partial<HydratedReferenceImage>) => Promise<void>;
  handleUpdateReferenceName: (referenceId: string, name: string) => Promise<void>;
  handleToggleVisibility: (resourceId: string, currentIsPublic: boolean) => Promise<void>;
  handleRemoveStyleReference: () => Promise<void>;
  handleStyleStrengthChange: (value: number) => Promise<void>;
  handleSubjectStrengthChange: (value: number) => Promise<void>;
  handleSubjectDescriptionChange: (value: string) => Promise<void>;
  handleSubjectDescriptionFocus: () => void;
  handleSubjectDescriptionBlur: () => void;
  handleInThisSceneChange: (value: boolean) => Promise<void>;
  handleInThisSceneStrengthChange: (value: number) => Promise<void>;
  handleStyleBoostTermsChange: (value: string) => Promise<void>;
  handleReferenceModeChange: (mode: ReferenceMode) => Promise<void>;

  // State setters (for external sync needs)
  setStyleReferenceStrength: React.Dispatch<React.SetStateAction<number>>;
  setSubjectStrength: React.Dispatch<React.SetStateAction<number>>;
  setSubjectDescription: React.Dispatch<React.SetStateAction<string>>;
  setInThisScene: React.Dispatch<React.SetStateAction<boolean>>;
  setInThisSceneStrength: React.Dispatch<React.SetStateAction<number>>;
  setReferenceMode: React.Dispatch<React.SetStateAction<ReferenceMode>>;
  setStyleBoostTerms: React.Dispatch<React.SetStateAction<string>>;
  setStyleReferenceOverride: React.Dispatch<React.SetStateAction<string | null | undefined>>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useReferenceManagement(props: UseReferenceManagementProps): UseReferenceManagementReturn {
  const {
    selectedProjectId,
    effectiveShotId,
    selectedReferenceId,
    selectedReferenceIdByShot,
    referencePointers,
    hydratedReferences,
    selectedReference,
    isLoadingProjectSettings,
    isLocalGenerationEnabled,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    associatedShotId,
    shotPromptSettings,
    setHiresFixConfig,
  } = props;

  const queryClient = useQueryClient();

  // Resource mutation hooks
  const createStyleReference = useCreateResource();
  const updateStyleReference = useUpdateResource();
  const deleteStyleReference = useDeleteResource();

  // ============================================================================
  // Local UI State
  // ============================================================================

  const [styleReferenceStrength, setStyleReferenceStrength] = useState<number>(1.0);
  const [subjectStrength, setSubjectStrength] = useState<number>(0.0);
  const [subjectDescription, setSubjectDescription] = useState<string>('');
  const [isEditingSubjectDescription, setIsEditingSubjectDescription] = useState<boolean>(false);
  const [inThisScene, setInThisScene] = useState<boolean>(false);
  const [inThisSceneStrength, setInThisSceneStrength] = useState<number>(0.5);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('style');
  const [styleBoostTerms, setStyleBoostTerms] = useState<string>('');
  const [isUploadingStyleReference, setIsUploadingStyleReference] = useState<boolean>(false);
  const [styleReferenceOverride, setStyleReferenceOverride] = useState<string | null | undefined>(undefined);

  // Pending mode update tracking
  const pendingReferenceModeUpdate = useRef<ReferenceMode | null>(null);

  // ============================================================================
  // Derived Values from Selected Reference
  // ============================================================================

  // Get current values from the selected reference (for backward compatibility)
  const rawStyleReferenceImage = selectedReference?.styleReferenceImage || null;
  const rawStyleReferenceImageOriginal = selectedReference?.styleReferenceImageOriginal || null;

  // Display image (use original if available, fallback to processed)
  const styleReferenceImageDisplay = useMemo(() => {
    // If we have an explicit local override (including null), use it
    if (styleReferenceOverride !== undefined) {
      return styleReferenceOverride;
    }

    // Prefer original image for display
    const imageToDisplay = rawStyleReferenceImageOriginal || rawStyleReferenceImage;
    if (!imageToDisplay) return null;

    // If it's already a URL, return as-is
    if (imageToDisplay.startsWith('http')) {
      return imageToDisplay;
    }

    // If it's base64 data, return null to trigger re-upload
    if (imageToDisplay.startsWith('data:image/')) {
      console.warn('[useReferenceManagement] Found legacy base64 style reference, needs conversion');
      return null;
    }

    return imageToDisplay;
  }, [styleReferenceOverride, rawStyleReferenceImageOriginal, rawStyleReferenceImage]);

  // Generation image (always use processed version)
  const styleReferenceImageGeneration = useMemo(() => {
    if (!rawStyleReferenceImage) return null;

    // If it's already a URL, return as-is
    if (rawStyleReferenceImage.startsWith('http')) {
      return rawStyleReferenceImage;
    }

    // If it's base64 data, return null
    if (rawStyleReferenceImage.startsWith('data:image/')) {
      console.warn('[useReferenceManagement] Found legacy base64 style reference, needs conversion');
      return null;
    }

    return rawStyleReferenceImage;
  }, [rawStyleReferenceImage]);

  // ============================================================================
  // Sync Effects
  // ============================================================================

  // When the backing setting updates, drop the local override
  useEffect(() => {
    setStyleReferenceOverride(undefined);
  }, [rawStyleReferenceImage]);

  // Clear pending mode update when switching references
  const prevSelectedReferenceId = useRef(selectedReferenceId);
  useEffect(() => {
    if (prevSelectedReferenceId.current !== selectedReferenceId) {
      pendingReferenceModeUpdate.current = null;
      prevSelectedReferenceId.current = selectedReferenceId;
    }
  }, [selectedReferenceId]);

  // Check if database has caught up with pending mode update
  useEffect(() => {
    const currentReferenceMode = selectedReference?.referenceMode || 'style';
    if (pendingReferenceModeUpdate.current && currentReferenceMode === pendingReferenceModeUpdate.current) {
      console.log('[useReferenceManagement] Database caught up with pending mode update:', currentReferenceMode);
      pendingReferenceModeUpdate.current = null;
    }
  }, [selectedReference?.referenceMode]);

  // Sync local state from selectedReference when reference changes
  const lastSyncedReferenceId = useRef<string | null>(null);
  useEffect(() => {
    // Only sync when reference ID actually changes (not on every re-render)
    if (selectedReference && selectedReference.id !== lastSyncedReferenceId.current) {
      console.log('[useReferenceManagement] Syncing local state from reference:', selectedReference.id);
      lastSyncedReferenceId.current = selectedReference.id;

      // Sync all reference settings to local state
      setReferenceMode(selectedReference.referenceMode || 'style');
      setStyleReferenceStrength(selectedReference.styleReferenceStrength ?? 1.0);
      setSubjectStrength(selectedReference.subjectStrength ?? 0.0);
      setSubjectDescription(selectedReference.subjectDescription ?? '');
      setInThisScene(selectedReference.inThisScene ?? false);
      setInThisSceneStrength(selectedReference.inThisSceneStrength ?? 0.5);
      setStyleBoostTerms(selectedReference.styleBoostTerms ?? '');
    }
  }, [selectedReference]);

  // ============================================================================
  // Core Reference Update Handler
  // ============================================================================

  const handleUpdateReference = useCallback(async (referenceId: string, updates: Partial<HydratedReferenceImage>) => {
    console.log('[useReferenceManagement] Updating reference settings:', { referenceId, updates });

    // Find the current pointer
    const currentPointer = referencePointers.find(r => r.id === referenceId);
    if (!currentPointer) {
      console.error('[useReferenceManagement] Could not find reference pointer:', referenceId);
      return;
    }

    // Update only the project-specific usage settings in the pointer
    const updatedPointer: ReferenceImage = {
      ...currentPointer,
      ...(updates.referenceMode !== undefined && { referenceMode: updates.referenceMode }),
      ...(updates.styleReferenceStrength !== undefined && { styleReferenceStrength: updates.styleReferenceStrength }),
      ...(updates.subjectStrength !== undefined && { subjectStrength: updates.subjectStrength }),
      ...(updates.subjectDescription !== undefined && { subjectDescription: updates.subjectDescription }),
      ...(updates.inThisScene !== undefined && { inThisScene: updates.inThisScene }),
      ...(updates.inThisSceneStrength !== undefined && { inThisSceneStrength: updates.inThisSceneStrength }),
      ...(updates.styleBoostTerms !== undefined && { styleBoostTerms: updates.styleBoostTerms }),
    };

    // Update the references array in project settings
    const updatedReferences = referencePointers.map(ref =>
      ref.id === referenceId ? updatedPointer : ref
    );

    try {
      await updateProjectImageSettings('project', {
        references: updatedReferences,
      });
      console.log('[useReferenceManagement] Project settings updated successfully');
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleUpdateReference', toastTitle: 'Failed to update reference settings' });
    }

    markAsInteracted();
  }, [referencePointers, updateProjectImageSettings, markAsInteracted]);

  // ============================================================================
  // Handler: Upload New Reference
  // ============================================================================

  const handleStyleReferenceUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // GUARD: Don't add references while settings are loading
    if (isLoadingProjectSettings) {
      console.warn('[useReferenceManagement] Cannot upload reference while settings are loading');
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
          handleError(thumbnailUploadError, { context: 'useReferenceManagement.thumbnailUpload', showToast: false });
          thumbnailUrl = originalUploadedUrl;
        } else {
          const { data: thumbnailUrlData } = supabase.storage
            .from(MEDIA_BUCKET)
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbnailUrlData.publicUrl;
        }
      } catch (thumbnailError) {
        handleError(thumbnailError, { context: 'useReferenceManagement.thumbnailGeneration', showToast: false });
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

      console.log('[useReferenceManagement] Creating new reference resource:', metadata.name);

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
      } catch (e) {
        console.warn('[useReferenceManagement] Failed to set optimistic cache data', e);
      }

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

      console.log('[useReferenceManagement] Style reference upload completed successfully!');
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleStyleReferenceUpload', toastTitle: 'Failed to upload reference image' });
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
  // Handler: Select Existing Resource
  // ============================================================================

  const handleResourceSelect = useCallback(async (resource: Resource) => {
    if (isLoadingProjectSettings) {
      console.warn('[useReferenceManagement] Cannot add reference while settings are loading');
      toast.error('Please wait for settings to load');
      return;
    }

    try {
      // Check if we already have this resource linked
      const existingPointer = referencePointers.find(ptr => ptr.resourceId === resource.id);

      if (existingPointer) {
        console.log('[useReferenceManagement] Resource already linked, switching to existing reference:', existingPointer.id);

        const optimisticUpdate = {
          ...selectedReferenceIdByShot,
          [effectiveShotId]: existingPointer.id
        };

        try {
          queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
            updateSettingsCache<ProjectImageSettings>(prev, { selectedReferenceIdByShot: optimisticUpdate })
          );
        } catch (e) {
          console.warn('[useReferenceManagement] Failed to set optimistic cache data', e);
        }

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

      console.log('[useReferenceManagement] Linking existing resource:', {
        resourceId: resource.id,
        pointerId: newPointer.id,
      });

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
        handleError(e, { context: 'useReferenceManagement.handleResourceSelect.optimisticUpdate', showToast: false });
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
      handleError(error, { context: 'useReferenceManagement.handleResourceSelect', toastTitle: 'Failed to add reference' });
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

  // ============================================================================
  // Handler: Select Reference for Current Shot
  // ============================================================================

  const handleSelectReference = useCallback(async (referenceId: string) => {
    console.log('[useReferenceManagement] Selecting reference for shot', effectiveShotId, ':', referenceId);

    // Also update shot-level settings for inheritance
    if (associatedShotId && shotPromptSettings) {
      shotPromptSettings.updateField('selectedReferenceId', referenceId);
    }

    // Optimistic UI update for project-level per-shot mapping
    const optimisticUpdate = {
      ...selectedReferenceIdByShot,
      [effectiveShotId]: referenceId
    };

    try {
      queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
        updateSettingsCache<ProjectImageSettings>(prev, { selectedReferenceIdByShot: optimisticUpdate })
      );
    } catch (e) {
      console.warn('[useReferenceManagement] Failed to set optimistic cache data', e);
    }

    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate
    });
    markAsInteracted();
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId, associatedShotId, shotPromptSettings]);

  // ============================================================================
  // Handler: Delete Reference
  // ============================================================================

  const handleDeleteReference = useCallback(async (referenceId: string) => {
    console.log('[useReferenceManagement] Deleting reference:', referenceId);

    const hydratedRef = hydratedReferences.find(r => r.id === referenceId);
    if (!hydratedRef) {
      console.error('[useReferenceManagement] Could not find reference:', referenceId);
      return;
    }

    // Delete the resource from resources table
    try {
      await deleteStyleReference.mutateAsync({
        id: hydratedRef.resourceId,
        type: 'style-reference',
      });
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleDeleteReference', toastTitle: 'Failed to delete reference' });
      return;
    }

    // Remove pointer from settings
    const filteredPointers = referencePointers.filter(ref => ref.id !== referenceId);

    // Update all shot selections that had this reference selected
    const updatedSelections = { ...selectedReferenceIdByShot };
    Object.keys(updatedSelections).forEach(shotId => {
      if (updatedSelections[shotId] === referenceId) {
        updatedSelections[shotId] = filteredPointers[0]?.id ?? null;
      }
    });

    // Optimistic UI update
    try {
      queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
        updateSettingsCache<ProjectImageSettings>(prev, {
          references: filteredPointers,
          selectedReferenceIdByShot: updatedSelections
        })
      );
    } catch (e) {
      console.warn('[useReferenceManagement] Failed to set optimistic cache data', e);
    }

    await updateProjectImageSettings('project', {
      references: filteredPointers,
      selectedReferenceIdByShot: updatedSelections
    });

    markAsInteracted();
  }, [hydratedReferences, referencePointers, selectedReferenceIdByShot, deleteStyleReference, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId]);

  // ============================================================================
  // Handler: Update Reference Name
  // ============================================================================

  const handleUpdateReferenceName = useCallback(async (referenceId: string, name: string) => {
    console.log('[useReferenceManagement] Updating reference name:', referenceId, name);

    // Find the hydrated reference to get the resourceId
    const hydratedRef = hydratedReferences.find(r => r.id === referenceId);
    if (!hydratedRef) {
      console.error('[useReferenceManagement] Could not find reference:', referenceId);
      return;
    }

    // Name is stored on the Resource, not the pointer - update via updateStyleReference
    try {
      const updatedMetadata: StyleReferenceMetadata = {
        name,
        styleReferenceImage: hydratedRef.styleReferenceImage,
        styleReferenceImageOriginal: hydratedRef.styleReferenceImageOriginal,
        thumbnailUrl: hydratedRef.thumbnailUrl,
        styleReferenceStrength: hydratedRef.styleReferenceStrength,
        subjectStrength: hydratedRef.subjectStrength,
        subjectDescription: hydratedRef.subjectDescription,
        inThisScene: hydratedRef.inThisScene,
        inThisSceneStrength: hydratedRef.inThisSceneStrength,
        referenceMode: hydratedRef.referenceMode,
        styleBoostTerms: hydratedRef.styleBoostTerms,
        created_by: { is_you: true },
        is_public: hydratedRef.isPublic,
        createdAt: hydratedRef.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await updateStyleReference.mutateAsync({
        id: hydratedRef.resourceId,
        type: 'style-reference',
        metadata: updatedMetadata,
      });

      console.log('[useReferenceManagement] Name updated successfully');
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleUpdateReferenceName', toastTitle: 'Failed to update name' });
    }
  }, [hydratedReferences, updateStyleReference]);

  // ============================================================================
  // Handler: Toggle Visibility
  // ============================================================================

  const handleToggleVisibility = useCallback(async (resourceId: string, currentIsPublic: boolean) => {
    console.log('[useReferenceManagement] Toggling visibility:', { resourceId, currentIsPublic, newValue: !currentIsPublic });

    const hydratedRef = hydratedReferences.find(r => r.resourceId === resourceId);
    if (!hydratedRef) {
      console.error('[useReferenceManagement] Could not find reference with resourceId:', resourceId);
      return;
    }

    try {
      const updatedMetadata: StyleReferenceMetadata = {
        name: hydratedRef.name,
        styleReferenceImage: hydratedRef.styleReferenceImage,
        styleReferenceImageOriginal: hydratedRef.styleReferenceImageOriginal,
        thumbnailUrl: hydratedRef.thumbnailUrl,
        styleReferenceStrength: hydratedRef.styleReferenceStrength,
        subjectStrength: hydratedRef.subjectStrength,
        subjectDescription: hydratedRef.subjectDescription,
        inThisScene: hydratedRef.inThisScene,
        inThisSceneStrength: hydratedRef.inThisSceneStrength,
        referenceMode: hydratedRef.referenceMode,
        styleBoostTerms: hydratedRef.styleBoostTerms,
        created_by: { is_you: true },
        is_public: !currentIsPublic,
        createdAt: hydratedRef.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await updateStyleReference.mutateAsync({
        id: resourceId,
        type: 'style-reference',
        metadata: updatedMetadata,
      });

      console.log('[useReferenceManagement] Visibility toggled successfully');
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleToggleVisibility', toastTitle: 'Failed to update visibility' });
    }
  }, [hydratedReferences, updateStyleReference]);

  // ============================================================================
  // Handler: Remove Style Reference (legacy)
  // ============================================================================

  const handleRemoveStyleReference = useCallback(async () => {
    if (!selectedReferenceId) return;
    await handleDeleteReference(selectedReferenceId);
  }, [selectedReferenceId, handleDeleteReference]);

  // ============================================================================
  // Strength and Settings Handlers
  // ============================================================================

  const handleStyleStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) return;
    setStyleReferenceStrength(value);
    await handleUpdateReference(selectedReferenceId, { styleReferenceStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleSubjectStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) return;
    setSubjectStrength(value);
    await handleUpdateReference(selectedReferenceId, { subjectStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleSubjectDescriptionChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) return;
    setSubjectDescription(value);
    await handleUpdateReference(selectedReferenceId, { subjectDescription: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleSubjectDescriptionFocus = useCallback(() => {
    setIsEditingSubjectDescription(true);
  }, []);

  const handleSubjectDescriptionBlur = useCallback(() => {
    setIsEditingSubjectDescription(false);
  }, []);

  const handleInThisSceneChange = useCallback(async (value: boolean) => {
    if (!selectedReferenceId) return;
    setInThisScene(value);
    await handleUpdateReference(selectedReferenceId, { inThisScene: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleInThisSceneStrengthChange = useCallback(async (value: number) => {
    if (!selectedReferenceId) return;
    setInThisSceneStrength(value);
    await handleUpdateReference(selectedReferenceId, { inThisSceneStrength: value });
  }, [selectedReferenceId, handleUpdateReference]);

  const handleStyleBoostTermsChange = useCallback(async (value: string) => {
    if (!selectedReferenceId) return;
    setStyleBoostTerms(value);
    await handleUpdateReference(selectedReferenceId, { styleBoostTerms: value });
  }, [selectedReferenceId, handleUpdateReference]);

  // ============================================================================
  // Handler: Reference Mode Change
  // ============================================================================

  const handleReferenceModeChange = useCallback(async (mode: ReferenceMode) => {
    if (!selectedReferenceId) return;
    console.log('[useReferenceManagement] User changed mode to:', mode);

    // Get defaults for this mode and generation environment
    const defaults = getReferenceModeDefaults(mode, isLocalGenerationEnabled);

    // Build update object with mode AND auto-set strength values
    const updates: Partial<ReferenceImage> = {
      referenceMode: mode,
      ...defaults,
    };

    // For custom mode, only apply defaults if current strengths are too low
    if (mode === 'custom') {
      const currentTotal = styleReferenceStrength + subjectStrength;
      if (currentTotal >= 0.5) {
        delete updates.styleReferenceStrength;
        delete updates.subjectStrength;
        delete updates.inThisScene;
        delete updates.inThisSceneStrength;
      }
    }

    // Optimistic local updates
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

    // Set denoise to 0.5 for Subject and Scene modes
    if ((mode === 'subject' || mode === 'scene') && setHiresFixConfig) {
      setHiresFixConfig((prev) => ({ ...prev, hires_denoise: 0.5 }));
    }

    await handleUpdateReference(selectedReferenceId, updates);
  }, [selectedReferenceId, handleUpdateReference, styleReferenceStrength, subjectStrength, isLocalGenerationEnabled, setHiresFixConfig]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Local UI state
    styleReferenceStrength,
    subjectStrength,
    subjectDescription,
    isEditingSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    styleBoostTerms,
    isUploadingStyleReference,
    styleReferenceOverride,

    // Display computed values
    styleReferenceImageDisplay,
    styleReferenceImageGeneration,

    // Handlers
    handleStyleReferenceUpload,
    handleResourceSelect,
    handleSelectReference,
    handleDeleteReference,
    handleUpdateReference,
    handleUpdateReferenceName,
    handleToggleVisibility,
    handleRemoveStyleReference,
    handleStyleStrengthChange,
    handleSubjectStrengthChange,
    handleSubjectDescriptionChange,
    handleSubjectDescriptionFocus,
    handleSubjectDescriptionBlur,
    handleInThisSceneChange,
    handleInThisSceneStrengthChange,
    handleStyleBoostTermsChange,
    handleReferenceModeChange,

    // State setters
    setStyleReferenceStrength,
    setSubjectStrength,
    setSubjectDescription,
    setInThisScene,
    setInThisSceneStrength,
    setReferenceMode,
    setStyleBoostTerms,
    setStyleReferenceOverride,
  };
}
