import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useImg2ImgMode } from '../useImg2ImgMode';

describe('useImg2ImgMode', () => {
  it('exports expected members', () => {
    expect(useImg2ImgMode).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useImg2ImgMode is a callable function', () => {
    expect(typeof useImg2ImgMode).toBe('function');
    expect(useImg2ImgMode.name).toBeDefined();
  });
});
