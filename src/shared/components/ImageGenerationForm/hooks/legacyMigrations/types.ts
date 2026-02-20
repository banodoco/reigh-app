import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
} from '../../types';

export interface LegacyMigrationsInput {
  selectedProjectId: string | null;
  effectiveShotId: string;

  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  hasLegacyReferences: boolean;
  rawStyleReferenceImage: string | null;
  isLoadingReferences: boolean;
  selectedReferenceIdByShot: Record<string, string | null>;

  projectImageSettings: ProjectImageSettings | null;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;

  privacyDefaults: { resourcesPublic: boolean };
}
