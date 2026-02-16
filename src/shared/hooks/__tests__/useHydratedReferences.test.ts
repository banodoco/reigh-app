import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../useSpecificResources', () => ({
  useSpecificResources: vi.fn().mockReturnValue({
    data: [
      {
        id: 'resource-1',
        userId: 'user-1',
        user_id: 'user-1',
        metadata: {
          name: 'Test Style',
          styleReferenceImage: 'https://example.com/style.jpg',
          styleReferenceImageOriginal: 'https://example.com/style-original.jpg',
          thumbnailUrl: 'https://example.com/style-thumb.jpg',
          updatedAt: '2024-01-01T00:00:00Z',
          is_public: false,
          referenceMode: 'style',
          styleReferenceStrength: 1.1,
          subjectStrength: 0.0,
          subjectDescription: '',
          inThisScene: false,
          inThisSceneStrength: 1.0,
          styleBoostTerms: '',
        },
        created_at: '2024-01-01T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: () => ({ userId: 'user-1', selectedProjectId: 'proj-1', projects: [] }),
}));

import { useHydratedReferences } from '../useHydratedReferences';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useHydratedReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when referencePointers is undefined', () => {
    const { result } = renderHook(
      () => useHydratedReferences(undefined),
      { wrapper: createWrapper() }
    );

    expect(result.current.hydratedReferences).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasLegacyReferences).toBe(false);
  });

  it('returns empty array when referencePointers is empty', () => {
    const { result } = renderHook(
      () => useHydratedReferences([]),
      { wrapper: createWrapper() }
    );

    expect(result.current.hydratedReferences).toEqual([]);
    expect(result.current.hasLegacyReferences).toBe(false);
  });

  it('hydrates references from resources', () => {
    const pointers = [
      {
        id: 'ref-1',
        resourceId: 'resource-1',
        name: 'Test Style',
        styleReferenceStrength: 0.8,
      },
    ];

    const { result } = renderHook(
      () => useHydratedReferences(pointers as unknown),
      { wrapper: createWrapper() }
    );

    expect(result.current.hydratedReferences).toHaveLength(1);
    const hydrated = result.current.hydratedReferences[0];
    expect(hydrated.resourceId).toBe('resource-1');
    expect(hydrated.name).toBe('Test Style');
    // Pointer override for strength
    expect(hydrated.styleReferenceStrength).toBe(0.8);
    expect(hydrated.isOwner).toBe(true);
  });

  it('detects legacy references (no resourceId)', () => {
    const pointers = [
      {
        id: 'ref-legacy',
        name: 'Legacy Ref',
        styleReferenceImage: 'https://example.com/legacy.jpg',
        styleReferenceImageOriginal: 'https://example.com/legacy-original.jpg',
      },
    ];

    const { result } = renderHook(
      () => useHydratedReferences(pointers as unknown),
      { wrapper: createWrapper() }
    );

    expect(result.current.hasLegacyReferences).toBe(true);
    expect(result.current.hydratedReferences).toHaveLength(1);
    expect(result.current.hydratedReferences[0].resourceId).toBe('');
  });

  it('filters out references whose resources are not found', () => {
    const pointers = [
      {
        id: 'ref-missing',
        resourceId: 'resource-nonexistent',
        name: 'Missing',
      },
    ];

    const { result } = renderHook(
      () => useHydratedReferences(pointers as unknown),
      { wrapper: createWrapper() }
    );

    expect(result.current.hydratedReferences).toHaveLength(0);
    expect(result.current.hasLegacyReferences).toBe(false);
  });
});
