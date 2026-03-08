import { describe, expect, it, vi } from 'vitest';
import { scrollToGalleryTop } from './scrollToGalleryTop';

describe('scrollToGalleryTop', () => {
  it('scrolls to computed desktop target offset', () => {
    const galleryTop = {
      getBoundingClientRect: () => ({ top: 300 }),
    } as unknown as HTMLElement;
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'pageYOffset', { value: 120, configurable: true });

    scrollToGalleryTop({ galleryTop, isMobile: false });

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 400,
      behavior: 'smooth',
    });
    scrollToSpy.mockRestore();
  });

  it('uses mobile offset and clamps negative positions to zero', () => {
    const galleryTop = {
      getBoundingClientRect: () => ({ top: -50 }),
    } as unknown as HTMLElement;
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'pageYOffset', { value: 0, configurable: true });

    scrollToGalleryTop({ galleryTop, isMobile: true });

    expect(scrollToSpy).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
    scrollToSpy.mockRestore();
  });
});
