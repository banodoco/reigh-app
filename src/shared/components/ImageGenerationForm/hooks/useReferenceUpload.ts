/**
 * useReferenceUpload - Handles uploading and selecting reference images
 *
 * Orchestrator hook that composes:
 * - Upload flow (new file -> thumbnail, processing, storage, resource creation)
 * - Select flow (existing resource -> pointer creation or selection switch)
 * - Resource mutations (delete, update name, toggle visibility) via useReferenceResourceMutations
 */

import { useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import type { Resource } from '@/shared/hooks/useResources';
import {
  useCreateResource,
  type StyleReferenceMetadata,
} from '@/shared/hooks/useResources';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
  ReferenceMode,
} from '../types';
import { useReferenceResourceMutations } from './useReferenceResourceMutations';
import { useResourceSelectHandler } from './referenceUpload/useResourceSelectHandler';
import { useStyleReferenceUploadHandler } from './referenceUpload/useStyleReferenceUploadHandler';

interface UseReferenceUploadProps {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  selectedReferenceIdByShot: Record<string, string | null>;
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  isLoadingProjectSettings: boolean;
  isLocalGenerationEnabled: boolean;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  privacyDefaults: { resourcesPublic: boolean };
  referenceMode: ReferenceMode;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisScene: boolean;
  inThisSceneStrength: number;
}

interface UseReferenceUploadReturn {
  isUploadingStyleReference: boolean;
  styleReferenceOverride: string | null | undefined;
  setStyleReferenceOverride: Dispatch<SetStateAction<string | null | undefined>>;
  handleStyleReferenceUpload: (files: File[]) => Promise<void>;
  handleResourceSelect: (resource: Resource) => Promise<void>;
  handleDeleteReference: (referenceId: string) => Promise<void>;
  handleUpdateReferenceName: (referenceId: string, name: string) => Promise<void>;
  handleToggleVisibility: (resourceId: string, currentIsPublic: boolean) => Promise<void>;
}

interface CreateStyleReferenceMutation {
  mutateAsync: (input: {
    type: 'style-reference';
    metadata: StyleReferenceMetadata;
  }) => Promise<Resource>;
}

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
  const createStyleReference = useCreateResource() as CreateStyleReferenceMutation;

  const {
    isUploadingStyleReference,
    styleReferenceOverride,
    setStyleReferenceOverride,
    handleStyleReferenceUpload,
  } = useStyleReferenceUploadHandler({
    selectedProjectId,
    effectiveShotId,
    hydratedReferences,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    privacyDefaults,
    queryClient,
    createStyleReference,
  });

  const handleResourceSelect = useResourceSelectHandler({
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
  });

  const {
    handleDeleteReference,
    handleUpdateReferenceName,
    handleToggleVisibility,
  } = useReferenceResourceMutations({
    selectedProjectId,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
    markAsInteracted,
  });

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
