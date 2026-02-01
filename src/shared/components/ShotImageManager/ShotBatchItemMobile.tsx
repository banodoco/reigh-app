/**
 * ShotBatchItemMobile - Mobile-optimized batch view image item
 *
 * Touch-based selection with tap-to-select, no drag support.
 * Uses shared utilities for aspect ratio and progressive loading.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, Copy, Check, Maximize2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useBatchImageLoading } from '@/shared/hooks/useBatchImageLoading';
import { getImageAspectRatioStyle } from '@/shared/lib/imageAspectRatio';
import { ShotBatchItemMobileProps } from './types';
import { VariantBadge } from '@/shared/components/VariantBadge';

export const ShotBatchItemMobile: React.FC<ShotBatchItemMobileProps> = ({
  image,
  isSelected,
  index,
  onMobileTap,
  onDelete,
  onDuplicate,
  onOpenLightbox,
  onInpaintClick,
  hideDeleteButton = false,
  duplicatingImageId,
  duplicateSuccessImageId,
  shouldLoad = true,
  projectAspectRatio,
  frameNumber,
  readOnly = false,
  onMarkAllViewed,
}) => {
  // Progressive loading setup
  const { displayImageUrl, progressiveRef } = useBatchImageLoading({
    thumbUrl: image.thumbUrl,
    imageUrl: image.imageUrl,
    shouldLoad,
  });

  // Calculate aspect ratio for consistent sizing
  const aspectRatioStyle = getImageAspectRatioStyle(image as any, projectAspectRatio);

  // Check if an event originated from inside a button using composedPath (more reliable on touch devices)
  const isEventInsideButton = (e: React.MouseEvent | React.TouchEvent): boolean => {
    const path = (e as any).nativeEvent?.composedPath?.() as HTMLElement[] | undefined;
    const result = path
      ? path.some((el) => (el as HTMLElement)?.tagName === 'BUTTON' || (el as HTMLElement)?.closest?.('button'))
      : !!(e.target as HTMLElement).closest('button');
    console.log('[ShotBatchItemMobile] isEventInsideButton:', {
      result,
      hasPath: !!path,
      pathLength: path?.length,
      targetTagName: (e.target as HTMLElement)?.tagName,
      imageId: image.id?.substring(0, 8),
    });
    return result;
  };

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('[ShotBatchItemMobile] handleContainerClick START', {
      imageId: image.id?.substring(0, 8),
      targetTagName: (e.target as HTMLElement)?.tagName,
    });
    if (isEventInsideButton(e)) {
      console.log('[ShotBatchItemMobile] handleContainerClick - SKIPPED (inside button)');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    console.log('[ShotBatchItemMobile] handleContainerClick - calling onMobileTap');
    onMobileTap();
  };

  const handleContainerTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    console.log('[ShotBatchItemMobile] handleContainerTouchEnd START', {
      imageId: image.id?.substring(0, 8),
      targetTagName: (e.target as HTMLElement)?.tagName,
    });
    if (isEventInsideButton(e)) {
      console.log('[ShotBatchItemMobile] handleContainerTouchEnd - SKIPPED (inside button)');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    console.log('[ShotBatchItemMobile] handleContainerTouchEnd - calling onMobileTap');
    onMobileTap();
  };

  // image.id is shot_generations.id - unique per entry
  const isDuplicating = duplicatingImageId === image.id;
  const showSuccessIcon = duplicateSuccessImageId === image.id;

  return (
    <>
      <div
        className={cn(
          "relative group cursor-pointer rounded-lg overflow-hidden border-4",
          isSelected
            ? "border-blue-500 ring-4 ring-blue-200 dark:ring-blue-800"
            : "border-transparent"
        )}
        onClick={handleContainerClick}
        onTouchEnd={handleContainerTouchEnd}
        style={aspectRatioStyle}
      >
        {/* Image */}
        <img
          ref={progressiveRef}
          src={shouldLoad ? displayImageUrl : undefined}
          alt={`Generated image ${index + 1}`}
          className={cn(
            "w-full h-full object-cover",
            !shouldLoad && "bg-gray-100 dark:bg-gray-800"
          )}
          loading="lazy"
        />


        {/* Variant Count + NEW badge - bottom center */}
        <VariantBadge
          derivedCount={(image as any).derivedCount}
          unviewedVariantCount={(image as any).unviewedVariantCount}
          hasUnviewedVariants={(image as any).hasUnviewedVariants}
          variant="overlay"
          size="sm"
          position="bottom-1 left-1/2 -translate-x-1/2"
          onMarkAllViewed={onMarkAllViewed}
        />

        {/* Center lightbox button - shows when selected */}
        {isSelected && onOpenLightbox && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full bg-background/90 hover:bg-background shadow-lg pointer-events-auto"
              onClick={(e) => {
                console.log('[ShotBatchItemMobile] Lightbox button onClick', { imageId: image.id?.substring(0, 8) });
                e.stopPropagation();
                onOpenLightbox();
              }}
              title="Open lightbox"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Copy button - opposite side of video (even index: left, odd index: right) */}
        {!readOnly && onDuplicate && !isSelected && (
          <Button
            size="icon"
            variant="secondary"
            className={cn(
              "absolute top-1 h-8 w-8 bg-card/75 dark:bg-gray-800/75 hover:bg-card/90 dark:hover:bg-gray-800/90",
              index % 2 === 0 ? "left-1" : "right-1"
            )}
            onClick={(e) => {
              console.log('[ShotBatchItemMobile] Copy button onClick', { imageId: image.id?.substring(0, 8) });
              e.stopPropagation();
              // Use id (shot_generations.id) for duplication
              onDuplicate(image.id, (image as any).timeline_frame ?? index);
            }}
            disabled={isDuplicating || image.id?.startsWith('temp-')}
            title={image.id?.startsWith('temp-') ? "Please wait..." : "Duplicate"}
          >
            {showSuccessIcon ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : isDuplicating ? (
              <div className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}

        {/* Delete button - opposite side of video (even index: left, odd index: right) */}
        {!readOnly && isSelected && onDelete && (
          <Button
            size="icon"
            variant="destructive"
            className={cn(
              "absolute top-1 h-8 w-8 bg-red-500/75 hover:bg-red-500/90",
              index % 2 === 0 ? "left-1" : "right-1"
            )}
            onClick={(e) => {
              console.log('[ShotBatchItemMobile] Delete button onClick', { imageId: image.id?.substring(0, 8) });
              e.stopPropagation();
              onDelete();
            }}
            disabled={image.id?.startsWith('temp-')}
            title={image.id?.startsWith('temp-') ? "Please wait..." : "Delete"}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </>
  );
};
