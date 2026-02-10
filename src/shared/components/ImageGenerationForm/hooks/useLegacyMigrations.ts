/**
 * useLegacyMigrations - Handles one-time data migrations for legacy formats
 *
 * Manages migrations for:
 * - Base64 style references → URL storage
 * - Flat reference properties → references array format
 * - Project-wide selection → shot-specific selection
 * - Old scene modes → unified 'scene' mode with inThisSceneStrength
 * - Inline reference data → resources table
 */

import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { supabase } from "@/integrations/supabase/client";
import { dataURLtoFile } from "@/shared/lib/utils";
import { uploadImageToStorage } from "@/shared/lib/imageUploader";
import { handleError } from '@/shared/lib/errorHandler';
import { useCreateResource, StyleReferenceMetadata } from '@/shared/hooks/useResources';
import {
  ReferenceImage,
  HydratedReferenceImage,
  ProjectImageSettings,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseLegacyMigrationsProps {
  selectedProjectId: string | null;
  effectiveShotId: string;

  // Reference data
  referencePointers: ReferenceImage[];
  hydratedReferences: HydratedReferenceImage[];
  hasLegacyReferences: boolean;
  rawStyleReferenceImage: string | null;
  isLoadingReferences: boolean;
  selectedReferenceIdByShot: Record<string, string | null>;

  // Project settings
  projectImageSettings: ProjectImageSettings | null;
  updateProjectImageSettings: (scope: string, updates: Partial<ProjectImageSettings>) => Promise<void>;

  // Privacy defaults
  privacyDefaults: { resourcesPublic: boolean };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useLegacyMigrations(props: UseLegacyMigrationsProps): void {
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
  } = props;

  // Resource creation mutation
  const createStyleReference = useCreateResource();

  // ============================================================================
  // Migration 1: Base64 to URL
  // ============================================================================

  useEffect(() => {
    const migrateBase64ToUrl = async () => {
      if (rawStyleReferenceImage &&
          rawStyleReferenceImage.startsWith('data:image/') &&
          selectedProjectId) {

        try {
          // Convert base64 to file
          const file = dataURLtoFile(rawStyleReferenceImage, `migrated-style-reference-${Date.now()}.png`);
          if (!file) {
            console.error('[ImageGenerationForm] Failed to convert base64 to file for migration');
            return;
          }

          // Upload to storage (use same image for both display and generation for legacy data)
          const uploadedUrl = await uploadImageToStorage(file);

          // Update project settings with URL for both display and generation
          await updateProjectImageSettings('project', {
            styleReferenceImage: uploadedUrl,
            styleReferenceImageOriginal: uploadedUrl
          });

        } catch (error) {
          handleError(error, { context: 'ImageGenerationForm.migrateBase64ToUrl', toastTitle: 'Failed to migrate style reference image' });
        }
      }
    };

    migrateBase64ToUrl();
  }, [rawStyleReferenceImage, selectedProjectId, updateProjectImageSettings]);

  // ============================================================================
  // Migration 2: Flat reference → Array format AND project-wide → shot-specific
  // ============================================================================

  useEffect(() => {
    const migrateLegacyReference = async () => {
      if (!projectImageSettings || !selectedProjectId) return;

      let needsMigration = false;
      const updates: Partial<ProjectImageSettings> = {};

      // Migration 1: Flat reference properties -> references array
      const hasLegacyFlatFormat = projectImageSettings.styleReferenceImage &&
                                  !projectImageSettings.references;

      if (hasLegacyFlatFormat) {
        needsMigration = true;

        const legacyReference: ReferenceImage = {
          id: nanoid(),
          resourceId: '', // Will be set by bulk migration
          name: "Reference 1",
          styleReferenceImage: projectImageSettings.styleReferenceImage || null,
          styleReferenceImageOriginal: projectImageSettings.styleReferenceImageOriginal || null,
          styleReferenceStrength: projectImageSettings.styleReferenceStrength ?? 1.1,
          subjectStrength: projectImageSettings.subjectStrength ?? 0.0,
          subjectDescription: projectImageSettings.subjectDescription ?? "",
          inThisScene: projectImageSettings.inThisScene ?? false,
          inThisSceneStrength: 1.0,
          referenceMode: 'style',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        updates.references = [legacyReference];
        updates.selectedReferenceIdByShot = { [effectiveShotId]: legacyReference.id };

        // Clear old flat properties
        updates.styleReferenceImage = undefined;
        updates.styleReferenceImageOriginal = undefined;
        updates.styleReferenceStrength = undefined;
        updates.subjectStrength = undefined;
        updates.subjectDescription = undefined;
        updates.inThisScene = undefined;
        updates.selectedReferenceId = undefined;
      }

      // Migration 2: Project-wide selectedReferenceId -> shot-specific selectedReferenceIdByShot
      const hasLegacyProjectWideSelection = projectImageSettings.selectedReferenceId &&
                                            !projectImageSettings.selectedReferenceIdByShot;

      if (hasLegacyProjectWideSelection && !hasLegacyFlatFormat) {
        needsMigration = true;

        // Apply the old project-wide selection to the current shot
        updates.selectedReferenceIdByShot = {
          [effectiveShotId]: projectImageSettings.selectedReferenceId
        };
        updates.selectedReferenceId = undefined;
      }

      if (needsMigration) {
        try {
          await updateProjectImageSettings('project', updates);
        } catch (error) {
          handleError(error, { context: 'ImageGenerationForm.migrateLegacyReference', showToast: false });
        }
      }
    };

    migrateLegacyReference();
  }, [effectiveShotId, projectImageSettings, selectedProjectId, updateProjectImageSettings]);

  // ============================================================================
  // Migration 3: Scene mode updates (old scene modes → unified 'scene')
  // ============================================================================

  const sceneMigrationStateRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const runSceneMigration = async () => {
      if (!projectImageSettings || !referencePointers.length || !selectedProjectId) return;
      if (sceneMigrationStateRef.current[selectedProjectId]) return;

      // Check if any references still need migration
      const needsMigration = referencePointers.some(ref =>
        ref.inThisSceneStrength === undefined ||
        (ref.referenceMode as string) === 'scene-imprecise' ||
        (ref.referenceMode as string) === 'scene-precise'
      );

      if (!needsMigration) {
        sceneMigrationStateRef.current[selectedProjectId] = true;
        return;
      }

      sceneMigrationStateRef.current[selectedProjectId] = true;

      const updatedReferences = referencePointers.map(ref => {
        const updates: Partial<ReferenceImage> = { ...ref };

        // Migrate old scene modes to new unified 'scene' mode
        if ((ref.referenceMode as string) === 'scene-imprecise' || (ref.referenceMode as string) === 'scene-precise') {
          updates.referenceMode = 'scene';
          updates.inThisSceneStrength = ref.inThisSceneStrength ?? 1.0;
        } else if (ref.inThisSceneStrength === undefined) {
          updates.inThisSceneStrength = ref.inThisScene ? 1.0 : 0;
        }

        return updates as ReferenceImage;
      });

      try {
        await updateProjectImageSettings('project', { references: updatedReferences });
      } catch (error) {
        handleError(error, { context: 'ImageGenerationForm.runSceneMigration', showToast: false });
        sceneMigrationStateRef.current[selectedProjectId] = false;
      }
    };

    runSceneMigration();
  }, [projectImageSettings, referencePointers, selectedProjectId, updateProjectImageSettings]);

  // ============================================================================
  // Migration 4: Bulk migration - inline references → resources table
  // ============================================================================

  const migrationCompleteRef = useRef(
    (() => {
      try {
        return typeof window !== 'undefined' && window.sessionStorage.getItem('referenceMigrationComplete') === 'true';
      } catch {
        return false;
      }
    })()
  );

  useEffect(() => {
    const migrateToResources = async () => {
      if (migrationCompleteRef.current || !hasLegacyReferences || !selectedProjectId) {
        return;
      }

      migrationCompleteRef.current = true;

      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('referenceMigrationComplete', 'true');
        }
      } catch { /* Ignore sessionStorage errors */ }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('[RefMigration] ❌ Not authenticated');
          return;
        }

        const migratedPointers: ReferenceImage[] = [];

        for (const pointer of referencePointers) {
          if (pointer.resourceId) {
            migratedPointers.push(pointer);
            continue;
          }

          if (!pointer.styleReferenceImage) {
            migratedPointers.push(pointer);
            continue;
          }

          const now = new Date().toISOString();
          const metadata: StyleReferenceMetadata = {
            name: pointer.name || 'Reference',
            styleReferenceImage: pointer.styleReferenceImage,
            styleReferenceImageOriginal: pointer.styleReferenceImageOriginal || pointer.styleReferenceImage,
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
          references: migratedPointers
        });

      } catch (error) {
        handleError(error, { context: 'ImageGenerationForm.migrateToResources', toastTitle: 'Failed to migrate references' });
        migrationCompleteRef.current = false;
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem('referenceMigrationComplete');
          }
        } catch { /* Ignore sessionStorage errors */ }
      }
    };

    if (!migrationCompleteRef.current && hasLegacyReferences) {
      migrateToResources();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Minimal deps: migration runs once per project, uses refs for other values
  }, [selectedProjectId]);

  // ============================================================================
  // Cleanup 5: Remove invalid reference pointers (runtime data integrity)
  // ============================================================================

  // If tool settings contain pointers to missing resources, hydration will drop them.
  // That mismatch causes skeleton count/layout shifts and selection weirdness.
  // Clean up invalid pointers once per project after hydration completes.
  const hasCleanedInvalidPointersRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedProjectId) return;
    if (hasCleanedInvalidPointersRef.current[selectedProjectId]) return;
    if (isLoadingReferences) return;
    if (!projectImageSettings) return;
    if (!referencePointers || referencePointers.length === 0) return;

    // Count how many non-legacy pointers we have
    // Legacy pointers have styleReferenceImage but no resourceId (pre-migration format)
    const nonLegacyPointers = referencePointers.filter(p => {
      const isLegacy = !p.resourceId && 'styleReferenceImage' in p;
      return !isLegacy && !!p.resourceId;
    });

    // CRITICAL: Don't run cleanup until ALL non-legacy pointers are hydrated
    // Otherwise we'd delete references that are still being fetched
    if (hydratedReferences.length < nonLegacyPointers.length) {
      return;
    }

    const hydratedPointerIds = new Set(hydratedReferences.map(r => r.id));
    const invalidPointers = referencePointers.filter(p => {
      const isLegacy = !p.resourceId && 'styleReferenceImage' in p;
      if (isLegacy) return false;
      return !!p.resourceId && !hydratedPointerIds.has(p.id);
    });

    if (invalidPointers.length === 0) {
      hasCleanedInvalidPointersRef.current[selectedProjectId] = true;
      return;
    }

    const invalidIds = new Set(invalidPointers.map(p => p.id));
    const cleanedReferences = referencePointers.filter(p => !invalidIds.has(p.id));

    // Prefer the first hydrated reference as a safe fallback
    const fallbackId = hydratedReferences[0]?.id ?? null;

    const currentSelections = selectedReferenceIdByShot || {};
    const cleanedSelections: Record<string, string | null> = { ...currentSelections };
    Object.keys(cleanedSelections).forEach(shotKey => {
      const selectedId = cleanedSelections[shotKey];
      if (selectedId && invalidIds.has(selectedId)) {
        cleanedSelections[shotKey] = fallbackId;
      }
    });

    hasCleanedInvalidPointersRef.current[selectedProjectId] = true;
    updateProjectImageSettings('project', {
      references: cleanedReferences,
      selectedReferenceIdByShot: cleanedSelections,
    });
  }, [
    selectedProjectId,
    isLoadingReferences,
    projectImageSettings,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  ]);
}
