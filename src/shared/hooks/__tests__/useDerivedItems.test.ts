import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockGenerationsSelect = vi.fn();
const mockVariantsSelect = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'generations') {
        return {
          select: mockGenerationsSelect.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'gen-1',
                      location: 'https://example.com/img.jpg',
                      thumbnail_url: 'https://example.com/thumb.jpg',
                      type: 'image',
                      created_at: '2024-01-01T00:00:00Z',
                      params: { prompt: 'test prompt' },
                      starred: false,
                      tasks: null,
                      based_on: 'source-gen-id',
                      shot_generations: [{ shot_id: 'shot-1', timeline_frame: null }],
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'generation_variants') {
        return {
          select: mockVariantsSelect.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'variant-1',
                        location: 'https://example.com/variant.jpg',
                        thumbnail_url: null,
                        created_at: '2024-01-02T00:00:00Z',
                        variant_type: 'inpaint',
                        name: 'Inpaint edit',
                        params: {},
                        is_primary: false,
                        viewed_at: null,
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      // For calculateDerivedCounts - generations table for counting
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnThis(),
        }),
      };
    }),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    generations: {
      derived: (id: string) => ['generations', 'derived', id],
      lineageChain: (id: string) => ['generations', 'lineage', id],
    },
  },
}));

vi.mock('@/shared/lib/generationTransformers', () => ({
  calculateDerivedCounts: vi.fn().mockResolvedValue({ derivedCounts: {} }),
}));

vi.mock('../useSmartPolling', () => ({
  useSmartPollingConfig: () => ({ refetchInterval: false }),
}));

vi.mock('@/shared/constants/variantTypes', () => ({
  EDIT_VARIANT_TYPES: ['inpaint', 'outpaint', 'upscale', 'style-transfer'],
}));

import { useDerivedItems } from '../useDerivedItems';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useDerivedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when sourceGenerationId is null', () => {
    const { result } = renderHook(
      () => useDerivedItems(null),
      { wrapper: createWrapper() }
    );

    expect(result.current.data).toBeUndefined();
    // Query is disabled, so no fetch occurs
  });

  it('does not fetch when enabled is false', () => {
    const { result } = renderHook(
      () => useDerivedItems('gen-id', false),
      { wrapper: createWrapper() }
    );

    expect(result.current.data).toBeUndefined();
  });

  it('fetches derived items when given a valid generation ID', async () => {
    const { result } = renderHook(
      () => useDerivedItems('source-gen-id'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data!.length).toBeGreaterThan(0);
  });

  it('provides loading state', () => {
    const { result } = renderHook(
      () => useDerivedItems('source-gen-id'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });
});
