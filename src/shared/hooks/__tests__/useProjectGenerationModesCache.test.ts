import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHookWithProviders } from '@/test/test-utils';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { user: { id: 'user-1' } } } })
      ),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: { settings: {} }, error: null })
              ),
            })),
          })),
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: { settings: {} }, error: null })
              ),
            })),
          })),
        };
      }
      if (table === 'shots') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: [
                  { id: 'shot-1', settings: {} },
                  { id: 'shot-2', settings: {} },
                ],
                error: null,
              })
            ),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    }),
  },
}));

vi.mock('@/shared/hooks/useSmartPolling', () => ({
  useSmartPollingConfig: vi.fn(() => ({})),
}));

vi.mock('@/shared/lib/settingsResolution', () => ({
  resolveGenerationMode: vi.fn(() => 'timeline'),
  extractToolSettings: vi.fn(() => ({})),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: { TRAVEL_BETWEEN_IMAGES: 'travel-between-images' },
}));

import { useProjectGenerationModesCache } from '../useProjectGenerationModesCache';

describe('useProjectGenerationModesCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns expected shape', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache('proj-1')
    );

    expect(typeof result.current.getShotGenerationMode).toBe('function');
    expect(typeof result.current.getAllShotModes).toBe('function');
    expect(typeof result.current.updateShotMode).toBe('function');
    expect(typeof result.current.clearCache).toBe('function');
    expect(typeof result.current.deleteProjectCache).toBe('function');
    expect(typeof result.current.invalidateOnModeChange).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('is disabled when projectId is null', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache(null)
    );

    expect(result.current.isLoading).toBe(false);
  });

  it('is disabled when enabled option is false', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache('proj-1', { enabled: false })
    );

    expect(result.current.isLoading).toBe(false);
  });

  it('getShotGenerationMode returns null for null shotId', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache('proj-1')
    );

    expect(result.current.getShotGenerationMode(null)).toBeNull();
  });

  it('getShotGenerationMode returns batch for mobile', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache('proj-1')
    );

    expect(result.current.getShotGenerationMode('shot-1', true)).toBe('batch');
  });

  it('getAllShotModes returns null for null projectId', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache(null)
    );

    expect(result.current.getAllShotModes()).toBeNull();
  });

  it('deleteProjectCache does nothing for null projectId', () => {
    const { result } = renderHookWithProviders(() =>
      useProjectGenerationModesCache('proj-1')
    );

    // Should not throw
    result.current.deleteProjectCache(null);
  });
});
