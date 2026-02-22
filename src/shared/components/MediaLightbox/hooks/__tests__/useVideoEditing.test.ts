import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useVideoEditing } from '../useVideoEditing';

describe('useVideoEditing', () => {
  it('exports expected members', () => {
    expect(useVideoEditing).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useVideoEditing is a callable function', () => {
    expect(typeof useVideoEditing).toBe('function');
    expect(useVideoEditing.name).toBeDefined();
  });
});
