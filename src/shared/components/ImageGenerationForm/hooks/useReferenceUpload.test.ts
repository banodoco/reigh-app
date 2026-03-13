import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReferenceUpload } from './useReferenceUpload';

const mocks = vi.hoisted(() => ({
  createResourceMutateAsync: vi.fn(),
  updateResourceMutateAsync: vi.fn(),
  deleteResourceMutateAsync: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  toastError: vi.fn(),
  getUser: vi.fn(),
  tryUploadAndProcessReference: vi.fn(),
  resolveReferenceThumbnailUrl: vi.fn(),
  persistOptimisticReferenceSelection: vi.fn(),
}));

vi.mock('@/features/resources/hooks/useResources', () => ({
  useCreateResource: () => ({ mutateAsync: mocks.createResourceMutateAsync }),
  useUpdateResource: () => ({ mutateAsync: mocks.updateResourceMutateAsync }),
  useDeleteResource: () => ({ mutateAsync: mocks.deleteResourceMutateAsync }),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => mocks.getUser(...args),
    },
  }),
}));

vi.mock('./referenceUpload/referenceDomainService', async () => {
  const actual = await vi.importActual<typeof import('./referenceUpload/referenceDomainService')>(
    './referenceUpload/referenceDomainService',
  );
  return {
    ...actual,
    tryUploadAndProcessReference: (...args: unknown[]) => mocks.tryUploadAndProcessReference(...args),
    resolveReferenceThumbnailUrl: (...args: unknown[]) => mocks.resolveReferenceThumbnailUrl(...args),
  };
});

vi.mock('./referenceUpload/persistOptimisticReferenceSelection', () => ({
  persistOptimisticReferenceSelection: (...args: unknown[]) => mocks.persistOptimisticReferenceSelection(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

function buildProps() {
  return {
    selectedProjectId: 'project-1',
    effectiveShotId: 'shot-1',
    selectedReferenceIdByShot: { 'shot-1': 'pointer-existing' },
    referencePointers: [
      { id: 'pointer-existing', resourceId: 'resource-existing', createdAt: '2025-01-01T00:00:00Z' },
    ],
    hydratedReferences: [
      {
        id: 'pointer-existing',
        resourceId: 'resource-existing',
        name: 'Existing reference',
        styleReferenceImage: 'https://cdn.example.com/style.jpg',
        styleReferenceImageOriginal: 'https://cdn.example.com/original.jpg',
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        styleReferenceStrength: 0.8,
        subjectStrength: 0.3,
        subjectDescription: 'Existing subject',
        inThisScene: false,
        inThisSceneStrength: 0.2,
        referenceMode: 'style',
        styleBoostTerms: 'cinematic',
        isPublic: false,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ],
    isLoadingProjectSettings: false,
    isLocalGenerationEnabled: false,
    updateProjectImageSettings: vi.fn().mockResolvedValue(undefined),
    markAsInteracted: vi.fn(),
    privacyDefaults: { resourcesPublic: false },
    referenceMode: 'style' as const,
    styleReferenceStrength: 0.9,
    subjectStrength: 0.4,
    inThisScene: true,
    inThisSceneStrength: 0.7,
  };
}

describe('useReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
    });
    mocks.createResourceMutateAsync.mockResolvedValue({
      id: 'resource-new',
      type: 'style-reference',
      metadata: {},
    });
    mocks.updateResourceMutateAsync.mockResolvedValue(undefined);
    mocks.deleteResourceMutateAsync.mockResolvedValue(undefined);
    mocks.tryUploadAndProcessReference.mockResolvedValue({
      ok: true,
      value: {
        originalUploadedUrl: 'https://cdn.example.com/original-upload.jpg',
        processedUploadedUrl: 'https://cdn.example.com/processed-upload.jpg',
      },
    });
    mocks.resolveReferenceThumbnailUrl.mockResolvedValue({
      ok: true,
      value: 'https://cdn.example.com/thumb-upload.jpg',
    });
    mocks.persistOptimisticReferenceSelection.mockImplementation(async ({ applyOptimisticUpdate }) => {
      applyOptimisticUpdate();
      return { ok: true, value: undefined };
    });
  });

  it('stops early when settings are still loading or the uploaded file is not an image', async () => {
    const loadingProps = buildProps();
    loadingProps.isLoadingProjectSettings = true;
    const { wrapper } = createWrapper();
    const { result: loadingResult } = renderHook(() => useReferenceUpload(loadingProps), { wrapper });

    await act(async () => {
      await loadingResult.current.handleStyleReferenceUpload([
        new File(['image'], 'style.png', { type: 'image/png' }),
      ]);
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Please wait for settings to load');
    expect(mocks.tryUploadAndProcessReference).not.toHaveBeenCalled();

    const readyProps = buildProps();
    const { result } = renderHook(() => useReferenceUpload(readyProps), { wrapper });

    await act(async () => {
      await result.current.handleStyleReferenceUpload([
        new File(['text'], 'notes.txt', { type: 'text/plain' }),
      ]);
    });

    expect(mocks.tryUploadAndProcessReference).not.toHaveBeenCalled();
    expect(mocks.createResourceMutateAsync).not.toHaveBeenCalled();
  });

  it('exposes the expected contract and updates override state after a successful upload', async () => {
    const props = buildProps();
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReferenceUpload(props), { wrapper });

    expect(result.current.isUploadingStyleReference).toBe(false);
    expect(result.current.styleReferenceOverride).toBeUndefined();
    expect(typeof result.current.setStyleReferenceOverride).toBe('function');
    expect(typeof result.current.handleStyleReferenceUpload).toBe('function');
    expect(typeof result.current.handleResourceSelect).toBe('function');
    expect(typeof result.current.handleUpdateReferenceName).toBe('function');
    expect(typeof result.current.handleToggleVisibility).toBe('function');
    expect(typeof result.current.handleDeleteReference).toBe('function');

    const file = new File(['image'], 'style.png', { type: 'image/png' });
    await act(async () => {
      await result.current.handleStyleReferenceUpload([file]);
    });

    await waitFor(() => {
      expect(result.current.styleReferenceOverride).toBe('https://cdn.example.com/original-upload.jpg');
    });
    expect(mocks.resolveReferenceThumbnailUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackUrl: 'https://cdn.example.com/original-upload.jpg',
      }),
    );
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.createResourceMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'style-reference',
        metadata: expect.objectContaining({
          styleReferenceImage: 'https://cdn.example.com/processed-upload.jpg',
          styleReferenceImageOriginal: 'https://cdn.example.com/original-upload.jpg',
          thumbnailUrl: 'https://cdn.example.com/thumb-upload.jpg',
          is_public: false,
        }),
      }),
    );
    expect(mocks.persistOptimisticReferenceSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProjectId: 'project-1',
        updateProjectImageSettings: props.updateProjectImageSettings,
      }),
    );
    expect(props.markAsInteracted).toHaveBeenCalled();
  });

  it('reports upload failures without mutating resource or settings state', async () => {
    const props = buildProps();
    mocks.tryUploadAndProcessReference.mockResolvedValue({
      ok: false,
      error: new Error('upload failed'),
      message: 'Upload failed',
      errorCode: 'reference_upload_failed',
      recoverable: true,
      policy: 'retry',
      cause: null,
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReferenceUpload(props), { wrapper });

    await act(async () => {
      await result.current.handleStyleReferenceUpload([
        new File(['image'], 'style.png', { type: 'image/png' }),
      ]);
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useReferenceUpload.handleStyleReferenceUpload.tryUploadAndProcessReference',
        toastTitle: 'Failed to upload reference image',
      }),
    );
    expect(mocks.createResourceMutateAsync).not.toHaveBeenCalled();
    expect(props.updateProjectImageSettings).not.toHaveBeenCalled();
    expect(props.markAsInteracted).not.toHaveBeenCalled();
  });

  it('selects an existing reference pointer without creating a new one', async () => {
    const props = buildProps();
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useReferenceUpload(props), { wrapper });

    await act(async () => {
      await result.current.handleResourceSelect({
        id: 'resource-existing',
        type: 'style-reference',
        metadata: {},
      } as never);
    });

    expect(props.updateProjectImageSettings).toHaveBeenCalledWith('project', {
      selectedReferenceIdByShot: { 'shot-1': 'pointer-existing' },
    });
    expect(props.markAsInteracted).toHaveBeenCalled();
    expect(queryClient.getQueryData(['tool-settings', 'project-image-settings', 'project-1', null])).toBeUndefined();
  });

  it('creates a new reference pointer for a newly selected resource', async () => {
    const props = buildProps();
    props.referencePointers = [];
    props.selectedReferenceIdByShot = {};
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReferenceUpload(props), { wrapper });

    await act(async () => {
      await result.current.handleResourceSelect({
        id: 'resource-new',
        type: 'style-reference',
        metadata: {},
      } as never);
    });

    expect(mocks.persistOptimisticReferenceSelection).toHaveBeenCalled();
    expect(props.markAsInteracted).toHaveBeenCalled();
  });

  it('routes rename, visibility toggle, and delete through the resource mutation boundary', async () => {
    const props = buildProps();
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useReferenceUpload(props), { wrapper });

    await act(async () => {
      await result.current.handleUpdateReferenceName('pointer-existing', 'Renamed reference');
      await result.current.handleToggleVisibility('resource-existing', false);
      await result.current.handleDeleteReference('pointer-existing');
    });

    expect(mocks.updateResourceMutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.deleteResourceMutateAsync).toHaveBeenCalledWith({
      id: 'resource-existing',
      type: 'style-reference',
    });
    expect(mocks.updateResourceMutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'resource-existing',
      type: 'style-reference',
      metadata: expect.objectContaining({
        name: 'Renamed reference',
        is_public: false,
      }),
    }));
    expect(mocks.updateResourceMutateAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'resource-existing',
      type: 'style-reference',
      metadata: expect.objectContaining({
        name: 'Existing reference',
        is_public: true,
      }),
    }));
    expect(props.updateProjectImageSettings).toHaveBeenCalledWith('project', expect.objectContaining({
      references: [],
      selectedReferenceIdByShot: { 'shot-1': null },
    }));
  });
});
