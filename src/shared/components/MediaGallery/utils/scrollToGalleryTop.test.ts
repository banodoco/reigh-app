import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrollToGalleryTop } from './scrollToGalleryTop';

describe('scrollToGalleryTop', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    Object.defineProperty(window, 'pageYOffset', {
      value: 200,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 150,
      writable: true,
      configurable: true,
    });
  });

  it('scrolls to gallery top with mobile offset', () => {
    const galleryTop = document.createElement('div');
    vi.spyOn(galleryTop, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    scrollToGalleryTop({ galleryTop, isMobile: true });

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 240,
      behavior: 'smooth',
    });
  });

  it('clamps to zero when computed top would be negative', () => {
    const galleryTop = document.createElement('div');
    vi.spyOn(galleryTop, 'getBoundingClientRect').mockReturnValue({
      top: -400,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    scrollToGalleryTop({ galleryTop, isMobile: false });

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    });
  });
});
