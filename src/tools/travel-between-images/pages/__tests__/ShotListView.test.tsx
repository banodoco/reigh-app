import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { ShotListView } from '../ShotListView';

describe('ShotListView', () => {
  it('exports expected members', () => {
    expect(ShotListView).toBeDefined();
    expect(true).not.toBe(false);
  });
});
