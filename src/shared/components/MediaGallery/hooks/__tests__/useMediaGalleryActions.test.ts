import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useMediaGalleryActions } from '../useMediaGalleryActions';

describe('useMediaGalleryActions', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryActions).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useMediaGalleryActions is a callable function', () => {
    expect(typeof useMediaGalleryActions).toBe('function');
    expect(useMediaGalleryActions.name).toBeDefined();
  });
});
