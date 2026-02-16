import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/shared/hooks/useToolSettings', () => ({
  updateToolSettingsSupabase: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: { TRAVEL_BETWEEN_IMAGES: 'travel-between-images' },
}));

vi.mock('@/shared/components/segmentSettingsMigration', () => ({
  buildMetadataUpdate: vi.fn().mockImplementation((current, overrides) => ({
    ...current,
    segmentOverrides: overrides,
  })),
}));

import { useSegmentMutations } from '../useSegmentMutations';

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

describe('useSegmentMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('savePairMetadata', () => {
    it('returns false when pairShotGenerationId is null', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: null, shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.savePairMetadata({
          prompt: 'test',
          negativePrompt: '',
          numFrames: 25,
          randomSeed: true,
          makePrimaryVariant: false,
        } as unknown);
      });

      expect(success!).toBe(false);
    });

    it('fetches current metadata and updates it', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { metadata: { existing: 'data' } },
              error: null,
            }),
          }),
        }),
        update: mockUpdate,
      });

      const { queryClient, wrapper } = createWrapper();
      const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');

      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.savePairMetadata({
          prompt: 'test prompt',
          negativePrompt: 'test neg',
          numFrames: 25,
          randomSeed: true,
          makePrimaryVariant: false,
        } as unknown);
      });

      expect(success!).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('shot_generations');
      expect(refetchSpy).toHaveBeenCalled();
    });

    it('returns false on fetch error', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.savePairMetadata({
          prompt: 'test',
          negativePrompt: '',
          numFrames: 25,
          randomSeed: true,
          makePrimaryVariant: false,
        } as unknown);
      });

      expect(success!).toBe(false);
    });
  });

  describe('saveFieldAsDefault', () => {
    it('returns false when shotId is null', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: null }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.saveFieldAsDefault('prompt', 'test value');
      });

      expect(success!).toBe(false);
    });

    it('saves field as shot default via updateToolSettingsSupabase', async () => {
      const { updateToolSettingsSupabase } = await import('@/shared/hooks/useToolSettings');

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.saveFieldAsDefault('prompt', 'test value');
      });

      expect(success!).toBe(true);
      expect(updateToolSettingsSupabase).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'shot',
          id: 'shot-1',
          patch: { prompt: 'test value' },
        }),
        undefined,
        'immediate'
      );
    });
  });

  describe('clearEnhancedPrompt', () => {
    it('returns false when pairShotGenerationId is null', async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: null, shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.clearEnhancedPrompt();
      });

      expect(success!).toBe(false);
    });

    it('clears enhanced_prompt from metadata', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                metadata: {
                  enhanced_prompt: 'old prompt',
                  enhance_prompt_enabled: true,
                  other: 'preserved',
                },
              },
              error: null,
            }),
          }),
        }),
        update: mockUpdate,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.clearEnhancedPrompt();
      });

      expect(success!).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          enhanced_prompt: '',
          enhance_prompt_enabled: true, // preserved
          other: 'preserved', // preserved
        }),
      });
    });
  });

  describe('saveEnhancePromptEnabled', () => {
    it('saves preference to metadata', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { metadata: { existing: 'data' } },
              error: null,
            }),
          }),
        }),
        update: mockUpdate,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(
        () => useSegmentMutations({ pairShotGenerationId: 'pair-1', shotId: 'shot-1' }),
        { wrapper }
      );

      let success: boolean;
      await act(async () => {
        success = await result.current.saveEnhancePromptEnabled(true);
      });

      expect(success!).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        metadata: expect.objectContaining({
          existing: 'data',
          enhance_prompt_enabled: true,
        }),
      });
    });
  });
});
