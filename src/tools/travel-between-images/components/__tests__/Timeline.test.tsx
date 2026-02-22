import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import Timeline from '../Timeline';

describe('Timeline', () => {
  it('exports a component', () => {
    expect(Timeline).toBeDefined();
    expect(typeof Timeline === 'function' || typeof Timeline === 'object').toBe(true);
  });
});
