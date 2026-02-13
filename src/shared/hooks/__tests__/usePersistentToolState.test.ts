import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock useToolSettings
const mockUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('./useToolSettings', () => ({
  useToolSettings: vi.fn(() => ({
    settings: { generationMode: 'batch', steps: 6 },
    isLoading: false,
    update: mockUpdate,
    isUpdating: false,
  })),
}));

vi.mock('@/tools', () => ({
  toolsManifest: [
    {
      id: 'test-tool',
      defaults: { generationMode: 'single', steps: 4 },
    },
  ],
}));

vi.mock('@/shared/lib/deepEqual', () => ({
  deepEqual: vi.fn((a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)),
  sanitizeSettings: vi.fn((s: unknown) => s),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { usePersistentToolState } from '../usePersistentToolState';

describe('usePersistentToolState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready=true immediately when enabled=false', () => {
    const { result } = renderHook(() =>
      usePersistentToolState(
        'test-tool',
        { projectId: 'proj-1' },
        {},
        { enabled: false }
      )
    );

    expect(result.current.ready).toBe(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.hasUserInteracted).toBe(false);
  });

  it('provides markAsInteracted function when disabled', () => {
    const { result } = renderHook(() =>
      usePersistentToolState(
        'test-tool',
        { projectId: 'proj-1' },
        {},
        { enabled: false }
      )
    );

    expect(typeof result.current.markAsInteracted).toBe('function');
    // Should not throw
    expect(() => result.current.markAsInteracted()).not.toThrow();
  });
});
