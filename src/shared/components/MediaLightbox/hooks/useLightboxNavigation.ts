import { useEffect, useCallback } from 'react';

export interface UseLightboxNavigationProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onClose: () => void;
}

export interface UseLightboxNavigationReturn {
  safeClose: () => void;
  activateClickShield: () => void;
}

/**
 * Hook for managing lightbox navigation
 * Handles keyboard controls (arrow keys, escape) and safe closing with click shield
 */
export const useLightboxNavigation = ({
  onNext,
  onPrevious,
  onClose,
}: UseLightboxNavigationProps): UseLightboxNavigationReturn => {
  
  // Short-lived global click shield to absorb iOS synthetic clicks after touchend
  const activateClickShield = useCallback(() => {
    try {
      const shield = document.createElement('div');
      shield.setAttribute('data-mobile-click-shield', 'true');
      shield.style.position = 'fixed';
      shield.style.top = '0';
      shield.style.left = '0';
      shield.style.right = '0';
      shield.style.bottom = '0';
      shield.style.background = 'transparent';
      shield.style.pointerEvents = 'all';
      shield.style.zIndex = '2147483647';
      shield.style.touchAction = 'none';

      const block = (ev: Event) => {
        try { ev.preventDefault(); } catch {}
        try { ev.stopPropagation(); } catch {}
        try { ev.stopImmediatePropagation?.(); } catch {}
      };

      shield.addEventListener('click', block, true);
      shield.addEventListener('pointerdown', block, true);
      shield.addEventListener('pointerup', block, true);
      shield.addEventListener('touchstart', block, { capture: true, passive: false } as AddEventListenerOptions);
      shield.addEventListener('touchend', block, { capture: true, passive: false } as AddEventListenerOptions);

      document.body.appendChild(shield);

      window.setTimeout(() => {
        try { shield.remove(); } catch {}
      }, 350);
    } catch {}
  }, []);

  const safeClose = useCallback(() => {
    activateClickShield();
    onClose();
  }, [activateClickShield, onClose]);

  /**
   * Global key handler
   * --------------------------------------------------
   * We register a document-level keydown listener so that
   * arrow navigation still works even when an embedded
   * <video> element (which is focusable) steals keyboard
   * focus.
   * 
   * IMPORTANT: Don't handle keys if another dialog is open on top
   */
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Escape') {
        const activeEl = document.activeElement;
        console.log('[LightboxNav] keydown:', e.key, {
          activeElement: activeEl?.tagName,
          activeElementType: (activeEl as HTMLInputElement)?.type,
          activeElementClass: (activeEl as HTMLElement)?.className?.slice(0, 80),
          onNext: !!onNext,
          onPrevious: !!onPrevious,
          defaultPrevented: e.defaultPrevented,
        });
      }

      // Check if another dialog/modal is open on top by looking for higher z-index dialog overlays
      const dialogOverlays = document.querySelectorAll('[data-dialog-backdrop]');
      const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
        const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
        // MediaLightbox uses z-[100000], check if any higher z-index dialogs are open
        return zIndex > 100000;
      });

      // Don't handle keys if a higher z-index dialog is open
      if (hasHigherZIndexDialog) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          console.log('[LightboxNav] BLOCKED by higher z-index dialog');
        }
        return;
      }

      if (e.key === 'ArrowLeft' && onPrevious) {
        console.log('[LightboxNav] → navigating previous');
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && onNext) {
        console.log('[LightboxNav] → navigating next');
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    // Capture-phase listener to detect if events are being swallowed
    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        console.log('[LightboxNav] CAPTURE phase:', e.key, 'defaultPrevented:', e.defaultPrevented);
      }
    };

    console.log('[LightboxNav] MOUNT — registering keydown listeners', {
      hasOnNext: !!onNext,
      hasOnPrevious: !!onPrevious,
    });

    document.addEventListener('keydown', handleCaptureKeyDown, true);
    document.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      console.log('[LightboxNav] UNMOUNT — removing keydown listeners');
      document.removeEventListener('keydown', handleCaptureKeyDown, true);
      document.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [onNext, onPrevious, onClose]);

  return {
    safeClose,
    activateClickShield,
  };
};

