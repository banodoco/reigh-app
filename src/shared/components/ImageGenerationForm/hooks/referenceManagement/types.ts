import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Resource } from '@/shared/hooks/useResources';
import type {
  HydratedReferenceImage,
  HiresFixConfig,
  ProjectImageSettings,
  ReferenceImage,
  ReferenceMode,
} from '../../types';

export interface ReferenceManagementInput {
  selectedProjectId: string | undefined;
  effectiveShotId: string;
  selectedReferenceId: string | null;
  selectedReferenceIdByShot: Record<string, string | null>;
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  selectedReference: HydratedReferenceImage | null;
  isLoadingProjectSettings: boolean;
  isLocalGenerationEnabled: boolean;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  privacyDefaults: { resourcesPublic: boolean };
  associatedShotId: string | null;
  shotPromptSettings?: {
    updateField: <T>(field: string, value: T) => void;
  };
  setHiresFixConfig?: Dispatch<SetStateAction<Partial<HiresFixConfig>>>;
}

export interface ReferenceManagementState {
  styleReferenceStrength: number;
  subjectStrength: number;
  subjectDescription: string;
  isEditingSubjectDescription: boolean;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
  styleBoostTerms: string;

  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setSubjectDescription: Dispatch<SetStateAction<string>>;
  setIsEditingSubjectDescription: Dispatch<SetStateAction<boolean>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setReferenceMode: Dispatch<SetStateAction<ReferenceMode>>;
  setStyleBoostTerms: Dispatch<SetStateAction<string>>;
}

export interface ReferenceManagementOutput {
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

  styleReferenceImageDisplay: string | null;
  styleReferenceImageGeneration: string | null;

  handleStyleReferenceUpload: (files: File[]) => Promise<void>;
  handleResourceSelect: (resource: Resource) => Promise<void>;
  handleSelectReference: (referenceId: string) => Promise<void>;
  handleDeleteReference: (referenceId: string) => Promise<void>;
  handleUpdateReference: (
    referenceId: string,
    updates: Partial<HydratedReferenceImage>
  ) => Promise<void>;
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

  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setSubjectDescription: Dispatch<SetStateAction<string>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setReferenceMode: Dispatch<SetStateAction<ReferenceMode>>;
  setStyleBoostTerms: Dispatch<SetStateAction<string>>;
  setStyleReferenceOverride: Dispatch<SetStateAction<string | null | undefined>>;
}

export interface ReferenceActionHandlersInput {
  selectedReferenceId: string | null;
  selectedReferenceIdByShot: Record<string, string | null>;
  effectiveShotId: string;
  referencePointers: ReferenceImage[];
  selectedProjectId: string | undefined;
  associatedShotId: string | null;
  shotPromptSettings?: { updateField: <T>(field: string, value: T) => void };
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  isLocalGenerationEnabled: boolean;
  styleReferenceStrength: number;
  subjectStrength: number;
  setStyleReferenceStrength: Dispatch<SetStateAction<number>>;
  setSubjectStrength: Dispatch<SetStateAction<number>>;
  setSubjectDescription: Dispatch<SetStateAction<string>>;
  setInThisScene: Dispatch<SetStateAction<boolean>>;
  setInThisSceneStrength: Dispatch<SetStateAction<number>>;
  setStyleBoostTerms: Dispatch<SetStateAction<string>>;
  setReferenceMode: Dispatch<SetStateAction<ReferenceMode>>;
  setIsEditingSubjectDescription: Dispatch<SetStateAction<boolean>>;
  setHiresFixConfig?: Dispatch<SetStateAction<Partial<HiresFixConfig>>>;
  pendingReferenceModeUpdate: MutableRefObject<ReferenceMode | null>;
  queryClient: QueryClient;
  handleDeleteReference: (referenceId: string) => Promise<void>;
}

export interface ReferenceActionHandlersOutput {
  handleSelectReference: (referenceId: string) => Promise<void>;
  handleUpdateReference: (
    referenceId: string,
    updates: Partial<HydratedReferenceImage>
  ) => Promise<void>;
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
}
