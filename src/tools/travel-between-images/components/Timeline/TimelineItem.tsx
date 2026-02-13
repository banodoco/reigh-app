import React, { useRef, useState, useCallback } from "react";
import { GenerationRow } from "@/types/shots";
import { getDisplayUrl, cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Trash2, Copy, Check, Pencil, Maximize2 } from "lucide-react";
import { useProgressiveImage } from "@/shared/hooks/useProgressiveImage";
import { isProgressiveLoadingEnabled } from "@/shared/settings/progressiveLoading";
import { framesToSeconds } from "./utils/time-utils";
import { TIMELINE_PADDING_OFFSET } from "./constants";
import { VariantBadge } from "@/shared/components/VariantBadge";
import { useMarkVariantViewed } from "@/shared/hooks/useMarkVariantViewed";
import { useIsTouchDevice } from "@/shared/hooks/use-mobile";
import { getAspectRatioStyle as getProjectAspectRatioStyle } from "@/shared/components/ShotImageManager/utils/image-utils";

// Props for individual timeline items
interface TimelineItemProps {
  image: GenerationRow;
  framePosition: number;
  isDragging: boolean;
  isSwapTarget: boolean;
  dragOffset: { x: number; y: number } | null;
  onMouseDown?: (e: React.MouseEvent, imageId: string) => void;
  onDoubleClick?: () => void;
  onMobileTap?: () => void;
  zoomLevel: number;
  timelineWidth: number;
  fullMinFrames: number;
  fullRange: number;
  currentDragFrame: number | null;
  originalFramePos: number;
  /** When provided, image src will only be set once this is true */
  shouldLoad?: boolean;

  // Action handlers (optional in readOnly mode)
  onDelete?: (imageId: string) => void;
  onDuplicate?: (imageId: string, timeline_frame: number) => void;
  onInpaintClick?: () => void;
  duplicatingImageId?: string;
  duplicateSuccessImageId?: string;
  projectAspectRatio?: string;
  // Read-only mode - hides all action buttons
  readOnly?: boolean;
  // Just-dropped effect - shows temporary hover state
  isJustDropped?: boolean;
  // Prefetch callback for task data (called on hover)
  onPrefetch?: () => void;
  // Multi-select state
  isSelected?: boolean;
  onSelectionClick?: (e: React.MouseEvent) => void;
  /** Number of selected items (for badge display) */
  selectedCount?: number;
}

// TimelineItem component - simplified without dnd-kit
const TimelineItem: React.FC<TimelineItemProps> = ({
  image,
  framePosition,
  isDragging,
  isSwapTarget,
  dragOffset,
  onMouseDown,
  onDoubleClick,
  onMobileTap,
  timelineWidth,
  fullMinFrames,
  fullRange,
  currentDragFrame,
  originalFramePos,
  shouldLoad = true,
  onDelete,
  onDuplicate,
  onInpaintClick,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio = undefined,
  readOnly = false,
  isJustDropped = false,
  onPrefetch,
  isSelected = false,
  onSelectionClick,
}) => {
  
  // Track hover state
  const [isHovered, setIsHovered] = useState(false);

  // Hook for marking variants as viewed
  const { markAllViewed } = useMarkVariantViewed();

  // Device detection for touch-specific UI
  const isTouchDevice = useIsTouchDevice();

  // Callback to mark all variants for this generation as viewed
  const handleMarkAllVariantsViewed = useCallback(() => {
    if (image.generation_id) {
      markAllViewed(image.generation_id);
    }
  }, [image.generation_id, markAllViewed]);
  
  // Track "just dropped" visual effect - auto-clears after animation
  const [showDropEffect, setShowDropEffect] = useState(false);
  
  React.useEffect(() => {
    if (isJustDropped) {
      setShowDropEffect(true);
      // Clear the effect after 800ms (enough time for visual feedback)
      const timer = setTimeout(() => {
        setShowDropEffect(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isJustDropped]);
  
  // Combined "elevated" state: actual hover OR just-dropped effect (unless actually hovering takes over)
  const isElevated = isHovered || showDropEffect || isDragging || isSelected;
  
  // Track if we just clicked a button to prevent drag from starting
  const buttonClickedRef = useRef(false);

  // Track mouse down position for drag detection (to prevent onClick after drag)
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  
  // imageKey is the shot_generations.id - unique per entry in the shot
  // (Previously used shotImageEntryId fallback, but now id IS the shot entry ID)
  const imageKey = image.id;

  // ===== MOBILE TAP HANDLING =====
  // Simple immediate tap handler (like ShotBatchItemMobile pattern)
  // - Single tap → immediately toggles selection
  // - When selected → center button appears to open lightbox
  // - No double-tap detection delays
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const SCROLL_THRESHOLD = 10;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (readOnly) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, [readOnly]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (readOnly || !touchStartPosRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
    touchStartPosRef.current = null;

    // Ignore if user scrolled
    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
      return;
    }

    // Check if tapping on a button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    // Immediate selection toggle (like ShotBatchItemMobile)
    if (onSelectionClick) {
      onSelectionClick({ preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent);
    } else if (onMobileTap) {
      // Fallback for phones: tap opens lightbox directly
      onMobileTap();
    }
  }, [readOnly, onSelectionClick, onMobileTap]);

  // Calculate aspect ratio for consistent sizing
  const aspectRatioStyle = (() => {
    // Try to get dimensions from image metadata first
    let width = image.metadata?.width as number | undefined;
    let height = image.metadata?.height as number | undefined;

    // If not found, try to extract from resolution string
    if (!width || !height) {
      const originalParams = image.metadata?.originalParams as Record<string, unknown> | undefined;
      const orchestratorDetails = originalParams?.orchestrator_details as Record<string, unknown> | undefined;
      const resolution = orchestratorDetails?.resolution as string | undefined;
      if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
        const [w, h] = resolution.split('x').map(Number);
        if (!isNaN(w) && !isNaN(h)) {
          width = w;
          height = h;
        }
      }
    }

    // If we have image dimensions, use them
    if (width && height) {
      const aspectRatio = width / height;
      return { aspectRatio: `${aspectRatio}` };
    }

    // Fall back to project aspect ratio (shared utility handles default)
    return getProjectAspectRatioStyle(projectAspectRatio);
  })();

  // Progressive loading for timeline images
  const progressiveEnabled = isProgressiveLoadingEnabled();
  const { src: progressiveSrc, isThumbShowing, isFullLoaded, ref: progressiveRef } = useProgressiveImage(
    progressiveEnabled ? image.thumbUrl : null,
    image.imageUrl,
    {
      priority: false, // Timeline images load progressively
      lazy: true,
      enabled: progressiveEnabled && shouldLoad,
      crossfadeMs: 180
    }
  );

  // Use progressive src if available, otherwise fallback to display URL
  const displayImageUrl = progressiveEnabled && progressiveSrc ? progressiveSrc : getDisplayUrl(image.thumbUrl || image.imageUrl);

  // Action handlers
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDelete) {
      // Use id (shot_generations.id) - unique per entry
      onDelete(image.id);
    }
  };

  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (onDuplicate) {
      // Use id (shot_generations.id) - unique per entry
      onDuplicate(image.id, framePosition);
    }
  };
  // Calculate position as pixel offset with padding adjustment
  // Use constants to ensure consistency across all timeline components
  const effectiveWidth = timelineWidth - (TIMELINE_PADDING_OFFSET * 2); // Subtract both left and right padding
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((framePosition - fullMinFrames) / fullRange) * effectiveWidth;

  // [Position0Debug] Only log position 0 items to reduce noise

  // Apply drag offset if dragging
  // To avoid double-counting we translate by the difference between the desired cursor offset
  // and the shift already implied by the updated framePosition.
  let finalX = pixelPosition;
  if (isDragging && dragOffset) {
    const originalPixel = TIMELINE_PADDING_OFFSET + ((originalFramePos - fullMinFrames) / fullRange) * effectiveWidth;
    const desiredPixel = originalPixel + dragOffset.x;
    finalX = desiredPixel; // cursor-aligned
  }

  // Use current drag frame for display if dragging, otherwise use original position
  const displayFrame = isDragging && currentDragFrame !== null ? currentDragFrame : framePosition;

  // Calculate position in percentage of the full range
  const leftPercent = (finalX / timelineWidth) * 100;

  return (
    <div
      data-item-id={imageKey}
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: `translate(-50%, -50%) ${isElevated ? 'scale(1.15)' : 'scale(1)'}`,
        // Only transition transform/opacity/box-shadow, NOT position (left) - prevents visual jitter when coordinate system recalculates
        transition: isDragging ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out, box-shadow 0.2s ease-out',
        opacity: isDragging ? 0.8 : 1,
        zIndex: isElevated ? 20 : 1,
        cursor: isSelected ? 'pointer' : 'move',
        boxShadow: isSelected
          ? '0 0 0 4px rgba(249, 115, 22, 1), 0 0 0 6px rgba(249, 115, 22, 0.3)'
          : (isElevated ? '0 8px 25px rgba(0, 0, 0, 0.15)' : 'none'),
        // Prevent clicks from reaching items underneath when not hovered
        pointerEvents: isElevated ? 'auto' : 'auto',
      }}
      onMouseDown={(e) => {

        // Track mouse down position for drag detection
        mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

        // If clicking on a button area while hovered, don't start drag
        const target = e.target as HTMLElement;
        const isClickingButton = target.closest('button') || target.closest('[data-click-blocker]');

        // Check both the DOM and the recent click flag
        if (isClickingButton || buttonClickedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (onMouseDown) {
          onMouseDown(e, imageKey);
        }
      }}
      onMouseEnter={() => {
        setIsHovered(true);
        onPrefetch?.();
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onClick={(e) => {
        // Handle selection on click (desktop)
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[data-click-blocker]')) return;

        // Check if this was a drag (mouse moved significantly)
        if (mouseDownPosRef.current) {
          const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
          const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
          mouseDownPosRef.current = null;
          if (dx > 5 || dy > 5) return; // Was a drag, not a click
        }

        if (onSelectionClick) {
          onSelectionClick(e);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={isSwapTarget ? "ring-4 ring-primary/60" : ""}
    >
      <div className="flex flex-col items-center relative group">
        <div
          className={`relative border-2 ${isDragging ? "border-primary/50" : "border-primary"} rounded-lg overflow-hidden group`}
          style={{
            width: '120px', // Fixed width for consistent button positioning
            maxHeight: '120px', // Prevent tall portrait images from overflowing
            // Height controlled by aspectRatio for proper display
            transform: isElevated ? 'scale(1.05)' : 'scale(1)',
            transition: isDragging ? 'none' : 'all 0.2s ease-out',
            ...aspectRatioStyle, // Apply aspect ratio to control height
          }}
        >
          <img
            ref={progressiveRef}
            src={shouldLoad ? displayImageUrl : '/placeholder.svg'}
            alt={`Time ${framesToSeconds(displayFrame)}`}
            className={cn(
              "w-full h-full object-cover",
              // Progressive loading visual states - no transition to avoid flicker on tap
              progressiveEnabled && isThumbShowing && "opacity-95",
              progressiveEnabled && isFullLoaded && "opacity-100"
            )}
            draggable={false}
            loading="lazy"
          />

          {/* Selected state: show "Tap timeline to place" hint and Open button (touch devices only) */}
          {/* This replaces the old double-tap pattern with explicit buttons (like ShotBatchItemMobile) */}
          {isSelected && isTouchDevice && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none gap-1">
              {/* "Tap timeline to place" hint */}
              <div className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-md">
                Tap timeline to place
              </div>
              {/* Open lightbox button (like ShotBatchItemMobile) */}
              {onMobileTap && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-full bg-background/90 hover:bg-background shadow-lg pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMobileTap();
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                  }}
                  title="Open lightbox"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}

          {/* Hover action buttons */}
          {!isDragging && !readOnly && (
            <>
              {/* Click blocker for Edit Button to prevent timeline item clicks */}
              {onInpaintClick && (
                <div
                  data-click-blocker="edit-button"
                  className="absolute bottom-0 left-0 h-7 w-7 z-[19]"
                  onMouseDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onPointerDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
              )}
              {/* Edit Button - Opens lightbox in edit mode (matches ShotEditor pattern) */}
              {onInpaintClick && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute bottom-1 left-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    onInpaintClick();
                  }}
                  onMouseDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onPointerDown={(e) => {
                    buttonClickedRef.current = true;
                    e.preventDefault();
                    e.stopPropagation();
                    setTimeout(() => {
                      buttonClickedRef.current = false;
                    }, 100);
                  }}
                  onTouchStart={(e) => {
                    // Prevent touch events from bubbling to parent's double-tap handler
                    e.stopPropagation();
                  }}
                  onTouchEnd={(e) => {
                    // Prevent touch events from bubbling to parent's double-tap handler
                    e.stopPropagation();
                  }}
                  title="Edit image"
                >
                  <Pencil className="!h-3 !w-3" />
                </Button>
              )}

              {/* Duplicate Button */}
              {/* "X new" badge + Variant Count - top left */}
              <VariantBadge
                derivedCount={image.derivedCount}
                unviewedVariantCount={image.unviewedVariantCount}
                hasUnviewedVariants={image.hasUnviewedVariants}
                variant="overlay"
                size="sm"
                zIndex={20}
                onMarkAllViewed={handleMarkAllVariantsViewed}
              />
              
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-1 right-[1.65rem] h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDuplicateClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onTouchStart={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                disabled={duplicatingImageId === imageKey}
                title="Duplicate image"
              >
                {duplicatingImageId === imageKey ? (
                  <div className="!h-3 !w-3 animate-spin rounded-full border-b-2 border-white"></div>
                ) : duplicateSuccessImageId === imageKey ? (
                  <Check className="!h-3 !w-3" />
                ) : (
                  <Copy className="!h-3 !w-3" />
                )}
              </Button>

              {/* Delete Button */}
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                onClick={handleDeleteClick}
                onMouseDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onPointerDown={(e) => {
                  buttonClickedRef.current = true;
                  e.preventDefault();
                  e.stopPropagation();
                  setTimeout(() => {
                    buttonClickedRef.current = false;
                  }, 100);
                }}
                onTouchStart={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  // Prevent touch events from bubbling to parent's double-tap handler
                  e.stopPropagation();
                }}
                title="Remove from timeline"
              >
                <Trash2 className="!h-3 !w-3" />
              </Button>
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] leading-none text-center py-0.5 pointer-events-none whitespace-nowrap overflow-hidden">
            <span className="inline-block">{framesToSeconds(displayFrame)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🎯 PERF FIX: Wrap in React.memo to prevent re-renders when props haven't changed
// TimelineItem is rendered for each image, so memoization is important for performance
export default React.memo(TimelineItem); 