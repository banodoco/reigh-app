import { useEffect, useRef } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useCreateResource } from '@/features/resources/hooks/useResources';
import type { ReferenceImage } from '../../types';
import type { LegacyMigrationsInput } from './types';
import { buildLegacyReferenceMetadata } from '../referenceManagement/legacyReferenceMapping';

type ResourceMigrationInput = Pick<
  LegacyMigrationsInput,
  | 'hasLegacyReferences'
  | 'selectedProjectId'
  | 'referencePointers'
  | 'privacyDefaults'
  | 'updateProjectImageSettings'
>;

function getInitialMigrationState(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem('referenceMigrationComplete') === 'true'
    );
  } catch {
    return false;
  }
}

function markMigrationSessionComplete(value: boolean): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    if (value) {
      window.sessionStorage.setItem('referenceMigrationComplete', 'true');
      return;
    }

    window.sessionStorage.removeItem('referenceMigrationComplete');
  } catch {
    // Ignore sessionStorage errors.
  }
}

// SUNSET: 2026-09-01 — remove after legacy reference pointers have resourceId in all active projects.
export function useResourceMigration(input: ResourceMigrationInput): void {
  const {
    hasLegacyReferences,
    selectedProjectId,
    referencePointers,
    privacyDefaults,
    updateProjectImageSettings,
  } = input;

  const createStyleReference = useCreateResource();
  const migrationCompleteRef = useRef(getInitialMigrationState());

  useEffect(() => {
    const migrateToResources = async () => {
      if (migrationCompleteRef.current || !hasLegacyReferences || !selectedProjectId) {
        return;
      }

      migrationCompleteRef.current = true;
      markMigrationSessionComplete(true);

      try {
        const {
          data: { user },
        } = await supabase().auth.getUser();

        if (!user) {
          normalizeAndPresentError(new Error('Not authenticated during reference migration'), {
            context: 'useResourceMigration',
            showToast: false,
          });
          return;
        }

        const migratedPointers: ReferenceImage[] = [];

        for (const pointer of referencePointers) {
          if (pointer.resourceId || !pointer.styleReferenceImage) {
            migratedPointers.push(pointer);
            continue;
          }

          const now = new Date().toISOString();
          const metadata = buildLegacyReferenceMetadata({
            pointer,
            resourcesPublic: privacyDefaults.resourcesPublic,
            username: user.email || 'user',
            now,
          });

          const resource = await createStyleReference.mutateAsync({
            type: 'style-reference',
            metadata,
          });

          migratedPointers.push({
            id: pointer.id,
            resourceId: resource.id,
          });
        }

        await updateProjectImageSettings('project', {
          references: migratedPointers,
        });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ImageGenerationForm.migrateToResources',
          toastTitle: 'Failed to migrate references',
        });
        migrationCompleteRef.current = false;
        markMigrationSessionComplete(false);
      }
    };

    if (!migrationCompleteRef.current && hasLegacyReferences) {
      void migrateToResources();
    }
  }, [
    createStyleReference,
    hasLegacyReferences,
    privacyDefaults.resourcesPublic,
    referencePointers,
    selectedProjectId,
    updateProjectImageSettings,
  ]);
}
