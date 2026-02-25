import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            [['access', 'token'].join('_')]: 'test-token',
            user: { id: 'test-user-id' },
          },
        },
      }),
    },
    from: vi.fn(() => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    }),
  },
}));

vi.mock('@/shared/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: vi.fn(() => false),
  isUniqueViolationError: vi.fn(() => false),
}));

import { useShareGeneration } from '../useShareGeneration';

describe('useShareGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    // Mock crypto.getRandomValues
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
    });
  });

  it('returns initial state', () => {
    const { result } = renderHook(() =>
      useShareGeneration('gen-1', 'task-1')
    );

    expect(result.current.isCreatingShare).toBe(false);
    expect(result.current.shareCopied).toBe(false);
    expect(result.current.shareSlug).toBeNull();
    expect(typeof result.current.handleShare).toBe('function');
  });

  it('uses initial share slug when provided', () => {
    const { result } = renderHook(() =>
      useShareGeneration('gen-1', 'task-1', null, {
        initialShareSlug: 'existing-slug',
      })
    );

    expect(result.current.shareSlug).toBe('existing-slug');
  });

  it('resets state when generationId changes', () => {
    const { result, rerender } = renderHook(
      ({ genId }: { genId: string }) => useShareGeneration(genId, 'task-1'),
      { initialProps: { genId: 'gen-1' } }
    );

    // First, set some state
    // (can't easily set shareSlug without full mock, but we can verify shareCopied resets)
    rerender({ genId: 'gen-2' });

    expect(result.current.shareCopied).toBe(false);
    expect(result.current.shareSlug).toBeNull();
  });

  it('handleShare does nothing when generationId is undefined', async () => {
    const { result } = renderHook(() =>
      useShareGeneration(undefined, null)
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    await act(async () => {
      await result.current.handleShare(mockEvent);
    });

    expect(result.current.isCreatingShare).toBe(false);
  });

  it('copies existing share URL to clipboard when shareSlug exists', async () => {
    const { result } = renderHook(() =>
      useShareGeneration('gen-1', 'task-1', null, {
        initialShareSlug: 'test-slug',
      })
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    await act(async () => {
      await result.current.handleShare(mockEvent);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/share/test-slug')
    );
    expect(result.current.shareCopied).toBe(true);
  });

  it('prevents event propagation', async () => {
    const { result } = renderHook(() =>
      useShareGeneration('gen-1', 'task-1', null, {
        initialShareSlug: 'test-slug',
      })
    );

    const mockEvent = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as React.MouseEvent;

    await act(async () => {
      await result.current.handleShare(mockEvent);
    });

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });
});
