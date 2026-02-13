import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSingle = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: () => mockSingle(),
        })),
      })),
    })),
  },
}));

vi.mock('@/shared/utils/settingsMigration', () => ({
  readShotSettings: vi.fn((raw: unknown) => raw),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: { TRAVEL_BETWEEN_IMAGES: 'travel-between-images' },
}));

import { useShotVideoSettings } from '../useShotVideoSettings';

describe('useShotVideoSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null data when shotId is null', () => {
    const { result } = renderHookWithProviders(() => useShotVideoSettings(null));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches settings when shotId is provided', async () => {
    mockSingle.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': { numFrames: 25, prompt: 'test' },
        },
      },
      error: null,
    });

    const { result } = renderHookWithProviders(() => useShotVideoSettings('shot-1'));

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
  });

  it('returns null on error', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    const { result } = renderHookWithProviders(() => useShotVideoSettings('shot-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeNull();
  });

  it('provides refetch function', () => {
    const { result } = renderHookWithProviders(() => useShotVideoSettings('shot-1'));
    expect(typeof result.current.refetch).toBe('function');
  });
});
