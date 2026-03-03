import { useEffect } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ProjectImageSettings, ReferenceImage } from '../../types';
import type { LegacyMigrationsInput } from './types';

type ReferenceStructureMigrationInput = Pick<
  LegacyMigrationsInput,
  'projectImageSettings' | 'selectedProjectId' | 'effectiveShotId' | 'updateProjectImageSettings'
>;

function buildLegacyReference(settings: ProjectImageSettings): ReferenceImage {
  return {
    id: crypto.randomUUID(),
    resourceId: '',
    name: 'Reference 1',
    styleReferenceImage: settings.styleReferenceImage || null,
    styleReferenceImageOriginal: settings.styleReferenceImageOriginal || null,
    styleReferenceStrength: settings.styleReferenceStrength ?? 1.1,
    subjectStrength: settings.subjectStrength ?? 0.0,
    subjectDescription: settings.subjectDescription ?? '',
    inThisScene: settings.inThisScene ?? false,
    inThisSceneStrength: 1.0,
    referenceMode: 'style',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function useReferenceStructureMigration(input: ReferenceStructureMigrationInput): void {
  const {
    projectImageSettings,
    selectedProjectId,
    effectiveShotId,
    updateProjectImageSettings,
  } = input;

  useEffect(() => {
    const migrateLegacyReference = async () => {
      if (!projectImageSettings || !selectedProjectId) {
        return;
      }

      let needsMigration = false;
      const updates: Partial<ProjectImageSettings> = {};

      const hasLegacyFlatFormat =
        projectImageSettings.styleReferenceImage && !projectImageSettings.references;

      if (hasLegacyFlatFormat) {
        needsMigration = true;
        const legacyReference = buildLegacyReference(projectImageSettings);

        updates.references = [legacyReference];
        updates.selectedReferenceIdByShot = { [effectiveShotId]: legacyReference.id };
        updates.styleReferenceImage = undefined;
        updates.styleReferenceImageOriginal = undefined;
        updates.styleReferenceStrength = undefined;
        updates.subjectStrength = undefined;
        updates.subjectDescription = undefined;
        updates.inThisScene = undefined;
        updates.selectedReferenceId = undefined;
      }

      const hasLegacyProjectWideSelection =
        projectImageSettings.selectedReferenceId &&
        !projectImageSettings.selectedReferenceIdByShot;

      if (hasLegacyProjectWideSelection && !hasLegacyFlatFormat) {
        needsMigration = true;
        updates.selectedReferenceIdByShot = {
          [effectiveShotId]: projectImageSettings.selectedReferenceId ?? null,
        };
        updates.selectedReferenceId = undefined;
      }

      if (!needsMigration) {
        return;
      }

      try {
        await updateProjectImageSettings('project', updates);
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ImageGenerationForm.migrateLegacyReference',
          showToast: false,
        });
      }
    };

    void migrateLegacyReference();
  }, [
    effectiveShotId,
    projectImageSettings,
    selectedProjectId,
    updateProjectImageSettings,
  ]);
}
