/**
 * MobileInfoModal Component
 *
 * Shown on touch devices when tapping an already-selected variant.
 * Displays variant details and action buttons (Make Primary, Load Settings).
 */

import React from 'react';
import { X, Star, Download, Image, Check } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { getVariantLabel, hasLoadableSettings } from '../variantPresentation';
import { hasDifferentSourceImages, type CurrentSegmentImagesData } from '../variantSourceImages';
import { VariantDetails } from './VariantDetails';

// --- MobileInfoModal ---

interface MobileInfoModalProps {
  variant: GenerationVariant;
  activeVariantId: string | null;
  availableLoras?: LoraModel[];
  readOnly: boolean;
  onClose: () => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onLoadImages?: (variant: GenerationVariant) => void;
  currentSegmentImages?: CurrentSegmentImagesData;
  loadedImagesVariantId: string | null;
}

export const MobileInfoModal: React.FC<MobileInfoModalProps> = ({
  variant,
  activeVariantId,
  availableLoras,
  readOnly,
  onClose,
  onMakePrimary,
  onLoadVariantSettings,
  onLoadImages,
  currentSegmentImages,
  loadedImagesVariantId,
}) => {
  const isPrimary = variant.is_primary;
  const label = getVariantLabel(variant);

  return (
    <div className="fixed inset-0 z-[100002] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      {/* Content */}
      <div className="relative max-h-[80vh] overflow-y-auto bg-background border border-border rounded-xl p-4 shadow-xl animate-in zoom-in-95 fade-in duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-sm opacity-70 hover:opacity-100 p-1"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2 pr-8">
            <span className="text-lg font-medium">{label}</span>
            {isPrimary && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                Primary
              </span>
            )}
            {variant.id === activeVariantId && !isPrimary && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">
                Viewing
              </span>
            )}
          </div>

          {/* Task details */}
          {variant.params && variant.variant_type !== 'trimmed' && (
            <div className="border-t border-border/50 pt-3">
              <VariantDetails
                variant={variant}
                availableLoras={availableLoras}
              />
            </div>
          )}

          {/* Action buttons */}
          {!readOnly && ((!isPrimary && onMakePrimary) || (onLoadVariantSettings && hasLoadableSettings(variant)) || (onLoadImages && hasDifferentSourceImages(variant, currentSegmentImages))) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
              {!isPrimary && onMakePrimary && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onMakePrimary(variant.id);
                    onClose();
                  }}
                  className="flex-1 gap-1"
                >
                  <Star className="w-4 h-4" />
                  Make Primary
                </Button>
              )}
              {onLoadVariantSettings && hasLoadableSettings(variant) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onLoadVariantSettings(variant.params as Record<string, unknown>);
                    onClose();
                  }}
                  className="flex-1 gap-1"
                >
                  <Download className="w-4 h-4" />
                  Load Settings
                </Button>
              )}
              {onLoadImages && hasDifferentSourceImages(variant, currentSegmentImages) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onLoadImages(variant);
                    onClose();
                  }}
                  className={cn(
                    "flex-1 gap-1",
                    loadedImagesVariantId === variant.id && "bg-green-500/20 border-green-500/50 text-green-400"
                  )}
                >
                  {loadedImagesVariantId === variant.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      Loaded!
                    </>
                  ) : (
                    <>
                      <Image className="w-4 h-4" />
                      Load Images
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
