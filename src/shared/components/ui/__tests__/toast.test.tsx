import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { getToastManager, ToastItem, toast, toastVariants } from '../toast';
import { initializeUiToastManager } from '../runtime/toastManager';

describe('toast', () => {
  it('exports expected members', () => {
    initializeUiToastManager();
    expect(getToastManager()).toBeDefined();
    expect(ToastItem).toBeDefined();
    expect(toast).toBeDefined();
    expect(toastVariants).toBeDefined();
  });
});
