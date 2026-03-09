interface ScrollToGalleryTopOptions {
  galleryTop: HTMLElement;
  isMobile: boolean;
}

/**
 * Keep DOM-specific scroll behavior out of pagination state hooks.
 */
export function scrollToGalleryTop(options: ScrollToGalleryTopOptions): void {
  const rect = options.galleryTop.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const targetPosition = rect.top + scrollTop - (options.isMobile ? 80 : 20);

  window.scrollTo({
    top: Math.max(0, targetPosition),
    behavior: 'smooth',
  });
}
