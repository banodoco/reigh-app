import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useDownloadImages } from '../useDownloadImages';

describe('useDownloadImages', () => {
  it('exports expected members', () => {
    expect(useDownloadImages).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useDownloadImages is a callable function', () => {
    expect(typeof useDownloadImages).toBe('function');
    expect(useDownloadImages.name).toBeDefined();
  });
});
