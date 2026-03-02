/**
 * useVariantSelection - Handles variant selection with mark-as-viewed behavior
 *
 * Wraps the raw setActiveVariantId to add logging and automatic mark-as-viewed,
 * handles initial variant setup from props, and tracks which variants have been
 * marked as viewed to avoid duplicate marks.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';

// Type for variant from useVariants hook
interface Variant {
  id: string;
  location?: string | null;
  thumbnail_url?: string | null;
  variant_type?: string | null;
  is_primary?: boolean | null;
  // ... other fields
}

interface UseVariantSelectionProps {
  /** Media being viewed (needed for generation_id) */
  media: GenerationRow;
  /** Generation ID associated with the current variant list (preferred for optimistic NEW-badge updates) */
  viewedGenerationId?: string | null;
  /** Raw setter from useVariants hook */
  rawSetActiveVariantId: (variantId: string) => void;
  /** Current active variant from useVariants hook */
  activeVariant: Variant | null | undefined;
  /** All variants from useVariants hook */
  variants: Variant[] | undefined;
  /** Initial variant ID to select (from prop) */
  initialVariantId?: string;
}

interface UseVariantSelectionReturn {
  /** Wrapped setter that logs and marks viewed */
  setActiveVariantId: (variantId: string) => void;
  /** Whether viewing a non-primary variant */
  isViewingNonPrimaryVariant: boolean;
}

export function useVariantSelection({
  media,
  viewedGenerationId,
  rawSetActiveVariantId,
  activeVariant,
  variants,
  initialVariantId,
}: UseVariantSelectionProps): UseVariantSelectionReturn {
  // Hook to mark variants as viewed (removes NEW badge)
  const { markViewed } = useMarkVariantViewed();

  // Track which initialVariantId we've already handled to avoid re-setting on every render
  const handledInitialVariantRef = useRef<string | null>(null);

  // Track which variant has been marked as viewed for this media to avoid duplicate marks
  const markedViewedVariantRef = useRef<string | null>(null);

  // Stable generation ID for mark-as-viewed (avoids re-creating callback on unrelated media field changes)
  const mediaGenerationId = getGenerationId(media);

  // Wrap setActiveVariantId with logging and mark-as-viewed
  const setActiveVariantId = useCallback((variantId: string) => {
    // Mark variant as viewed when selected (fire-and-forget)
    // Pass generationId for optimistic badge update
    if (variantId) {
      const generationId = viewedGenerationId ?? mediaGenerationId;
      markViewed({ variantId, generationId: generationId ?? undefined });
    }
    rawSetActiveVariantId(variantId);
  }, [rawSetActiveVariantId, markViewed, mediaGenerationId, viewedGenerationId]);

  // Set initial variant when variants load and initialVariantId is provided
  useEffect(() => {
    // Only process if we have a new initialVariantId different from what we've handled
    if (initialVariantId && variants && variants.length > 0) {
      if (handledInitialVariantRef.current !== initialVariantId) {
        const targetVariant = variants.find(v => v.id === initialVariantId);
        if (targetVariant) {
          setActiveVariantId(initialVariantId);
          handledInitialVariantRef.current = initialVariantId;
        }
      }
    }
  }, [initialVariantId, variants, setActiveVariantId]);

  // Reset handled ref when media changes (new item opened)
  useEffect(() => {
    handledInitialVariantRef.current = null;
  }, [media?.id]);

  // Mark the initial/active variant as viewed when the lightbox opens
  // This handles the case where the primary variant is auto-selected without explicit setActiveVariantId call
  useEffect(() => {
    if (!activeVariant?.id || markedViewedVariantRef.current === activeVariant.id) return;
    const generationId = viewedGenerationId ?? mediaGenerationId;
    markViewed({ variantId: activeVariant.id, generationId: generationId ?? undefined });
    markedViewedVariantRef.current = activeVariant.id;
  }, [activeVariant, mediaGenerationId, markViewed, viewedGenerationId]);

  // Reset marked-viewed ref when media changes (new item opened)
  useEffect(() => {
    markedViewedVariantRef.current = null;
  }, [media?.id]);

  // Compute isViewingNonPrimaryVariant early for edit hooks
  const isViewingNonPrimaryVariant = !!(activeVariant && !activeVariant.is_primary);

  return {
    setActiveVariantId,
    isViewingNonPrimaryVariant,
  };
}
