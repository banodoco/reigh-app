/**
 * useReferenceSelection - Computes displayed reference with fallback caching
 *
 * Handles:
 * - Computing which reference ID to display (persisted or fallback)
 * - Caching fallback selection to prevent flicker during hydration
 * - Deriving full reference object with refetch stability
 * - Computing loading states for skeleton display
 */

import { useMemo, useRef } from 'react';
import { HydratedReferenceImage } from '../types';

// ============================================================================
// Types
// ============================================================================

interface UseReferenceSelectionProps {
  effectiveShotId: string;
  referenceCount: number;
  selectedReferenceId: string | null;
  hydratedReferences: HydratedReferenceImage[];
  isLoadingProjectSettings: boolean;
  isLoadingReferences: boolean;
}

interface UseReferenceSelectionReturn {
  /** The reference ID to display (persisted selection or computed fallback) */
  displayedReferenceId: string | null;
  /** The full reference object (with refetch stability - keeps last valid) */
  selectedReference: HydratedReferenceImage | null;
  /** The current reference object (null if not found) */
  currentSelectedReference: HydratedReferenceImage | null;
  /** Whether to show loading skeletons for references */
  isReferenceDataLoading: boolean;
  /** Whether we have enough references hydrated (90%+) */
  hasEnoughReferences: boolean;
  /** Whether the persisted selection points to a missing reference */
  hasStaleSelection: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useReferenceSelection(props: UseReferenceSelectionProps): UseReferenceSelectionReturn {
  const {
    effectiveShotId,
    referenceCount,
    selectedReferenceId,
    hydratedReferences,
    isLoadingProjectSettings,
    isLoadingReferences,
  } = props;

  // ============================================================================
  // Fallback Cache
  // ============================================================================

  // Cache the first fallback per shot to prevent flickering as more refs hydrate
  const fallbackCache = useRef<{ shotId: string; referenceId: string } | null>(null);

  // ============================================================================
  // Displayed Reference ID
  // ============================================================================

  const displayedReferenceId = useMemo(() => {
    // If we have no hydrated references yet, nothing to display
    if (hydratedReferences.length === 0) return null;

    // If the persisted selection exists in hydrated refs, use it
    if (selectedReferenceId && hydratedReferences.some(r => r.id === selectedReferenceId)) {
      // Clear any cached fallback since we have a real selection
      if (fallbackCache.current?.shotId === effectiveShotId) {
        fallbackCache.current = null;
      }
      return selectedReferenceId;
    }

    // If we have a selection but it's not hydrated yet, DON'T show a fallback
    // Wait until either: the selected ref hydrates, or all refs are hydrated (meaning selection is truly invalid)
    if (selectedReferenceId && hydratedReferences.length < referenceCount) {
      // Selected ref might still be loading - don't show fallback yet
      return null;
    }

    // Need a fallback - check if we already cached one for this shot
    if (fallbackCache.current?.shotId === effectiveShotId) {
      // Verify the cached fallback still exists in hydrated refs
      const cachedRefId = fallbackCache.current.referenceId;
      if (hydratedReferences.some(r => r.id === cachedRefId)) {
        return cachedRefId;
      }
      // Cached ref no longer valid, clear it
      fallbackCache.current = null;
    }

    // Compute fallback: most recently created reference
    const sorted = [...hydratedReferences].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
    const fallbackId = sorted[0]?.id ?? null;

    // Cache this fallback so it doesn't change as more refs hydrate
    if (fallbackId) {
      fallbackCache.current = { shotId: effectiveShotId, referenceId: fallbackId };
    }

    return fallbackId;
  }, [hydratedReferences, selectedReferenceId, effectiveShotId, referenceCount]);

  // ============================================================================
  // Selected Reference Object
  // ============================================================================

  // Derive the full reference object
  const currentSelectedReference = hydratedReferences.find(ref => ref.id === displayedReferenceId) || null;

  // Keep last valid reference for refetch stability
  const lastValidSelectedReference = useRef<HydratedReferenceImage | null>(null);
  if (currentSelectedReference) {
    lastValidSelectedReference.current = currentSelectedReference;
  }
  const selectedReference = currentSelectedReference || lastValidSelectedReference.current;

  // ============================================================================
  // Loading States
  // ============================================================================

  // Show loading state only if we don't have enough references hydrated yet
  // This prevents flickering when background queries run but we already have data
  const hasEnoughReferences = referenceCount > 0 && hydratedReferences.length >= Math.floor(referenceCount * 0.9);

  // Check if selection points to a missing reference
  const hasStaleSelection = selectedReferenceId && !currentSelectedReference && hydratedReferences.length > 0;

  // Selection is pending validation if we have an ID but no refs loaded yet
  const selectionPendingValidation = selectedReferenceId && hydratedReferences.length === 0 && referenceCount > 0;

  // Only show reference skeletons when we truly have *no hydrated reference data to render yet*
  // If we already have hydratedReferences, render them even if queries are refetching in background
  const isReferenceDataLoading =
    hydratedReferences.length === 0 &&
    (
      ((isLoadingProjectSettings || isLoadingReferences) && !hasEnoughReferences) ||
      selectionPendingValidation
    );

  // ============================================================================
  // Return
  // ============================================================================

  return {
    displayedReferenceId,
    selectedReference,
    currentSelectedReference,
    isReferenceDataLoading,
    hasEnoughReferences,
    hasStaleSelection: !!hasStaleSelection,
  };
}
