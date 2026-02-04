/**
 * VariantCard Component
 *
 * Renders an individual variant thumbnail with:
 * - Clickable thumbnail with status rings (active, primary, parent, child)
 * - NEW badge or time-ago indicator
 * - Desktop: Info button in bottom-right corner (appears on hover) with tooltip showing generation details
 * - Mobile: plain button (info shown via MobileInfoModal on re-tap)
 */

import React from 'react';
import { Check, ArrowDown, ArrowUp, Info } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { GenerationDetails } from '@/shared/components/GenerationDetails';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import { getSourceTaskId } from '@/shared/lib/taskIdHelpers';
import { useGetTask } from '@/shared/hooks/useTasks';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { getVariantIcon, getVariantLabel, isNewVariant, getTimeAgo } from '../utils';

// --- VariantHoverDetails (fetches real task data for hover tooltip) ---

interface VariantHoverDetailsProps {
  variant: GenerationVariant;
  availableLoras?: LoraModel[];
}

const VariantHoverDetails: React.FC<VariantHoverDetailsProps> = ({ variant, availableLoras }) => {
  const variantParams = variant.params;
  const sourceTaskId = getSourceTaskId(variantParams);
  const { data: task, isLoading } = useGetTask(sourceTaskId || '');

  if (task && !isLoading) {
    return (
      <GenerationDetails
        task={task}
        inputImages={[]}
        variant="hover"
        isMobile={false}
        availableLoras={availableLoras}
        showCopyButtons={true}
      />
    );
  }

  return (
    <GenerationDetails
      task={{
        taskType: variantParams?.task_type || variantParams?.created_from || 'video_generation',
        params: variantParams,
      }}
      inputImages={[]}
      variant="hover"
      isMobile={false}
      availableLoras={availableLoras}
      showCopyButtons={true}
    />
  );
};

// --- VariantCard ---

interface VariantCardProps {
  variant: GenerationVariant;
  isActive: boolean;
  isPrimary: boolean;
  isParent: boolean;
  isChild: boolean;
  activeVariantId: string | null;
  isMobile: boolean;
  readOnly: boolean;
  /** All variants in the list (for finding parent variant by source_variant_id) */
  variants: GenerationVariant[];
  availableLoras?: LoraModel[];
  /** Lineage depth for this variant (show GIF button when >= 5) */
  lineageDepth: number;
  /** Whether a delete operation is loading for this variant */
  isDeleteLoading: boolean;
  /** Currently copied variant ID (for copy-id feedback) */
  copiedVariantId: string | null;
  /** Loaded settings variant ID (for load-settings feedback) */
  loadedSettingsVariantId: string | null;
  // Callbacks
  onVariantSelect: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  onDeleteVariant?: (variantId: string) => void;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onMouseEnter: (variant: GenerationVariant) => void;
  onShowMobileInfo: (variantId: string) => void;
  onShowLineageGif: (variantId: string) => void;
  onCopyId: (variantId: string) => void;
  onLoadSettings: (variant: GenerationVariant) => void;
}

export const VariantCard: React.FC<VariantCardProps> = ({
  variant,
  isActive,
  isPrimary,
  isParent,
  isChild,
  activeVariantId,
  isMobile,
  readOnly,
  availableLoras,
  lineageDepth,
  isDeleteLoading,
  copiedVariantId,
  loadedSettingsVariantId,
  onVariantSelect,
  onMakePrimary,
  onDeleteVariant,
  onLoadVariantSettings,
  onMouseEnter,
  onShowMobileInfo,
  onShowLineageGif,
  onCopyId,
  onLoadSettings,
}) => {
  const Icon = getVariantIcon(variant.variant_type);
  const label = getVariantLabel(variant);

  const buttonContent = (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (isMobile && isActive) {
          onShowMobileInfo(variant.id);
          return;
        }
        onVariantSelect(variant.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onVariantSelect(variant.id);
        }
      }}
      onTouchEnd={(e) => {
        if (isMobile) {
          e.stopPropagation();
          if (isActive) {
            onShowMobileInfo(variant.id);
            return;
          }
          onVariantSelect(variant.id);
        }
      }}
      onMouseEnter={() => onMouseEnter(variant)}
      className={cn(
        'relative p-0.5 rounded transition-all w-full touch-manipulation group/variant overflow-hidden cursor-pointer',
        'hover:bg-muted/80',
        isPrimary && !isActive && 'ring-2 ring-green-500 bg-green-500/10',
        isActive
          ? 'ring-2 ring-orange-500 bg-orange-500/10'
          : 'opacity-70 hover:opacity-100',
        isParent && !isActive && !isPrimary && 'ring-1 ring-blue-500/50',
        isChild && !isActive && !isPrimary && 'ring-1 ring-purple-500/50'
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-full rounded overflow-hidden bg-muted" style={{ paddingBottom: '56.25%' }}>
        {(variant.thumbnail_url || variant.location) ? (
          <img
            src={variant.thumbnail_url || variant.location}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            <Icon className="w-4 h-4 text-muted-foreground" />
          </div>
        )}

        {/* Primary badge */}
        {isPrimary && (
          <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5 pointer-events-none">
            <Check className="w-2 h-2 text-white" />
          </div>
        )}

        {/* Parent relationship badge */}
        {isParent && !isActive && (
          <div className="absolute top-0.5 left-0.5 bg-blue-500 rounded-full p-0.5 pointer-events-none" title="Current is based on this">
            <ArrowUp className="w-2 h-2 text-white" />
          </div>
        )}

        {/* Child relationship badge */}
        {isChild && !isActive && (
          <div className="absolute top-0.5 left-0.5 bg-purple-500 rounded-full p-0.5 pointer-events-none" title="Based on current">
            <ArrowDown className="w-2 h-2 text-white" />
          </div>
        )}

        {/* NEW badge or time ago */}
        {isNewVariant(variant, activeVariantId) ? (
          <div className="absolute bottom-0.5 left-0.5 bg-yellow-500 text-black text-[8px] font-bold px-1 rounded pointer-events-none">
            NEW
          </div>
        ) : (
          <div className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-[8px] px-1 rounded pointer-events-none">
            {getTimeAgo(variant.created_at)}
          </div>
        )}

        {/* Info button - bottom right, shows on hover (desktop only) */}
        {!isMobile && variant.params && variant.variant_type !== 'trimmed' && (
          <div className="absolute bottom-0.5 right-0.5 opacity-0 group-hover/variant:opacity-100 transition-opacity pointer-events-auto">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <div
                  className="h-5 w-5 rounded-full bg-black/50 flex items-center justify-center cursor-pointer hover:bg-black/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3 w-3 text-white" strokeWidth={2.5} />
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                className="max-w-md p-0 border-0 bg-background/95 backdrop-blur-sm z-[100001] data-[state=closed]:duration-0"
                sideOffset={4}
                collisionPadding={10}
              >
                <div className="p-2">
                  <VariantHoverDetails
                    variant={variant}
                    availableLoras={availableLoras}
                  />
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );

  // Both mobile and desktop now render the same buttonContent
  // Desktop has the info button inside with tooltip on hover
  return <React.Fragment key={variant.id}>{buttonContent}</React.Fragment>;
};
