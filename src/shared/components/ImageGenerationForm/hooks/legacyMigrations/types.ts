import type {
  HydratedReferenceImage,
  ReferenceImage,
} from '../../types';
import type { ProjectImageSettingsInput } from './legacyProjectImageSettings';

export interface LegacyMigrationsInput {
  selectedProjectId: string | null;
  effectiveShotId: string;

  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  hasLegacyReferences: boolean;
  rawStyleReferenceImage: string | null;
  isLoadingReferences: boolean;
  selectedReferenceIdByShot: Record<string, string | null>;

  projectImageSettings: ProjectImageSettingsInput | null;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettingsInput>
  ) => Promise<void>;

  privacyDefaults: { resourcesPublic: boolean };
}
