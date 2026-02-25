import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock useAutoSaveSettings (adapter boundary used by usePersistentToolState)
vi.mock('../settings/useAutoSaveSettings', () => ({
  useAutoSaveSettings: vi.fn(() => ({
    settings: { generationMode: 'batch', steps: 6 },
    status: 'ready',
    entityId: 'proj-1',
    isDirty: false,
    error: null,
    hasShotSettings: true,
    hasPersistedData: true,
    updateField: vi.fn(),
    updateFields: vi.fn(),
    save: vi.fn(),
    saveImmediate: vi.fn(),
    revert: vi.fn(),
    reset: vi.fn(),
    initializeFrom: vi.fn(),
  })),
}));

vi.mock('@/tooling/toolDefaultsRegistry', () => ({
  toolDefaultsRegistry: {
    'test-tool': { generationMode: 'single', steps: 4 },
  },
}));

vi.mock('@/shared/lib/utils/deepEqual', () => ({
  deepEqual: vi.fn((a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)),
  sanitizeSettings: vi.fn((s: unknown) => s),
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
