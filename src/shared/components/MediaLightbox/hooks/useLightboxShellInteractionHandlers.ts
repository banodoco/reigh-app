import { useRef } from 'react';
import {
  isFloatingOverlayElement,
  shouldAllowTouchThrough,
} from '@/shared/lib/interactions/elementPolicy';

interface UseLightboxShellInteractionHandlersArgs {
  hasCanvasOverlay: boolean;
  isRepositionMode: boolean;
  isMobile: boolean;
  onClose: () => void;
}

function hasHigherZIndexDialog(): boolean {
  const dialogOverlays = document.querySelectorAll('[data-dialog-backdrop]');
  return Array.from(dialogOverlays).some((overlay) => {
    const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
    return zIndex > 100000;
  });
}

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

export function useLightboxShellInteractionHandlers({
  hasCanvasOverlay,
  isRepositionMode,
  isMobile,
  onClose,
}: UseLightboxShellInteractionHandlersArgs) {
  const pointerDownTargetRef = useRef<EventTarget | null>(null);
  const bgPointerDownTargetRef = useRef<EventTarget | null>(null);

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

  const handleBgPointerDownCapture = (e: React.PointerEvent) => {
    bgPointerDownTargetRef.current = e.target;
  };

  const handleBgClickCapture = (e: React.MouseEvent) => {
    const downTarget = bgPointerDownTargetRef.current as HTMLElement | null;
    const upTarget = e.target as HTMLElement;
    bgPointerDownTargetRef.current = null;

    if (hasHigherZIndexDialog() || targetHasHigherZIndex(upTarget)) return;
    if (isRepositionMode) return;

    if (
      downTarget?.hasAttribute?.('data-lightbox-bg') &&
      upTarget.hasAttribute?.('data-lightbox-bg')
    ) {
      e.stopPropagation();
      onClose();
    }
  };

  const handleContentPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    if (isFloatingOverlayElement(target)) {
      return;
    }
    e.stopPropagation();
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleTouchEvent = (e: React.TouchEvent) => {
    if (shouldAllowTouchThrough(e.target as HTMLElement, { hasCanvasOverlay })) return;
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

  return {
    handleOverlayPointerDown,
    handleOverlayPointerUp,
    handleOverlayClick,
    handleBgPointerDownCapture,
    handleBgClickCapture,
    handleContentPointerDown,
    handleContentClick,
    handleTouchEvent,
    handleTouchCancel,
  };
}
