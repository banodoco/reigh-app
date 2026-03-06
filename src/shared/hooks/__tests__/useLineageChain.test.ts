import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
};
const mockResolveVariantProjectScope = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mockSupabaseClient,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/generationTaskRepository', () => ({
  resolveVariantProjectScope: (...args: unknown[]) => mockResolveVariantProjectScope(...args),
}));

vi.mock('@/shared/lib/queryKeys/generations', () => ({
  generationQueryKeys: {
    lineageChain: (id: string) => ['generations', 'lineage', id],
    derived: (id: string) => ['generations', 'derived', id],
  },
}));

import { useLineageChain } from '@/shared/hooks/variants/useLineageChain';

interface VariantStub {
  id: string;
  generation_id: string;
  params: Record<string, unknown>;
  location: string;
  thumbnail_url: string | null;
  created_at: string;
  variant_type: string | null;
}

function primeVariantResponses(variants: VariantStub[]) {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  mockResolveVariantProjectScope.mockImplementation(async (variantId: string) => {
    const variant = byId.get(variantId);
    if (!variant) {
      return {
        variantId,
        generationId: null,
        projectId: null,
        status: 'missing_variant',
      };
    }
    return {
      variantId,
      generationId: variant.generation_id,
      projectId: 'project-1',
      status: 'ok',
    };
  });

  mockSelect.mockImplementation(() => {
    const filters: Record<string, string> = {};
    const chain = {
      eq: vi.fn((field: string, value: string) => {
        filters[field] = value;
        return chain;
      }),
      single: vi.fn().mockImplementation(async () => {
        const variant = byId.get(filters.id) ?? null;
        if (!variant) {
          return { data: null, error: { message: 'Not found' } };
        }
        if (filters.generation_id && variant.generation_id !== filters.generation_id) {
          return { data: null, error: { message: 'Generation mismatch' } };
        }
        return { data: variant, error: null };
      }),
    };
    return chain;
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useLineageChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ select: (...args: unknown[]) => mockSelect(...args) });
  });

  it('returns empty chain and not loading when variantId is null', () => {
    const { result } = renderHook(
      () => useLineageChain(null, null),
      { wrapper: createWrapper() }
    );

    expect(result.current.chain).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasLineage).toBe(false);
  });

  it('returns empty chain and not loading when projectId is null', () => {
    const { result } = renderHook(
      () => useLineageChain('variant-1', null),
      { wrapper: createWrapper() }
    );

    expect(result.current.chain).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasLineage).toBe(false);
  });

  it('fetches single variant (no lineage) correctly', async () => {
    primeVariantResponses([
      {
        id: 'variant-1',
        generation_id: 'gen-1',
        params: {},
        location: 'https://example.com/v1.jpg',
        thumbnail_url: 'https://example.com/v1-thumb.jpg',
        created_at: '2024-01-01T00:00:00Z',
        variant_type: 'inpaint',
      },
    ]);

    const { result } = renderHook(
      () => useLineageChain('variant-1', 'project-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.chain).toHaveLength(1);
    expect(result.current.chain[0].id).toBe('variant-1');
    expect(result.current.hasLineage).toBe(false);
  });

  it('follows source_variant_id chain across generations', async () => {
    primeVariantResponses([
      {
        id: 'variant-3',
        generation_id: 'gen-2',
        params: { source_variant_id: 'variant-2' },
        location: 'https://example.com/v3.jpg',
        thumbnail_url: null,
        created_at: '2024-01-03T00:00:00Z',
        variant_type: 'upscaled',
      },
      {
        id: 'variant-2',
        generation_id: 'gen-1',
        params: { source_variant_id: 'variant-1' },
        location: 'https://example.com/v2.jpg',
        thumbnail_url: null,
        created_at: '2024-01-02T00:00:00Z',
        variant_type: 'outpaint',
      },
      {
        id: 'variant-1',
        generation_id: 'gen-0',
        params: {},
        location: 'https://example.com/v1.jpg',
        thumbnail_url: 'https://example.com/v1-thumb.jpg',
        created_at: '2024-01-01T00:00:00Z',
        variant_type: 'inpaint',
      },
    ]);

    const { result } = renderHook(
      () => useLineageChain('variant-3', 'project-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.chain).toHaveLength(3);
    expect(result.current.chain[0].id).toBe('variant-1');
    expect(result.current.chain[1].id).toBe('variant-2');
    expect(result.current.chain[2].id).toBe('variant-3');
    expect(result.current.hasLineage).toBe(true);
  });

  it('handles errors during fetch', async () => {
    primeVariantResponses([]);

    const { result } = renderHook(
      () => useLineageChain('nonexistent', 'project-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.chain).toEqual([]);
    expect(result.current.hasLineage).toBe(false);
  });

  it('provides loading state while fetching', () => {
    mockResolveVariantProjectScope.mockResolvedValue({
      variantId: 'variant-1',
      generationId: 'gen-1',
      projectId: 'project-1',
      status: 'ok',
    });
    mockSelect.mockImplementation(() => {
      const chain = {
        eq: vi.fn(() => chain),
        single: vi.fn(() => new Promise(() => {})),
      };
      return chain;
    });

    const { result } = renderHook(
      () => useLineageChain('variant-1', 'project-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });
});
