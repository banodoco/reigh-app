import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStandaloneDisplayMode } from './displayMode';

const originalMatchMedia = window.matchMedia;
const originalStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');

describe('isStandaloneDisplayMode', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'standalone', {
      value: false,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalStandalone) {
      Object.defineProperty(navigator, 'standalone', originalStandalone);
    }
  });

  it('returns true when standalone display-mode media query matches', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it('returns true when fullscreen display-mode media query matches', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: fullscreen)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it('returns true when iOS navigator standalone flag is set', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true,
      writable: true,
    });

    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it('returns false when no standalone signals are present', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isStandaloneDisplayMode()).toBe(false);
  });
});
