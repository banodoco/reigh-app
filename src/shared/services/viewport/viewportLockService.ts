function createLightboxFocusOutHandler() {
  return (event: FocusEvent) => {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;

    setTimeout(() => {
      const visualViewport = window.visualViewport;
      if (visualViewport && visualViewport.offsetTop !== 0) {
        window.scrollBy(0, -1);
        window.scrollBy(0, 1);
      }
    }, 100);
  };
}

export class ViewportLockService {
  lockLightboxViewport(): () => void {
    const savedScrollY = window.scrollY;
    const html = document.documentElement;
    html.classList.add('lightbox-open');

    const handleFocusOut = createLightboxFocusOutHandler();
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusout', handleFocusOut);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      html.classList.remove('lightbox-open');
      window.scrollTo(0, savedScrollY);
    };
  }
}

export function createViewportLockService(): ViewportLockService {
  return new ViewportLockService();
}
