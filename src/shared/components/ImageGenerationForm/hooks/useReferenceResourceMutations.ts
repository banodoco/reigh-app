/**
 * useReferenceResourceMutations - Handles resource-level mutations for references
 *
 * Extracted from useReferenceUpload to isolate the delete/update/visibility
 * operations from the heavier upload and select flows.
 *
 * Handles:
 * - Deleting a reference (resource + pointer cleanup)
 * - Updating reference name on the resource
 * - Toggling visibility (public/private) on the resource
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateResource, useDeleteResource, StyleReferenceMetadata } from '@/features/resources/hooks/useResources';
import { updateSettingsCache } from '@/shared/hooks/settings/useToolSettings';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import type { ReferenceImage, HydratedReferenceImage, ProjectImageSettings } from '../types';

// ============================================================================
// Helper
// ============================================================================

/**
 * Build full StyleReferenceMetadata from a HydratedReferenceImage.
 * Centralises the mapping so new metadata fields only need updating in one place.
 */
function buildResourceMetadata(
  ref: HydratedReferenceImage,
  overrides: Partial<StyleReferenceMetadata> = {},
): StyleReferenceMetadata {
  return {
    name: ref.name,
    styleReferenceImage: ref.styleReferenceImage,
    styleReferenceImageOriginal: ref.styleReferenceImageOriginal,
    thumbnailUrl: ref.thumbnailUrl,
    styleReferenceStrength: ref.styleReferenceStrength,
    subjectStrength: ref.subjectStrength,
    subjectDescription: ref.subjectDescription,
    inThisScene: ref.inThisScene,
    inThisSceneStrength: ref.inThisSceneStrength,
    referenceMode: ref.referenceMode,
    styleBoostTerms: ref.styleBoostTerms,
    created_by: { is_you: true },
    is_public: ref.isPublic,
    createdAt: ref.createdAt,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Types
// ============================================================================

interface UseReferenceResourceMutationsProps {
  selectedProjectId: string | undefined;
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  selectedReferenceIdByShot: Record<string, string | null>;
  updateProjectImageSettings: (scope: 'project' | 'shot', updates: Partial<ProjectImageSettings>) => Promise<void>;
  markAsInteracted: () => void;
}

interface UseReferenceResourceMutationsReturn {
  handleDeleteReference: (referenceId: string) => Promise<void>;
  handleUpdateReferenceName: (referenceId: string, name: string) => Promise<void>;
  handleToggleVisibility: (resourceId: string, currentIsPublic: boolean) => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useReferenceResourceMutations(
  props: UseReferenceResourceMutationsProps,
): UseReferenceResourceMutationsReturn {
  const {
    selectedProjectId,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
    markAsInteracted,
  } = props;

  const queryClient = useQueryClient();
  const updateStyleReference = useUpdateResource();
  const deleteStyleReference = useDeleteResource();

  // ============================================================================
  // Delete Reference
  // ============================================================================

  const handleDeleteReference = useCallback(async (referenceId: string) => {

    const hydratedRef = hydratedReferences.find(r => r.id === referenceId);
    if (!hydratedRef) {
      console.error('[useReferenceResourceMutations] Could not find reference:', referenceId);
      return;
    }

    // Delete the resource from resources table
    try {
      await deleteStyleReference.mutateAsync({
        id: hydratedRef.resourceId,
        type: 'style-reference',
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useReferenceResourceMutations.handleDeleteReference', toastTitle: 'Failed to delete reference' });
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
      queryClient.setQueryData(settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, selectedProjectId, undefined), (prev: unknown) =>
        updateSettingsCache<ProjectImageSettings>(prev, {
          references: filteredPointers,
          selectedReferenceIdByShot: updatedSelections
        })
      );
    } catch { /* intentionally ignored */ }

    await updateProjectImageSettings('project', {
      references: filteredPointers,
      selectedReferenceIdByShot: updatedSelections
    });

    markAsInteracted();
  }, [hydratedReferences, referencePointers, selectedReferenceIdByShot, deleteStyleReference, updateProjectImageSettings, markAsInteracted, queryClient, selectedProjectId]);

  // ============================================================================
  // Update Reference Name
  // ============================================================================

  const handleUpdateReferenceName = useCallback(async (referenceId: string, name: string) => {

    // Find the hydrated reference to get the resourceId
    const hydratedRef = hydratedReferences.find(r => r.id === referenceId);
    if (!hydratedRef) {
      console.error('[useReferenceResourceMutations] Could not find reference:', referenceId);
      return;
    }

    // Name is stored on the Resource, not the pointer - update via updateStyleReference
    try {
      const metadata = buildResourceMetadata(hydratedRef, { name });

      await updateStyleReference.mutateAsync({
        id: hydratedRef.resourceId,
        type: 'style-reference',
        metadata,
      });

    } catch (error) {
      normalizeAndPresentError(error, { context: 'useReferenceResourceMutations.handleUpdateReferenceName', toastTitle: 'Failed to update name' });
    }
  }, [hydratedReferences, updateStyleReference]);

  // ============================================================================
  // Toggle Visibility
  // ============================================================================

  const handleToggleVisibility = useCallback(async (resourceId: string, currentIsPublic: boolean) => {

    const hydratedRef = hydratedReferences.find(r => r.resourceId === resourceId);
    if (!hydratedRef) {
      console.error('[useReferenceResourceMutations] Could not find reference with resourceId:', resourceId);
      return;
    }

    try {
      const metadata = buildResourceMetadata(hydratedRef, { is_public: !currentIsPublic });

      await updateStyleReference.mutateAsync({
        id: resourceId,
        type: 'style-reference',
        metadata,
      });

    } catch (error) {
      normalizeAndPresentError(error, { context: 'useReferenceResourceMutations.handleToggleVisibility', toastTitle: 'Failed to update visibility' });
    }
  }, [hydratedReferences, updateStyleReference]);

  return {
    handleDeleteReference,
    handleUpdateReferenceName,
    handleToggleVisibility,
  };
}
