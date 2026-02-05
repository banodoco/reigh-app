/**
 * LightboxShell - Dialog/Overlay container for MediaLightbox
 *
 * Encapsulates all the complex event handling for the lightbox modal:
 * - Dialog root/portal/overlay
 * - Pointer/touch/click event handling with z-index awareness
 * - Double-tap to close on mobile
 * - Body scroll locking
 * - Accessibility elements
 *
 * Note: Tasks pane controls are handled by the existing PaneControlTab from TasksPane,
 * which is visible above the lightbox at z-[100001]. The overlay adjusts its size
 * to account for the pane when it's open or locked.
 *
 * This allows the main MediaLightbox to focus on content orchestration.
 */

import React, { useRef, useEffect } from 'react';
import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';

const DOUBLE_TAP_DELAY = 300; // ms

interface LightboxShellProps {
  children: React.ReactNode;
  onClose: () => void;

  // Edit mode state - prevents accidental closing
  isInpaintMode: boolean;
  isSelectOpen: boolean;
  shouldShowSidePanel: boolean;

  // Responsive state
  isMobile: boolean;
  isTabletOrLarger: boolean;

  // Tasks pane state
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  cancellableTaskCount: number;
  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (locked: boolean) => void;
  setTasksPaneOpenContext: (open: boolean) => void;

  // Layout mode
  needsFullscreenLayout: boolean;
  needsTasksPaneOffset: boolean;

  // Ref for content
  contentRef: React.RefObject<HTMLDivElement>;

  // Accessibility
  accessibilityTitle: string;
  accessibilityDescription: string;
}

/**
 * Helper to check if a higher z-index dialog is open
 */
function hasHigherZIndexDialog(): boolean {
  // Query for our custom compat attribute on dialog overlays/backdrops
  const dialogOverlays = document.querySelectorAll('[data-dialog-backdrop]');
  return Array.from(dialogOverlays).some((overlay) => {
    const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
    return zIndex > 100000;
  });
}

/**
 * Helper to check if target or any ancestor has higher z-index
 */
function targetHasHigherZIndex(target: EventTarget | null): boolean {
  let element = target as HTMLElement | null;
  while (element && element !== document.body) {
    const zIndex = parseInt(window.getComputedStyle(element).zIndex || '0', 10);
    if (zIndex > 100000) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Helper to check if element is interactive (buttons, inputs, etc.)
 */
function isInteractiveElement(target: HTMLElement): boolean {
  return (
    target.tagName === 'BUTTON' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.tagName === 'A' ||
    target.closest('button') !== null ||
    target.closest('a') !== null
  );
}

export const LightboxShell: React.FC<LightboxShellProps> = ({
  children,
  onClose,
  isInpaintMode,
  isSelectOpen,
  shouldShowSidePanel,
  isMobile,
  isTabletOrLarger,
  effectiveTasksPaneOpen,
  effectiveTasksPaneWidth,
  cancellableTaskCount,
  isTasksPaneLocked,
  setIsTasksPaneLocked,
  setTasksPaneOpenContext,
  needsFullscreenLayout,
  needsTasksPaneOffset,
  contentRef,
  accessibilityTitle,
  accessibilityDescription,
}) => {
  // Track where pointer/click started to prevent accidental modal closure on drag
  const pointerDownTargetRef = useRef<EventTarget | null>(null);

  // Track double-tap on mobile/iPad
  const lastTapTimeRef = useRef<number>(0);
  const lastTapTargetRef = useRef<EventTarget | null>(null);
  const touchStartTargetRef = useRef<EventTarget | null>(null);
  const touchStartedOnOverlayRef = useRef<boolean>(false);

  // Lock body scroll when lightbox is open on desktop
  // (On mobile, modal={true} handles this, but on desktop we use modal={false}
  // to allow TasksPane interaction, so we need manual scroll locking)
  useEffect(() => {
    if (isMobile) return; // modal={true} handles mobile

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobile]);

  // ========================================
  // OVERLAY EVENT HANDLERS
  // ========================================

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    pointerDownTargetRef.current = e.target;

    if (hasHigherZIndexDialog() || targetHasHigherZIndex(e.target)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  const handleOverlayPointerUp = (e: React.PointerEvent) => {
    if (hasHigherZIndexDialog() || targetHasHigherZIndex(e.target)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (hasHigherZIndexDialog() || targetHasHigherZIndex(e.target)) {
      return;
    }

    // Prevent closing when in inpaint mode to avoid accidental data loss
    if (isInpaintMode) {
      pointerDownTargetRef.current = null;
      return;
    }

    // Close on single click if both pointer down and click are on the overlay itself
    const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
    const clickEndedOnOverlay = e.target === e.currentTarget;

    if (clickStartedOnOverlay && clickEndedOnOverlay) {
      onClose();
    }

    pointerDownTargetRef.current = null;
  };

  const handleOverlayDoubleClick = (e: React.MouseEvent) => {
    if (hasHigherZIndexDialog() || targetHasHigherZIndex(e.target)) {
      return;
    }

    if (isInpaintMode) {
      return;
    }

    const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
    const clickEndedOnOverlay = e.target === e.currentTarget;

    if (clickStartedOnOverlay && clickEndedOnOverlay) {
      onClose();
    }
  };

  const handleOverlayTouchStart = (e: React.TouchEvent) => {
    touchStartTargetRef.current = e.target;
    const touchedDirectlyOnOverlay = e.target === e.currentTarget;
    touchStartedOnOverlayRef.current = touchedDirectlyOnOverlay;

    const target = e.target as HTMLElement;

    // Allow touch events on canvas when in inpaint mode
    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    // Allow touch events on interactive elements
    if (isInteractiveElement(target)) {
      return;
    }

    if (isMobile) e.stopPropagation();
  };

  const handleOverlayTouchMove = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    if (isInteractiveElement(target)) {
      return;
    }

    if (isMobile) e.stopPropagation();
  };

  const handleOverlayTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    if (isInteractiveElement(target)) {
      return;
    }

    // Detect double-tap to close on mobile/iPad (only on overlay background)
    const touchEndedOnOverlay = e.target === e.currentTarget;
    const validOverlayTap = touchStartedOnOverlayRef.current && touchEndedOnOverlay;

    if (!isInpaintMode && validOverlayTap) {
      const currentTime = Date.now();
      const timeSinceLastTap = currentTime - lastTapTimeRef.current;

      if (timeSinceLastTap < DOUBLE_TAP_DELAY && lastTapTargetRef.current === e.currentTarget) {
        onClose();
        lastTapTimeRef.current = 0;
        lastTapTargetRef.current = null;
      } else {
        lastTapTimeRef.current = currentTime;
        lastTapTargetRef.current = e.currentTarget;
      }
    }

    touchStartTargetRef.current = null;
    touchStartedOnOverlayRef.current = false;

    if (isMobile) e.stopPropagation();
  };

  const handleOverlayTouchCancel = (e: React.TouchEvent) => {
    touchStartTargetRef.current = null;
    touchStartedOnOverlayRef.current = false;

    if (hasHigherZIndexDialog()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  // ========================================
  // CONTENT EVENT HANDLERS
  // ========================================

  const handleContentPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // Don't stop propagation for floating UI content (selects, popovers, menus)
    const isFloatingContent = target.closest('[role="listbox"], [role="menu"], [data-side], [data-popup]') !== null;

    if (isFloatingContent) {
      return;
    }

    e.stopPropagation();
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleContentTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    if (isInteractiveElement(target)) {
      return;
    }

    if (isMobile) e.stopPropagation();
  };

  const handleContentTouchMove = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    if (isInteractiveElement(target)) {
      return;
    }

    if (isMobile) e.stopPropagation();
  };

  const handleContentTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;

    if (isInpaintMode && target.tagName === 'CANVAS') {
      return;
    }

    if (isInteractiveElement(target)) {
      return;
    }

    if (isMobile) e.stopPropagation();
  };

  const handleContentTouchCancel = (e: React.TouchEvent) => {
    if (hasHigherZIndexDialog()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  // Focus the content element on mount (replaces Radix's onOpenAutoFocus)
  useEffect(() => {
    contentRef.current?.focus();
  }, [contentRef]);

  // ========================================
  // OVERLAY STYLES
  // ========================================

  // Check both effectiveTasksPaneOpen AND isTasksPaneLocked to handle edge cases
  // where they might be temporarily out of sync (e.g., during hydration)
  const shouldAccountForTasksPane = (effectiveTasksPaneOpen || isTasksPaneLocked) && isTabletOrLarger;

  const overlayStyle: React.CSSProperties = {
    pointerEvents: 'all',
    touchAction: 'none',
    cursor: 'pointer', // Required for iOS touch events
    zIndex: 10000,
    position: 'fixed',
    top: 0,
    left: 0,
    right: shouldAccountForTasksPane ? `${effectiveTasksPaneWidth}px` : 0,
    bottom: 0,
    height: '100dvh',
    transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    ...(shouldAccountForTasksPane
      ? { width: `calc(100vw - ${effectiveTasksPaneWidth}px)` }
      : {}),
  };

  // ========================================
  // CONTENT STYLES
  // ========================================

  const contentStyle: React.CSSProperties = {
    transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    ...(needsTasksPaneOffset
      ? {
          width: `calc(100vw - ${effectiveTasksPaneWidth}px)`,
          height: '100dvh',
        }
      : needsFullscreenLayout
      ? {
          width: '100vw',
          height: '100dvh',
        }
      : {}),
  };

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root
        open={true}
        modal={isMobile && !isTabletOrLarger}
        onOpenChange={() => {
          // Prevent automatic closing - we handle all closing manually
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-dialog-backdrop
            className={cn(
              "fixed z-[100000] bg-black/80 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0",
              isMobile ? "" : "duration-200 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0",
              "p-0 border-none shadow-none"
            )}
            onPointerDown={handleOverlayPointerDown}
            onPointerUp={handleOverlayPointerUp}
            onClick={handleOverlayClick}
            onDoubleClick={handleOverlayDoubleClick}
            onTouchStart={handleOverlayTouchStart}
            onTouchMove={handleOverlayTouchMove}
            onTouchEnd={handleOverlayTouchEnd}
            onTouchCancel={handleOverlayTouchCancel}
            style={overlayStyle}
          />

          {/* Task pane handle removed - the existing PaneControlTab from TasksPane
              is now visible above the lightbox at z-[100001] and handles all pane controls.
              The overlay correctly accounts for the pane via shouldAccountForTasksPane. */}

          <DialogPrimitive.Popup
            ref={contentRef}
            tabIndex={-1}
            onPointerDown={handleContentPointerDown}
            onClick={handleContentClick}
            onTouchStart={handleContentTouchStart}
            onTouchMove={handleContentTouchMove}
            onTouchEnd={handleContentTouchEnd}
            onTouchCancel={handleContentTouchCancel}
            className={cn(
              "fixed z-[100000]",
              isMobile
                ? ""
                : "duration-200 data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95",
              "p-0 border-none bg-transparent shadow-none",
              needsFullscreenLayout
                ? "inset-0 w-full h-full"
                : "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-auto h-auto data-[ending-style]:slide-out-to-left-1/2 data-[ending-style]:slide-out-to-top-[48%] data-[open]:slide-in-from-left-1/2 data-[open]:slide-in-from-top-[48%]"
            )}
            style={contentStyle}
          >
            {/* Accessibility: Hidden dialog title for screen readers */}
            <DialogPrimitive.Title className="sr-only">
              {accessibilityTitle}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {accessibilityDescription}
            </DialogPrimitive.Description>

            {children}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </TooltipProvider>
  );
};
