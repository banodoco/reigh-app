import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

const mockGetLineageDepth = vi.fn();
const mockIsRuntimeLineageAuthority = vi.fn();

vi.mock('@/shared/hooks/variants/useLineageChain', () => ({
  getLineageDepth: (...args: unknown[]) => mockGetLineageDepth(...args),
  isRuntimeLineageAuthority: () => mockIsRuntimeLineageAuthority(),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'astrid-intro' }),
}));

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  usePrefetchTaskData: () => vi.fn(),
  usePrefetchTaskById: () => vi.fn(),
}));

vi.mock('@/shared/hooks/variants/useToggleVariantStar', () => ({
  useToggleVariantStar: () => ({ toggleStar: vi.fn() }),
}));

import { useVariantActions } from './useVariantActions';

const variant: GenerationVariant = {
  id: 'variant-1',
  generation_id: 'generation-1',
  location: 'https://example.com/variant.jpg',
  thumbnail_url: null,
  params: {},
  is_primary: true,
  starred: false,
  variant_type: 'original',
  name: null,
  created_at: '2024-01-01T00:00:00Z',
  viewed_at: null,
};

function renderActions() {
  return renderHook(() => useVariantActions({
    variants: [variant],
    activeVariantId: variant.id,
    isMobile: false,
  }));
}

describe('useVariantActions lineage authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLineageDepth.mockResolvedValue(2);
  });

  it('does not invoke the legacy lineage reader for Runtime/local documents', () => {
    mockIsRuntimeLineageAuthority.mockReturnValue(true);
    const { result } = renderActions();

    act(() => {
      result.current.handleVariantMouseEnter(variant);
    });

    expect(mockGetLineageDepth).not.toHaveBeenCalled();
  });

  it('keeps deferred lineage reads enabled on an ordinary cloud route', () => {
    mockIsRuntimeLineageAuthority.mockReturnValue(false);
    const { result } = renderActions();

    act(() => {
      result.current.handleVariantMouseEnter(variant);
    });

    expect(mockGetLineageDepth).toHaveBeenCalledWith(variant.id, 'astrid-intro');
  });
});
