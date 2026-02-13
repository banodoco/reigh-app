import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { GenerationRow } from '@/types/shots';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'sg-new' }, error: null }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

// Mock useShotImages — use vi.hoisted to avoid hoisting issues
const { mockUseShotImages, mockGenerations } = vi.hoisted(() => {
  const gens = [
    {
      id: 'sg-1', generation_id: 'gen-1', shotImageEntryId: 'sg-1', shot_generation_id: 'sg-1',
      location: 'https://example.com/img1.png', imageUrl: 'https://example.com/img1.png',
      thumbUrl: 'https://example.com/thumb1.png', type: 'image', timeline_frame: 0,
      created_at: '2025-01-01T00:00:00Z', starred: false, params: {}, metadata: {},
    },
    {
      id: 'sg-2', generation_id: 'gen-2', shotImageEntryId: 'sg-2', shot_generation_id: 'sg-2',
      location: 'https://example.com/img2.png', imageUrl: 'https://example.com/img2.png',
      thumbUrl: 'https://example.com/thumb2.png', type: 'image', timeline_frame: 50,
      created_at: '2025-01-01T00:00:00Z', starred: false, params: {}, metadata: {},
    },
    {
      id: 'sg-3', generation_id: 'gen-3', shotImageEntryId: 'sg-3', shot_generation_id: 'sg-3',
      location: 'https://example.com/vid.mp4', imageUrl: 'https://example.com/vid.mp4',
      thumbUrl: 'https://example.com/vid-thumb.png', type: 'video', timeline_frame: 25,
      created_at: '2025-01-01T00:00:00Z', starred: false, params: {}, metadata: {},
    },
    {
      id: 'sg-4', generation_id: 'gen-4', shotImageEntryId: 'sg-4', shot_generation_id: 'sg-4',
      location: 'https://example.com/img3.png', imageUrl: 'https://example.com/img3.png',
      thumbUrl: 'https://example.com/thumb3.png', type: 'image', timeline_frame: null,
      created_at: '2025-01-01T00:00:00Z', starred: false, params: {}, metadata: {},
    },
  ];

  const mockFn = {
    __isMockFn: true,
    calls: [] as unknown[][],
    mockReturnValue(val: unknown) {
      this._returnValue = val;
      return this;
    },
    _returnValue: { data: gens, isLoading: false, error: null, refetch: () => {} },
  };

  return { mockUseShotImages: mockFn, mockGenerations: gens };
});

const useShotImagesMock = vi.fn().mockReturnValue({
  data: mockGenerations,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});

vi.mock('@/shared/hooks/useShotImages', () => ({
  useShotImages: (...args: unknown[]) => useShotImagesMock(...args),
}));

vi.mock('@/shared/hooks/useGenerationInvalidation', () => ({
  useInvalidateGenerations: () => vi.fn(),
}));

vi.mock('@/shared/lib/typeGuards', () => ({
  isVideoGeneration: (g: { type?: string }) => g.type === 'video' || g.type?.includes('video'),
}));

vi.mock('@/shared/utils/settingsMigration', () => ({
  readSegmentOverrides: vi.fn().mockReturnValue({}),
  writeSegmentOverrides: vi.fn().mockImplementation((current, overrides) => ({
    ...current,
    segmentOverrides: overrides,
  })),
}));

vi.mock('@/shared/utils/timelinePositionCalculator', () => ({
  calculateNextAvailableFrame: vi.fn().mockReturnValue(100),
  extractExistingFrames: vi.fn().mockReturnValue([0, 50]),
  DEFAULT_FRAME_SPACING: 50,
}));

import { useTimelineCore } from '../useTimelineCore';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

const mockReadSegmentOverrides = readSegmentOverrides as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useTimelineCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data derivation', () => {
    it('returns all generations', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      expect(result.current.generations).toHaveLength(4);
    });

    it('filters positionedItems: non-video, valid location, valid frame', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      // sg-1 (image, frame 0), sg-2 (image, frame 50) should be positioned
      // sg-3 (video) and sg-4 (null frame) should NOT be positioned
      expect(result.current.positionedItems).toHaveLength(2);
      expect(result.current.positionedItems[0].id).toBe('sg-1');
      expect(result.current.positionedItems[1].id).toBe('sg-2');
    });

    it('sorts positionedItems by timeline_frame ascending', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      const frames = result.current.positionedItems.map(i => i.timeline_frame);
      expect(frames).toEqual([0, 50]);
    });

    it('filters unpositionedItems: non-video, valid location, null frame', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      // sg-4 (image, null frame) should be unpositioned
      expect(result.current.unpositionedItems).toHaveLength(1);
      expect(result.current.unpositionedItems[0].id).toBe('sg-4');
    });

    it('excludes videos from both positioned and unpositioned', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      const positionedIds = result.current.positionedItems.map(i => i.id);
      const unpositionedIds = result.current.unpositionedItems.map(i => i.id);

      // sg-3 is a video - should not appear in either list
      expect(positionedIds).not.toContain('sg-3');
      expect(unpositionedIds).not.toContain('sg-3');
    });
  });

  describe('pairPrompts', () => {
    it('returns empty object when no positioned items', () => {
      useShotImagesMock.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      expect(result.current.pairPrompts).toEqual({});
    });

    it('builds pairPrompts from positioned items metadata', () => {
      mockReadSegmentOverrides.mockReturnValue({
        prompt: 'pair prompt',
        negativePrompt: 'pair neg',
      });

      // Reset useShotImages to use mock generations
      useShotImagesMock.mockReturnValue({
        data: mockGenerations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      // With 2 positioned items (sg-1, sg-2), there should be 1 pair (index 0)
      expect(result.current.pairPrompts[0]).toEqual({
        prompt: 'pair prompt',
        negativePrompt: 'pair neg',
      });
    });
  });

  describe('null shotId', () => {
    it('handles null shotId gracefully', () => {
      useShotImagesMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore(null), { wrapper });

      expect(result.current.generations).toBeUndefined();
      expect(result.current.positionedItems).toEqual([]);
      expect(result.current.unpositionedItems).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('getSegmentOverrides', () => {
    it('returns empty object for invalid pair index', () => {
      useShotImagesMock.mockReturnValue({
        data: mockGenerations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      // pair index 5 is beyond positioned items
      const overrides = result.current.getSegmentOverrides(5);
      expect(overrides).toEqual({});
    });
  });

  describe('getEnhancedPrompt', () => {
    it('returns undefined when item not found', () => {
      useShotImagesMock.mockReturnValue({
        data: mockGenerations,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      expect(result.current.getEnhancedPrompt('nonexistent')).toBeUndefined();
    });
  });

  describe('loading state', () => {
    it('propagates loading state from useShotImages', () => {
      useShotImagesMock.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it('propagates error from useShotImages', () => {
      const mockError = new Error('Fetch failed');
      useShotImagesMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: mockError,
        refetch: vi.fn(),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTimelineCore('shot-1'), { wrapper });

      expect(result.current.error).toBe(mockError);
    });
  });
});
