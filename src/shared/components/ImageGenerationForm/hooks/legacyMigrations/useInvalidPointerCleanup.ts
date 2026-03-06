import { useEffect, useRef } from 'react';
import type { LegacyMigrationsInput } from './types';

type InvalidPointerCleanupInput = Pick<
  LegacyMigrationsInput,
  | 'selectedProjectId'
  | 'isLoadingReferences'
  | 'projectImageSettings'
  | 'referencePointers'
  | 'hydratedReferences'
  | 'selectedReferenceIdByShot'
  | 'updateProjectImageSettings'
>;

// SUNSET: 2026-09-01 — remove after reference pointer integrity is guaranteed at write-time.
export function useInvalidPointerCleanup(input: InvalidPointerCleanupInput): void {
  const {
    selectedProjectId,
    isLoadingReferences,
    projectImageSettings,
    referencePointers,
    hydratedReferences,
    selectedReferenceIdByShot,
    updateProjectImageSettings,
  } = input;

  const hasCleanedInvalidPointersRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedProjectId) return;
    if (hasCleanedInvalidPointersRef.current[selectedProjectId]) return;
    if (isLoadingReferences) return;
    if (!projectImageSettings) return;
    if (!referencePointers || referencePointers.length === 0) return;

    const nonLegacyPointers = referencePointers.filter((pointer) => {
      const isLegacy = !pointer.resourceId && 'styleReferenceImage' in pointer;
      return !isLegacy && !!pointer.resourceId;
    });

    if (hydratedReferences.length < nonLegacyPointers.length) {
      return;
    }

    const hydratedPointerIds = new Set(hydratedReferences.map((reference) => reference.id));
    const invalidPointers = referencePointers.filter((pointer) => {
      const isLegacy = !pointer.resourceId && 'styleReferenceImage' in pointer;
      if (isLegacy) return false;
      return !!pointer.resourceId && !hydratedPointerIds.has(pointer.id);
    });

    if (invalidPointers.length === 0) {
      hasCleanedInvalidPointersRef.current[selectedProjectId] = true;
      return;
    }

    const invalidIds = new Set(invalidPointers.map((pointer) => pointer.id));
    const cleanedReferences = referencePointers.filter((pointer) => !invalidIds.has(pointer.id));
    const fallbackId = hydratedReferences[0]?.id ?? null;

    const cleanedSelections: Record<string, string | null> = {
      ...(selectedReferenceIdByShot || {}),
    };

    for (const shotKey of Object.keys(cleanedSelections)) {
      const selectedId = cleanedSelections[shotKey];
      if (selectedId && invalidIds.has(selectedId)) {
        cleanedSelections[shotKey] = fallbackId;
      }
    }

    hasCleanedInvalidPointersRef.current[selectedProjectId] = true;

    void updateProjectImageSettings('project', {
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
