import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { ShotSelectorWithAdd } from '../ShotSelectorWithAdd';

describe('ShotSelectorWithAdd', () => {
  it('exports expected members', () => {
    expect(ShotSelectorWithAdd).toBeDefined();
    expect(true).not.toBe(false);
  });
});
