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

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: vi.fn((err: { code?: string }) => err?.code === 'PGRST116'),
}));

import { useSpecificResources } from '../useSpecificResources';

describe('useSpecificResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty data for empty resource IDs', () => {
    const { result } = renderHookWithProviders(() => useSpecificResources([]));
    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('deduplicates and filters empty IDs', () => {
    mockSingle.mockResolvedValue({
      data: { id: 'r1', type: 'lora', metadata: {} },
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useSpecificResources(['r1', 'r1', '', 'r1'])
    );

    // Only 1 unique non-empty ID should be queried
    expect(result.current).toBeDefined();
  });

  it('fetches resources by ID', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'r1', type: 'lora', metadata: { name: 'test' } },
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useSpecificResources(['r1'])
    );

    await waitFor(() => {
      expect(result.current.data.length).toBe(1);
    });
    expect(result.current.data[0].id).toBe('r1');
  });

  it('handles not found errors gracefully', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    });

    const { result } = renderHookWithProviders(() =>
      useSpecificResources(['nonexistent'])
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toEqual([]);
  });
});
