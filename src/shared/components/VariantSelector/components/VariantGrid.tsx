/**
 * VariantGrid Component
 *
 * Renders the variant grid with pagination controls.
 * Handles layout (3 cols on mobile, 4 on desktop) and page navigation.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { CurrentSegmentImagesData } from '../variantSourceImages';
import { VariantCard } from './VariantCard';

const ITEMS_PER_PAGE = 20;

interface VariantGridProps {
  filteredVariants: GenerationVariant[];
  allVariants: GenerationVariant[];
  activeVariantId: string | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  isMobile: boolean;
  readOnly: boolean;
  availableLoras?: LoraModel[];
  relationshipMap: Record<string, { isParent: boolean; isChild: boolean }>;
  variantLineageDepth: Record<string, number>;
  copiedVariantId: string | null;
  loadedSettingsVariantId: string | null;
  // Callbacks
  onVariantSelect: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  onDeleteVariant?: (variantId: string) => void;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onToggleStar?: (variantId: string, starred: boolean) => void;
  onMouseEnter: (variant: GenerationVariant) => void;
  onShowMobileInfo: (variantId: string) => void;
  onShowLineageGif: (variantId: string) => void;
  onCopyId: (variantId: string) => void;
  onLoadSettings: (variant: GenerationVariant) => void;
  onLoadImages?: (variant: GenerationVariant) => void;
  currentSegmentImages?: CurrentSegmentImagesData;
  loadedImagesVariantId: string | null;
  isDeleteLoading: (variantId: string) => boolean;
}

export const VariantGrid: React.FC<VariantGridProps> = ({
  filteredVariants,
  allVariants,
  activeVariantId,
  currentPage,
  onPageChange,
  isMobile,
  readOnly,
  availableLoras,
  relationshipMap,
  variantLineageDepth,
  copiedVariantId,
  loadedSettingsVariantId,
  onVariantSelect,
  onMakePrimary,
  onDeleteVariant,
  onLoadVariantSettings,
  onToggleStar,
  onMouseEnter,
  onShowMobileInfo,
  onShowLineageGif,
  onCopyId,
  onLoadSettings,
  onLoadImages,
  currentSegmentImages,
  loadedImagesVariantId,
  isDeleteLoading,
}) => {
  const totalPages = Math.ceil(filteredVariants.length / ITEMS_PER_PAGE);
  const start = currentPage * ITEMS_PER_PAGE;
  const paginatedVariants = filteredVariants.slice(start, start + ITEMS_PER_PAGE);

  return (
    <>
      {/* Pagination info */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pb-1 border-b border-border/30">
          <span className="text-[10px] text-muted-foreground">
            {currentPage * ITEMS_PER_PAGE + 1}-{Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredVariants.length)} of {filteredVariants.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className={cn(
                'p-0.5 rounded hover:bg-muted transition-colors',
                currentPage === 0 && 'opacity-30 cursor-not-allowed'
              )}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] text-muted-foreground min-w-[3ch] text-center">
              {currentPage + 1}/{totalPages}
            </span>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className={cn(
                'p-0.5 rounded hover:bg-muted transition-colors',
                currentPage >= totalPages - 1 && 'opacity-30 cursor-not-allowed'
              )}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Variants grid */}
      <div className={cn(
        "grid gap-1 w-full p-0.5 items-start",
        isMobile ? "grid-cols-3" : "grid-cols-4"
      )}>
        {paginatedVariants.map((variant) => {
          const isActive = variant.id === activeVariantId;
          const isPrimary = variant.is_primary;
          const isParent = relationshipMap[variant.id]?.isParent || false;
          const isChild = relationshipMap[variant.id]?.isChild || false;

          return (
            <VariantCard
              key={variant.id}
              variant={variant}
              isActive={isActive}
              isPrimary={isPrimary}
              isParent={isParent}
              isChild={isChild}
              activeVariantId={activeVariantId}
              isMobile={isMobile}
              readOnly={readOnly}
              variants={allVariants}
              availableLoras={availableLoras}
              lineageDepth={variantLineageDepth[variant.id] || 0}
              isDeleteLoading={isDeleteLoading(variant.id)}
              copiedVariantId={copiedVariantId}
              loadedSettingsVariantId={loadedSettingsVariantId}
              onVariantSelect={onVariantSelect}
              onMakePrimary={onMakePrimary}
              onDeleteVariant={onDeleteVariant}
              onLoadVariantSettings={onLoadVariantSettings}
              onToggleStar={onToggleStar}
              onMouseEnter={onMouseEnter}
              onShowMobileInfo={onShowMobileInfo}
              onShowLineageGif={onShowLineageGif}
              onCopyId={onCopyId}
              onLoadSettings={onLoadSettings}
              onLoadImages={onLoadImages}
              currentSegmentImages={currentSegmentImages}
              loadedImagesVariantId={loadedImagesVariantId}
            />
          );
        })}
      </div>

      {/* Empty state when filtering */}
      {filteredVariants.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-2">
          No variants match this filter
        </div>
      )}
    </>
  );
};
