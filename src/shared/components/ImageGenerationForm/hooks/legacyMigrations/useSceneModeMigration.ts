import { useEffect, useRef } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ReferenceImage } from '../../types';
import type { LegacyMigrationsInput } from './types';

type SceneModeMigrationInput = Pick<
  LegacyMigrationsInput,
  'projectImageSettings' | 'referencePointers' | 'selectedProjectId' | 'updateProjectImageSettings'
>;

function needsSceneMigration(reference: ReferenceImage): boolean {
  return (
    reference.inThisSceneStrength === undefined ||
    (reference.referenceMode as string) === 'scene-imprecise' ||
    (reference.referenceMode as string) === 'scene-precise'
  );
}

function migrateSceneReference(reference: ReferenceImage): ReferenceImage {
  const updates: Partial<ReferenceImage> = { ...reference };

  if (
    (reference.referenceMode as string) === 'scene-imprecise' ||
    (reference.referenceMode as string) === 'scene-precise'
  ) {
    updates.referenceMode = 'scene';
    updates.inThisSceneStrength = reference.inThisSceneStrength ?? 1.0;
  } else if (reference.inThisSceneStrength === undefined) {
    updates.inThisSceneStrength = reference.inThisScene ? 1.0 : 0;
  }

  return updates as ReferenceImage;
}

export function useSceneModeMigration(input: SceneModeMigrationInput): void {
  const {
    projectImageSettings,
    referencePointers,
    selectedProjectId,
    updateProjectImageSettings,
  } = input;

  const sceneMigrationStateRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const runSceneMigration = async () => {
      if (!projectImageSettings || !referencePointers.length || !selectedProjectId) {
        return;
      }

      if (sceneMigrationStateRef.current[selectedProjectId]) {
        return;
      }

      const hasPendingMigration = referencePointers.some(needsSceneMigration);
      if (!hasPendingMigration) {
        sceneMigrationStateRef.current[selectedProjectId] = true;
        return;
      }

      sceneMigrationStateRef.current[selectedProjectId] = true;

      try {
        await updateProjectImageSettings('project', {
          references: referencePointers.map(migrateSceneReference),
        });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ImageGenerationForm.runSceneMigration',
          showToast: false,
        });
        sceneMigrationStateRef.current[selectedProjectId] = false;
      }
    };

    void runSceneMigration();
  }, [
    projectImageSettings,
    referencePointers,
    selectedProjectId,
    updateProjectImageSettings,
  ]);
}
