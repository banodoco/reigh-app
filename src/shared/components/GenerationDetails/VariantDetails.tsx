import React from 'react';
import { getVariantConfig } from '@/tools/travel-between-images/components/TaskDetails/taskDetailsConfig';

interface VariantMeta {
  isPrimary?: boolean;
  isParent?: boolean;
  isChild?: boolean;
  createdAt?: string;
}

interface VariantDetailsProps {
  variantType: string;
  variantParams: Record<string, any>;
  variantMeta?: VariantMeta;
  variant: 'hover' | 'modal' | 'panel';
}

/**
 * Format a date string as "time ago"
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

/**
 * Displays relationship badges for variants (Main, Parent, Child)
 */
const VariantBadges: React.FC<{ variantMeta: VariantMeta; textSize: string }> = ({
  variantMeta,
  textSize,
}) => {
  const { isPrimary, isParent, isChild } = variantMeta;

  if (!isPrimary && !isParent && !isChild) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isPrimary && (
        <span className={`${textSize} text-green-500 flex items-center gap-1`}>
          <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Main
        </span>
      )}
      {isParent && (
        <span className={`${textSize} text-blue-400`}>↑ Based on this</span>
      )}
      {isChild && (
        <span className={`${textSize} text-purple-400`}>↓ Based on current</span>
      )}
    </div>
  );
};

/**
 * Displays details for transformation variants (trimmed, upscaled)
 *
 * These are variants that don't have their own full task data -
 * they're transformations of existing media.
 */
export const VariantDetails: React.FC<VariantDetailsProps> = ({
  variantType,
  variantParams,
  variantMeta,
  variant,
}) => {
  const config = getVariantConfig(variant, false, 0);

  const getVariantLabel = () => {
    switch (variantType) {
      case 'trimmed': {
        const duration = variantParams?.trimmed_duration;
        return duration ? `Trimmed (${duration.toFixed(1)}s)` : 'Trimmed';
      }
      case 'upscaled': {
        const scale = variantParams?.scale_factor || 2;
        return `Upscaled ${scale}x`;
      }
      case 'magic_edit':
        return 'Magic Edit';
      case 'original':
        return 'Original';
      default:
        return variantType || 'Variant';
    }
  };

  return (
    <div
      className={`p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : 'w-[280px]'} space-y-2`}
    >
      {/* Header with variant type and time */}
      <div className="flex items-center justify-between">
        <span className={`${config.textSize} font-medium text-foreground`}>
          {getVariantLabel()}
        </span>
        {variantMeta?.createdAt && (
          <span className={`${config.textSize} text-muted-foreground`}>
            {formatTimeAgo(variantMeta.createdAt)}
          </span>
        )}
      </div>

      {/* Status badges */}
      {variantMeta && (
        <VariantBadges variantMeta={variantMeta} textSize={config.textSize} />
      )}

      {/* Variant-specific details */}
      {variantType === 'trimmed' && (
        <div className="space-y-1">
          {variantParams?.trimmed_duration && (
            <div className={`${config.textSize} ${config.fontWeight}`}>
              <span className="text-muted-foreground">Duration: </span>
              <span className="text-foreground">
                {variantParams.trimmed_duration.toFixed(1)}s
              </span>
            </div>
          )}
          {(variantParams?.start_trim !== undefined ||
            variantParams?.end_trim !== undefined) && (
            <div className={`${config.textSize} ${config.fontWeight}`}>
              <span className="text-muted-foreground">Trimmed: </span>
              <span className="text-foreground">
                {variantParams?.start_trim?.toFixed(1) || '0'}s from start
                {variantParams?.end_trim
                  ? `, ${variantParams.end_trim.toFixed(1)}s from end`
                  : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {variantType === 'upscaled' && (
        <div className="space-y-1">
          <div className={`${config.textSize} ${config.fontWeight}`}>
            <span className="text-muted-foreground">Scale: </span>
            <span className="text-foreground">
              {variantParams?.scale_factor || 2}x
            </span>
          </div>
          {variantParams?.output_format && (
            <div className={`${config.textSize} ${config.fontWeight}`}>
              <span className="text-muted-foreground">Format: </span>
              <span className="text-foreground uppercase">
                {variantParams.output_format}
              </span>
            </div>
          )}
        </div>
      )}

      {variantType === 'magic_edit' && variantParams?.prompt && (
        <div className="space-y-1">
          <div className={`${config.textSize} font-medium text-muted-foreground`}>
            Prompt
          </div>
          <p
            className={`${config.textSize} ${config.fontWeight} text-foreground break-words line-clamp-3`}
          >
            "{variantParams.prompt}"
          </p>
        </div>
      )}

      {/* Source image thumbnail if available */}
      {variantParams?.image && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className={`${config.textSize} font-medium text-muted-foreground mb-1`}>
            Source
          </div>
          <img
            src={variantParams.image}
            alt="Source"
            className="w-16 h-16 object-cover rounded border"
          />
        </div>
      )}
    </div>
  );
};
