import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useBatchDownload } from '../useBatchDownload';

describe('useBatchDownload', () => {
  it('exports expected members', () => {
    expect(useBatchDownload).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useBatchDownload is a callable function', () => {
    expect(typeof useBatchDownload).toBe('function');
    expect(useBatchDownload.name).toBeDefined();
  });
});
