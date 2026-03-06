import { useEffect, useRef } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useCreateResource, type StyleReferenceMetadata } from '@/shared/hooks/useResources';
import type { ReferenceImage } from '../../types';
import type { LegacyMigrationsInput } from './types';

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
          const metadata: StyleReferenceMetadata = {
            name: pointer.name || 'Reference',
            styleReferenceImage: pointer.styleReferenceImage,
            styleReferenceImageOriginal:
              pointer.styleReferenceImageOriginal || pointer.styleReferenceImage,
            thumbnailUrl: pointer.thumbnailUrl || null,
            styleReferenceStrength: pointer.styleReferenceStrength ?? 1.1,
            subjectStrength: pointer.subjectStrength ?? 0.0,
            subjectDescription: pointer.subjectDescription || '',
            inThisScene: pointer.inThisScene ?? false,
            inThisSceneStrength: pointer.inThisSceneStrength ?? 1.0,
            referenceMode: pointer.referenceMode || 'style',
            styleBoostTerms: pointer.styleBoostTerms || '',
            is_public: privacyDefaults.resourcesPublic,
            created_by: {
              is_you: true,
              username: user.email || 'user',
            },
            createdAt: pointer.createdAt || now,
            updatedAt: pointer.updatedAt || now,
          };

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
