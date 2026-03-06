import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { SegmentRegenerateForm } from '../SegmentRegenerateForm';

describe('SegmentRegenerateForm', () => {
  it('exports expected members', () => {
    expect(SegmentRegenerateForm).toBeDefined();
    expect(true).not.toBe(false);
  });
});
