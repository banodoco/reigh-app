import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { toastManager, ToastItem, toast, toastVariants } from '../toast';

describe('toast', () => {
  it('exports expected members', () => {
    expect(toastManager).toBeDefined();
    expect(ToastItem).toBeDefined();
    expect(toast).toBeDefined();
    expect(toastVariants).toBeDefined();
  });
});
