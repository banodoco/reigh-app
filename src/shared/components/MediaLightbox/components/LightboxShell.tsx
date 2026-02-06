/**
 * LightboxShell - Dialog/Overlay container for MediaLightbox
 *
 * Encapsulates all the complex event handling for the lightbox modal:
 * - Dialog root/portal/overlay
 * - Pointer/touch/click event handling with z-index awareness
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

interface LightboxShellProps {
  children: React.ReactNode;
  onClose: () => void;

  // Edit mode
  /** Canvas/brush edit overlay is active (inpaint, annotate, reposition, text).
   *  Used to allow canvas touch events to pass through. */
  hasCanvasOverlay: boolean;
  /** Reposition (move) mode — the only edit mode that blocks background click-to-close
   *  (because dragging could cause accidental closes). */
  isRepositionMode: boolean;

  // Responsive
  isMobile: boolean;
  isTabletOrLarger: boolean;

  // Tasks pane (for overlay/content sizing)
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  isTasksPaneLocked: boolean;

  // Layout
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

/**
 * Check if a touch event should pass through to the element
 * (canvas in edit mode, or interactive elements like buttons/inputs).
 */
function shouldAllowTouchThrough(target: HTMLElement, hasCanvasOverlay: boolean): boolean {
  if (hasCanvasOverlay && target.tagName === 'CANVAS') return true;
  if (isInteractiveElement(target)) return true;
  return false;
}

export const LightboxShell: React.FC<LightboxShellProps> = ({
  children,
  onClose,
  hasCanvasOverlay,
  isRepositionMode,
  isMobile,
  isTabletOrLarger,
  effectiveTasksPaneOpen,
  effectiveTasksPaneWidth,
  isTasksPaneLocked,
  needsFullscreenLayout,
  needsTasksPaneOffset,
  contentRef,
  accessibilityTitle,
  accessibilityDescription,
}) => {
  // Track where pointer/click started to prevent accidental modal closure on drag
  const pointerDownTargetRef = useRef<EventTarget | null>(null);

  // Track pointerdown target for capture-phase background click detection
  const bgPointerDownTargetRef = useRef<EventTarget | null>(null);

  // Lock body scroll when lightbox is open.
  // On phones, modal={true} handles scroll locking. On desktop and iPad,
  // modal={false} (to allow TasksPane interaction), so we lock manually.
  // We use position:fixed on body + scroll-position save/restore so that:
  //   1. iOS Safari can't touch-scroll the body (overflow:hidden alone doesn't work)
  //   2. The body scroll state is always clean between lightbox open/close cycles
  const isActuallyModal = isMobile && !isTabletOrLarger;
  useEffect(() => {
    if (isActuallyModal) return; // modal={true} handles scroll locking

    const scrollY = window.scrollY;
    const body = document.body;
    const saved = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      width: body.style.width,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    body.style.width = '100%';

    return () => {
      body.style.position = saved.position;
      body.style.top = saved.top;
      body.style.left = saved.left;
      body.style.right = saved.right;
      body.style.overflow = saved.overflow;
      body.style.width = saved.width;
      window.scrollTo(0, scrollY);
    };
  }, [isActuallyModal]);

  // ========================================
  // OVERLAY EVENT HANDLERS (Backdrop layer)
  // ========================================
  // Active when needsFullscreenLayout=false (non-fullscreen video layouts).
  // In fullscreen layouts the Popup covers the Backdrop, so these don't fire —
  // close-on-click is handled by the capture-phase handlers below instead.

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

    // Close logic lives here (not in onClick) because preventDefault() on
    // pointerdown suppresses compatibility mouse events including click.
    // Pointer events still fire, so we detect a "click" as pointerdown +
    // pointerup on the same overlay element.
    if (!isRepositionMode) {
      const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
      const clickEndedOnOverlay = e.target === e.currentTarget;

      if (clickStartedOnOverlay && clickEndedOnOverlay) {
        onClose();
      }
    }

    pointerDownTargetRef.current = null;

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

    // Primary close logic is in handleOverlayPointerUp (see comment there).
    // This handler is a fallback for any edge cases where click still fires.
    if (isRepositionMode) {
      pointerDownTargetRef.current = null;
      return;
    }

    const clickStartedOnOverlay = pointerDownTargetRef.current === e.currentTarget;
    const clickEndedOnOverlay = e.target === e.currentTarget;

    if (clickStartedOnOverlay && clickEndedOnOverlay) {
      onClose();
    }

    pointerDownTargetRef.current = null;
  };

  // ========================================
  // STANDARDIZED BACKGROUND CLICK-TO-CLOSE
  // ========================================
  // Uses capture phase on the Popup so it fires before any child handler.
  // Layouts mark their background elements with data-lightbox-bg.
  // This is the ONE place that handles click-to-close for all layouts.

  const handleBgPointerDownCapture = (e: React.PointerEvent) => {
    bgPointerDownTargetRef.current = e.target;
  };

  const handleBgClickCapture = (e: React.MouseEvent) => {
    const downTarget = bgPointerDownTargetRef.current as HTMLElement | null;
    const upTarget = e.target as HTMLElement;
    bgPointerDownTargetRef.current = null;

    if (hasHigherZIndexDialog() || targetHasHigherZIndex(upTarget)) return;
    // Only reposition mode blocks background close (dragging could cause accidental closes).
    // All other edit modes (inpaint, annotate, magic edit, etc.) allow background close.
    if (isRepositionMode) return;

    // Both pointerdown and click must land directly on a background element
    // (not on a child of one — the target itself must have the attribute)
    if (
      downTarget?.hasAttribute?.('data-lightbox-bg') &&
      upTarget.hasAttribute?.('data-lightbox-bg')
    ) {
      e.stopPropagation();
      onClose();
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

  // ========================================
  // SHARED TOUCH HANDLERS (Backdrop + Popup)
  // ========================================
  // Used on both layers. Allow canvas/interactive element touches through;
  // otherwise stop propagation on mobile to prevent Base UI interference.

  const handleTouchEvent = (e: React.TouchEvent) => {
    if (shouldAllowTouchThrough(e.target as HTMLElement, hasCanvasOverlay)) return;
    if (isMobile) e.stopPropagation();
  };

  const handleTouchCancel = (e: React.TouchEvent) => {
    if (hasHigherZIndexDialog()) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
      e.nativeEvent.stopImmediatePropagation();
    }
  };

  // Focus the content element on mount
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
    // Use inset (top/bottom: 0) for height instead of 100dvh.
    // 100dvh changes dynamically on iOS Safari as the address bar shows/hides,
    // causing the lightbox to resize and leave gaps.
    transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    ...(shouldAccountForTasksPane
      ? { width: `calc(100vw - ${effectiveTasksPaneWidth}px)` }
      : {}),
  };

  // ========================================
  // CONTENT STYLES
  // ========================================

  // For fullscreen layouts the Popup already has `inset-0 h-full` which fills
  // the fixed-position containing block (the viewport) — no explicit height needed.
  // Avoid 100dvh: it changes dynamically on iOS Safari as the address bar
  // shows/hides, causing the lightbox to resize and leave gaps at the bottom.
  const contentStyle: React.CSSProperties = {
    transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
    ...(needsTasksPaneOffset
      ? { width: `calc(100vw - ${effectiveTasksPaneWidth}px)` }
      : needsFullscreenLayout
      ? { width: '100vw' }
      : {}),
  };

  return (
    <TooltipProvider delayDuration={500}>
      <DialogPrimitive.Root
        open={true}
        modal={isActuallyModal}
        disablePointerDismissal
        onOpenChange={(_open, eventDetails) => {
          // Prevent Base UI from updating internal state (which corrupts controlled open={true})
          // and from calling stopPropagation on the native event (which blocks our custom handlers).
          // Our own handlers in useLightboxNavigation (Escape) and handleOverlayClick (outside press)
          // manage all closing logic.
          eventDetails.cancel();
          eventDetails.allowPropagation();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop
            data-dialog-backdrop
            className={cn(
              "fixed z-[100000] bg-black/80 p-0 border-none shadow-none",
              "data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0",
              !isMobile && "duration-200"
            )}
            onPointerDown={handleOverlayPointerDown}
            onPointerUp={handleOverlayPointerUp}
            onClick={handleOverlayClick}
            onTouchStart={handleTouchEvent}
            onTouchMove={handleTouchEvent}
            onTouchEnd={handleTouchEvent}
            onTouchCancel={handleTouchCancel}
            style={overlayStyle}
          />

          {/* Task pane handle removed - the existing PaneControlTab from TasksPane
              is now visible above the lightbox at z-[100001] and handles all pane controls.
              The overlay correctly accounts for the pane via shouldAccountForTasksPane. */}

          <DialogPrimitive.Popup
            ref={contentRef}
            tabIndex={-1}
            onPointerDownCapture={handleBgPointerDownCapture}
            onClickCapture={handleBgClickCapture}
            onPointerDown={handleContentPointerDown}
            onClick={handleContentClick}
            onTouchStart={handleTouchEvent}
            onTouchMove={handleTouchEvent}
            onTouchEnd={handleTouchEvent}
            onTouchCancel={handleTouchCancel}
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
