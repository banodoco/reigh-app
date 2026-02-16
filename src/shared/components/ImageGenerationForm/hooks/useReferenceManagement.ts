/**
 * useReferenceManagement - Manages reference image state and operations
 *
 * Orchestrates two concerns:
 * 1. Local UI state for reference settings (strengths, mode, etc.) + sync from DB
 * 2. CRUD operations (delegated to useReferenceUpload)
 *
 * The heavy upload/resource operations live in useReferenceUpload.ts.
 * This hook manages the local state layer and settings change handlers.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandler';
import { updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { Resource } from '@/shared/hooks/useResources';
import {
  ReferenceImage,
  HydratedReferenceImage,
  ReferenceMode,
  ProjectImageSettings,
  getReferenceModeDefaults,
  HiresFixConfig,
} from '../types';
import { useReferenceUpload } from './useReferenceUpload';

// ============================================================================
// Types
// ============================================================================

interface UseReferenceManagementProps {
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

interface UseReferenceManagementReturn {
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

  // Pending mode update tracking
  const pendingReferenceModeUpdate = useRef<ReferenceMode | null>(null);

  // ============================================================================
  // Upload / Resource CRUD (delegated)
  // ============================================================================

  const upload = useReferenceUpload({
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
  });

  // ============================================================================
  // Derived Values from Selected Reference
  // ============================================================================

  // Get current values from the selected reference (for backward compatibility)
  const rawStyleReferenceImage = selectedReference?.styleReferenceImage || null;
  const rawStyleReferenceImageOriginal = selectedReference?.styleReferenceImageOriginal || null;

  // Display image (use original if available, fallback to processed)
  const styleReferenceImageDisplay = useMemo(() => {
    // If we have an explicit local override (including null), use it
    if (upload.styleReferenceOverride !== undefined) {
      return upload.styleReferenceOverride;
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
      return null;
    }

    return imageToDisplay;
  }, [upload.styleReferenceOverride, rawStyleReferenceImageOriginal, rawStyleReferenceImage]);

  // Generation image (always use processed version)
  const styleReferenceImageGeneration = useMemo(() => {
    if (!rawStyleReferenceImage) return null;

    // If it's already a URL, return as-is
    if (rawStyleReferenceImage.startsWith('http')) {
      return rawStyleReferenceImage;
    }

    // If it's base64 data, return null
    if (rawStyleReferenceImage.startsWith('data:image/')) {
      return null;
    }

    return rawStyleReferenceImage;
  }, [rawStyleReferenceImage]);

  // ============================================================================
  // Sync Effects
  // ============================================================================

  // When the backing setting updates, drop the local override
  useEffect(() => {
    upload.setStyleReferenceOverride(undefined);
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
      pendingReferenceModeUpdate.current = null;
    }
  }, [selectedReference?.referenceMode]);

  // Sync local state from selectedReference when reference changes
  const lastSyncedReferenceId = useRef<string | null>(null);
  useEffect(() => {
    // Only sync when reference ID actually changes (not on every re-render)
    if (selectedReference && selectedReference.id !== lastSyncedReferenceId.current) {
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
    } catch (error) {
      handleError(error, { context: 'useReferenceManagement.handleUpdateReference', toastTitle: 'Failed to update reference settings' });
    }

    markAsInteracted();
  }, [referencePointers, updateProjectImageSettings, markAsInteracted]);

  // ============================================================================
  // Handler: Select Reference for Current Shot
  // ============================================================================

  const handleSelectReference = useCallback(async (referenceId: string) => {

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
    } catch (e) { /* intentionally ignored */ }

    await updateProjectImageSettings('project', {
      selectedReferenceIdByShot: optimisticUpdate
    });
    markAsInteracted();
  }, [effectiveShotId, selectedReferenceIdByShot, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId, associatedShotId, shotPromptSettings]);

  // ============================================================================
  // Handler: Remove Style Reference (legacy)
  // ============================================================================

  const handleRemoveStyleReference = useCallback(async () => {
    if (!selectedReferenceId) return;
    await upload.handleDeleteReference(selectedReferenceId);
  }, [selectedReferenceId, upload.handleDeleteReference]);  

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
    isUploadingStyleReference: upload.isUploadingStyleReference,
    styleReferenceOverride: upload.styleReferenceOverride,

    // Display computed values
    styleReferenceImageDisplay,
    styleReferenceImageGeneration,

    // Handlers
    handleStyleReferenceUpload: upload.handleStyleReferenceUpload,
    handleResourceSelect: upload.handleResourceSelect,
    handleSelectReference,
    handleDeleteReference: upload.handleDeleteReference,
    handleUpdateReference,
    handleUpdateReferenceName: upload.handleUpdateReferenceName,
    handleToggleVisibility: upload.handleToggleVisibility,
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
    setStyleReferenceOverride: upload.setStyleReferenceOverride,
  };
}
