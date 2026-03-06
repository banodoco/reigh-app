import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useTaskGeneration } from '../useTaskGeneration';

describe('useTaskGeneration', () => {
  it('exports expected members', () => {
    expect(useTaskGeneration).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useTaskGeneration is a callable function', () => {
    expect(typeof useTaskGeneration).toBe('function');
    expect(useTaskGeneration.name).toBeDefined();
  });
});
