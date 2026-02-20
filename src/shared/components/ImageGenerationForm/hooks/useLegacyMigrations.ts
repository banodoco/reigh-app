/**
 * useLegacyMigrations - Handles one-time data migrations for legacy formats
 */

import { useBase64Migration } from './legacyMigrations/useBase64Migration';
import { useInvalidPointerCleanup } from './legacyMigrations/useInvalidPointerCleanup';
import { useReferenceStructureMigration } from './legacyMigrations/useReferenceStructureMigration';
import { useResourceMigration } from './legacyMigrations/useResourceMigration';
import { useSceneModeMigration } from './legacyMigrations/useSceneModeMigration';
import type { LegacyMigrationsInput } from './legacyMigrations/types';

export function useLegacyMigrations(input: LegacyMigrationsInput): void {
  const {
    selectedProjectId,
    effectiveShotId,
    referencePointers,
    hydratedReferences,
    hasLegacyReferences,
    rawStyleReferenceImage,
    isLoadingReferences,
    selectedReferenceIdByShot,
    projectImageSettings,
    updateProjectImageSettings,
    privacyDefaults,
  } = input;

  useBase64Migration({
    rawStyleReferenceImage,
    selectedProjectId,
    updateProjectImageSettings,
  });

  useReferenceStructureMigration({
    projectImageSettings,
    selectedProjectId,
    effectiveShotId,
    updateProjectImageSettings,
  });

  useSceneModeMigration({
    projectImageSettings,
    referencePointers,
    selectedProjectId,
    updateProjectImageSettings,
  });

  useResourceMigration({
    hasLegacyReferences,
    selectedProjectId,
    referencePointers,
    privacyDefaults,
    updateProjectImageSettings,
  });

  useInvalidPointerCleanup({
    selectedProjectId,
    isLoadingReferences,
    projectImageSettings,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  });
}
