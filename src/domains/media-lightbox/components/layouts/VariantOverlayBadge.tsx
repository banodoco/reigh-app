/**
 * VariantOverlayBadge - Displays variant status and make-main button
 *
 * Shows at top-center of the lightbox:
 * - "Main variant" badge when viewing the primary variant
 * - "Make main" button when viewing a non-primary variant
 *
 * Can be used in two modes:
 * 1. Props mode: Pass all props explicitly (legacy usage)
 * 2. Context mode: Uses LightboxStateContext via hooks (preferred)
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Check, Star, Loader2 } from 'lucide-react';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { useLightboxVariantsSafe, useLightboxCoreSafe } from '../../contexts/LightboxStateContext';

interface VariantOverlayBadgeProps {
  // All props are optional - uses context if not provided
  activeVariant?: GenerationVariant | undefined;
  variants?: GenerationVariant[] | undefined;
  readOnly?: boolean;
  isMakingMainVariant?: boolean;
  canMakeMainVariant?: boolean;
  onMakeMainVariant?: () => void;
}

export const VariantOverlayBadge: React.FC<VariantOverlayBadgeProps> = ({
  activeVariant: activeVariantProp,
  variants: variantsProp,
  readOnly: readOnlyProp,
  isMakingMainVariant: isMakingMainVariantProp,
  canMakeMainVariant: canMakeMainVariantProp,
  onMakeMainVariant: onMakeMainVariantProp,
}) => {
  // Get values from context (safe versions return defaults if outside provider)
  const core = useLightboxCoreSafe();
  const variantsContext = useLightboxVariantsSafe();

  // Use props if provided, otherwise fall back to context
  const activeVariant = activeVariantProp ?? variantsContext.activeVariant;
  const variants = variantsProp ?? variantsContext.variants;
  const readOnly = readOnlyProp ?? core.readOnly;
  const isMakingMainVariant = isMakingMainVariantProp ?? variantsContext.isMakingMainVariant;
  const canMakeMainVariant = canMakeMainVariantProp ?? variantsContext.canMakeMainVariant;
  const onMakeMainVariant = onMakeMainVariantProp ?? variantsContext.handleMakeMainVariant;

  if (readOnly || !activeVariant || !variants) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-2 select-none"
      onClick={(e) => e.stopPropagation()}
    >
        {/* Main variant badge - only show when multiple variants exist */}
        {variants.length > 1 && activeVariant.is_primary && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-green-500/90 text-white text-sm font-medium shadow-lg">
            <Check className="w-4 h-4" />
            <span>Main variant</span>
          </div>
        )}
        {/* Make main button - only show for non-primary variants */}
        {!activeVariant.is_primary && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onMakeMainVariant}
            disabled={isMakingMainVariant || !canMakeMainVariant}
            className="bg-orange-500/90 hover:bg-orange-600 text-white border-none shadow-lg"
          >
            {isMakingMainVariant ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Star className="w-4 h-4 mr-1.5" />
            )}
            Make main
          </Button>
        )}
    </div>
  );
};
