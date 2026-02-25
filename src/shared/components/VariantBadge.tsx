/**
 * VariantBadge - Shared component for displaying variant count and "new" indicators
 *
 * Used across multiple components:
 * - ShotBatchItemMobile (batch view mobile)
 * - ShotBatchItemDesktop (batch view desktop)
 * - TimelineItem (timeline view)
 * - MediaGalleryItem (generations gallery)
 * - VideoItem (video gallery)
 * - ChildGenerationsView (segment cards)
 */

import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { TouchableTooltip } from '@/shared/components/ui/touchableTooltip';
import { StatusBadge } from '@/shared/components/StatusBadge';

interface VariantBadgeProps {
  /** Number of total variants (including primary) */
  derivedCount?: number;
  /** Number of variants that haven't been viewed yet */
  unviewedVariantCount?: number;
  /** Whether there are any unviewed variants */
  hasUnviewedVariants?: boolean;
  /**
   * Display variant:
   * - "overlay": Absolute positioned badge for image overlays
   * - "inline": Inline badge
   */
  variant?: 'overlay' | 'inline';
  /**
   * Size variant:
   * - "sm": Smaller badge (h-5 w-5)
   * - "md": Medium badge (h-6 w-6)
   * - "lg": Larger badge (h-6 w-6 sm:h-7 sm:w-7)
   */
  size?: 'sm' | 'md' | 'lg';
  /** Z-index for overlay variant */
  zIndex?: number;
  /** Position classes for overlay variant (default: "top-1 left-1") */
  position?: string;
  /** Whether to show the "new" badge (default: true) */
  showNewBadge?: boolean;
  /** Show NEW badge even when derivedCount <= 1 (won't show count badge, just NEW) */
  alwaysShowNew?: boolean;
  /** Tooltip side for inline variant */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Additional class names */
  className?: string;
  /** Callback to mark all variants as viewed */
  onMarkAllViewed?: () => void;
  /** Optional click handler for the badge (e.g., to scroll to variants section) */
  onClick?: () => void;
}

/**
 * Displays variant count badge and optional "X new" indicator
 * Only renders when derivedCount > 1, or when alwaysShowNew is set and there's unviewed content
 */
export const VariantBadge: React.FC<VariantBadgeProps> = ({
  derivedCount,
  unviewedVariantCount,
  hasUnviewedVariants,
  variant = 'overlay',
  size = 'sm',
  zIndex = 10,
  position = 'top-1 left-1',
  showNewBadge = true,
  alwaysShowNew = false,
  tooltipSide = 'left',
  className,
  onMarkAllViewed,
  onClick,
}) => {
  const hasNew = showNewBadge && hasUnviewedVariants && unviewedVariantCount && unviewedVariantCount > 0;
  const showCountBadge = derivedCount && derivedCount > 1;

  // Don't render if no variants/only 1, unless alwaysShowNew is set and there's something new
  if (!showCountBadge && !(alwaysShowNew && hasNew)) {
    return null;
  }

  // Size classes for the count badge
  const countSizeClasses = {
    sm: 'h-5 w-5 text-[9px]',
    md: 'h-6 w-6 text-[9px]',
    lg: 'h-6 w-6 sm:h-7 sm:w-7 text-[10px]',
  }[size];

  const isOverlay = variant === 'overlay';
  const effectiveTooltipSide = isOverlay ? 'bottom' : tooltipSide;

  return (
    <div
      className={cn(
        'flex items-center',
        isOverlay ? 'absolute gap-0.5' : 'gap-1',
        isOverlay && position,
        className
      )}
      style={isOverlay ? { zIndex } : undefined}
    >
      {hasNew && (
        <StatusBadge
          label={`${unviewedVariantCount} new`}
          color="yellow"
          tooltipText={`${unviewedVariantCount} unviewed variant${unviewedVariantCount !== 1 ? 's' : ''}`}
          tooltipSide={effectiveTooltipSide}
          size={isOverlay ? 'sm' : 'md'}
          onClick={onClick}
          action={onMarkAllViewed ? {
            label: 'Mark all as viewed',
            onClick: onMarkAllViewed,
          } : undefined}
        />
      )}
      {showCountBadge && (
        <TouchableTooltip
          side={effectiveTooltipSide}
          content={<p>{derivedCount} variant{derivedCount !== 1 ? 's' : ''}</p>}
        >
          <div
            className={cn(
              'rounded-full text-white font-medium flex items-center justify-center backdrop-blur-sm cursor-help',
              isOverlay ? 'bg-black/60' : 'bg-black/50',
              countSizeClasses
            )}
          >
            {derivedCount}
          </div>
        </TouchableTooltip>
      )}
    </div>
  );
};
