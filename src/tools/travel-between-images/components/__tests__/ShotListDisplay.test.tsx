import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import ShotListDisplay from '../ShotListDisplay';

describe('ShotListDisplay', () => {
  it('exports expected members', () => {
    expect(ShotListDisplay).toBeDefined();
    expect(typeof ShotListDisplay).toBe('function');
  });
});
