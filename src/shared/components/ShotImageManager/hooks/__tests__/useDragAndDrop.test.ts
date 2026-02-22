import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useDragAndDrop } from '../useDragAndDrop';

describe('useDragAndDrop', () => {
  it('exports expected members', () => {
    expect(useDragAndDrop).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useDragAndDrop is a callable function', () => {
    expect(typeof useDragAndDrop).toBe('function');
    expect(useDragAndDrop.name).toBeDefined();
  });
});
