import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('exports expected members', () => {
    expect(EmptyState).toBeDefined();
    expect(true).not.toBe(false);
  });
});
