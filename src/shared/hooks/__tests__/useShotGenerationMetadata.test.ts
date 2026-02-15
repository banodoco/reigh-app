import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockMaybeSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => mockUpdate()),
      })),
    })),
  },
}));

vi.mock('@/shared/hooks/useGenerationInvalidation', () => ({
  useInvalidateGenerations: vi.fn(() => vi.fn()),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useShotGenerationMetadata } from '../useShotGenerationMetadata';

describe('useShotGenerationMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({
      data: {
        metadata: {
          lastMagicEditPrompt: 'test prompt',
          lastMagicEditNumImages: 4,
          magicEditPrompts: [{ prompt: 'test', timestamp: '2025-01-01' }],
        },
      },
      error: null,
    });
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('loads metadata from database', async () => {
    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.metadata.lastMagicEditPrompt).toBe('test prompt');
  });

  it('returns empty metadata when disabled', async () => {
    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.metadata).toEqual({});
  });

  it('returns empty metadata when shotGenerationId is empty', async () => {
    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: '',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.metadata).toEqual({});
  });

  it('getLastMagicEditPrompt returns the stored prompt', async () => {
    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getLastMagicEditPrompt()).toBe('test prompt');
  });

  it('getMagicEditPrompts returns the prompts array', async () => {
    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getMagicEditPrompts()).toHaveLength(1);
  });

  it('getLastSettings returns default values when no settings stored', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { metadata: {} },
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const settings = result.current.getLastSettings();
    expect(settings.numImages).toBe(4);
    expect(settings.isNextSceneBoostEnabled).toBe(false);
    expect(settings.isInSceneBoostEnabled).toBe(false);
  });

  it('handles database error gracefully', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    });

    const { result } = renderHookWithProviders(() =>
      useShotGenerationMetadata({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.metadata).toEqual({});
  });
});
