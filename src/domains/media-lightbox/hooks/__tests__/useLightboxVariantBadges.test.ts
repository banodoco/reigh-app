import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { useLightboxVariantBadges } from '../useLightboxVariantBadges';

const usePendingGenerationTasksMock = vi.fn();
const useVariantBadgesMock = vi.fn();
const markAllViewed = vi.fn();
const getBadgeData = vi.fn();

vi.mock('@/shared/hooks/tasks/usePendingGenerationTasks', () => ({
  usePendingGenerationTasks: (...args: unknown[]) => usePendingGenerationTasksMock(...args),
}));

vi.mock('@/shared/hooks/variants/useVariantBadges', () => ({
  useVariantBadges: (...args: unknown[]) => useVariantBadgesMock(...args),
}));

vi.mock('@/shared/hooks/variants/useMarkVariantViewed', () => ({
  useMarkVariantViewed: () => ({ markAllViewed }),
}));

const baseVariants: GenerationVariant[] = [
  {
    id: 'v-1',
    generation_id: 'gen-1',
    location: 'https://example.com/1.png',
    thumbnail_url: null,
    params: null,
    is_primary: true,
    starred: false,
    variant_type: 'original',
    name: null,
    created_at: '2026-01-01T00:00:00Z',
    viewed_at: null,
  },
  {
    id: 'v-2',
    generation_id: 'gen-1',
    location: 'https://example.com/2.png',
    thumbnail_url: null,
    params: null,
    is_primary: false,
    starred: false,
    variant_type: 'original',
    name: null,
    created_at: '2026-01-01T00:01:00Z',
    viewed_at: '2026-01-01T00:02:00Z',
  },
];

describe('useLightboxVariantBadges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePendingGenerationTasksMock.mockReturnValue({ pendingCount: 3 });
    getBadgeData.mockReturnValue({ derivedCount: 2, hasUnviewedVariants: true, unviewedVariantCount: 4 });
    useVariantBadgesMock.mockReturnValue({ getBadgeData, isLoading: false });
  });

  it('uses shared badge data as source of unviewed count when loaded', () => {
    const { result } = renderHook(() =>
      useLightboxVariantBadges({
        pendingTaskGenerationId: 'gen-1',
        selectedProjectId: 'project-1',
        variants: baseVariants,
        variantFetchGenerationId: 'gen-1',
      })
    );

    expect(useVariantBadgesMock).toHaveBeenCalledWith(['gen-1'], true);
    expect(result.current.pendingTaskCount).toBe(3);
    expect(result.current.unviewedVariantCount).toBe(4);
  });

  it('falls back to local variant viewed_at counts while badge data is loading', () => {
    useVariantBadgesMock.mockReturnValue({ getBadgeData, isLoading: true });

    const { result } = renderHook(() =>
      useLightboxVariantBadges({
        pendingTaskGenerationId: 'gen-1',
        selectedProjectId: 'project-1',
        variants: baseVariants,
        variantFetchGenerationId: 'gen-1',
      })
    );

    expect(result.current.unviewedVariantCount).toBe(1);
  });

  it('marks all variants viewed for the fetch generation when requested', () => {
    const { result } = renderHook(() =>
      useLightboxVariantBadges({
        pendingTaskGenerationId: 'gen-1',
        selectedProjectId: 'project-1',
        variants: baseVariants,
        variantFetchGenerationId: 'gen-1',
      })
    );

    act(() => {
      result.current.handleMarkAllViewed();
    });

    expect(markAllViewed).toHaveBeenCalledWith('gen-1');
  });

  it('does not mark all viewed when no fetch generation exists', () => {
    const { result } = renderHook(() =>
      useLightboxVariantBadges({
        pendingTaskGenerationId: null,
        selectedProjectId: 'project-1',
        variants: baseVariants,
        variantFetchGenerationId: null,
      })
    );

    act(() => {
      result.current.handleMarkAllViewed();
    });

    expect(markAllViewed).not.toHaveBeenCalled();
  });
});
