import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationFailure, operationSuccess } from '@/shared/lib/operationResult';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import { useStyleReferenceUploadHandler } from './useStyleReferenceUploadHandler';

const mocks = vi.hoisted(() => {
  function updateSettingsCacheDouble(
    prev: unknown,
    updater: Record<string, unknown> | ((prevSettings: Record<string, unknown>) => Record<string, unknown>),
  ) {
    const wrapper = Boolean(prev && typeof prev === 'object' && 'settings' in prev);
    const prevSettings = (
      wrapper
        ? ((prev as { settings?: Record<string, unknown> }).settings ?? {})
        : ((prev as Record<string, unknown> | undefined) ?? {})
    );
    const updates = typeof updater === 'function' ? updater(prevSettings) : updater;
    return {
      settings: { ...prevSettings, ...updates },
      hasShotSettings: wrapper ? Boolean((prev as { hasShotSettings?: boolean }).hasShotSettings) : false,
    };
  }

  return {
    toastError: vi.fn(),
    getUser: vi.fn(),
    normalizeAndPresentError: vi.fn(),
    uploadAndProcessReference: vi.fn(),
    resolveReferenceThumbnailUrl: vi.fn(),
    persistOptimisticReferenceSelection: vi.fn(),
    updateSettingsCache: vi.fn(updateSettingsCacheDouble),
  };
});

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

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  updateSettingsCache: (...args: unknown[]) => mocks.updateSettingsCache(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

vi.mock('./referenceDomainService', async () => {
  const actual = await vi.importActual<typeof import('./referenceDomainService')>('./referenceDomainService');
  return {
    ...actual,
    tryUploadAndProcessReference: (...args: unknown[]) => mocks.uploadAndProcessReference(...args),
    resolveReferenceThumbnailUrl: (...args: unknown[]) => mocks.resolveReferenceThumbnailUrl(...args),
  };
});

vi.mock('./persistOptimisticReferenceSelection', () => ({
  persistOptimisticReferenceSelection: (...args: unknown[]) =>
    mocks.persistOptimisticReferenceSelection(...args),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

describe('useStyleReferenceUploadHandler', () => {
  beforeEach(() => {
    mocks.toastError.mockReset();
    mocks.getUser.mockReset();
    mocks.normalizeAndPresentError.mockReset();
    mocks.uploadAndProcessReference.mockReset();
    mocks.resolveReferenceThumbnailUrl.mockReset();
    mocks.persistOptimisticReferenceSelection.mockReset();
    mocks.updateSettingsCache.mockClear();
  });

  it('reports the original upload error with structured failure log data', async () => {
    const uploadError = new Error('Upload timed out after 60000ms');
    mocks.uploadAndProcessReference.mockResolvedValue(operationFailure(uploadError, {
      message: 'Failed to upload and process reference image',
      errorCode: 'reference_upload_failed',
      policy: 'degrade',
      recoverable: true,
      cause: uploadError,
    }));

    const { result } = renderHook(() => useStyleReferenceUploadHandler({
      selectedProjectId: 'project-1',
      effectiveShotId: 'shot-1',
      hydratedReferences: [],
      isLoadingProjectSettings: false,
      updateProjectImageSettings: vi.fn(),
      markAsInteracted: vi.fn(),
      privacyDefaults: { resourcesPublic: false },
      queryClient: {} as never,
      createStyleReference: { mutateAsync: vi.fn() },
    }));

    await act(async () => {
      await result.current.handleStyleReferenceUpload([
        new File(['x'], 'reference.png', { type: 'image/png' }),
      ]);
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(uploadError, {
      context: 'useReferenceUpload.handleStyleReferenceUpload.tryUploadAndProcessReference',
      toastTitle: 'Failed to upload reference image',
      logData: {
        operationMessage: 'Failed to upload and process reference image',
        operationErrorCode: 'reference_upload_failed',
        operationPolicy: 'degrade',
        operationRecoverable: true,
        operationCause: uploadError,
      },
    });
    expect(mocks.resolveReferenceThumbnailUrl).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.persistOptimisticReferenceSelection).not.toHaveBeenCalled();
  });

  it('applies optimistic resource and selection cache updates on successful upload', async () => {
    const queryClient = createQueryClient();
    const selectedProjectId = 'project-1';
    const effectiveShotId = 'shot-1';
    const settingsKey = settingsQueryKeys.tool(
      SETTINGS_IDS.PROJECT_IMAGE_SETTINGS,
      selectedProjectId,
      undefined,
    );
    const existingResource = {
      id: 'resource-1',
      type: 'style-reference' as const,
      metadata: { name: 'Existing' },
    };
    const createdResource = {
      id: 'resource-2',
      type: 'style-reference' as const,
      metadata: { name: 'Uploaded' },
    };
    const existingReference = {
      id: 'reference-1',
      resourceId: existingResource.id,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const markAsInteracted = vi.fn();
    const updateProjectImageSettings = vi.fn().mockResolvedValue(undefined);
    const createStyleReference = {
      mutateAsync: vi.fn().mockResolvedValue(createdResource),
    };

    queryClient.setQueryData(['resources', 'style-reference'], [existingResource]);
    queryClient.setQueryData(settingsKey, {
      settings: {
        references: [existingReference],
        selectedReferenceIdByShot: { 'shot-0': existingReference.id },
      },
      hasShotSettings: false,
    });

    mocks.uploadAndProcessReference.mockResolvedValue(operationSuccess({
      originalUploadedUrl: 'https://cdn.example.com/reference-original.png',
      processedUploadedUrl: 'https://cdn.example.com/reference-processed.png',
    }));
    mocks.resolveReferenceThumbnailUrl.mockResolvedValue(operationSuccess(
      'https://cdn.example.com/reference-thumb.png',
    ));
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'creator@example.com',
        },
      },
    });
    mocks.persistOptimisticReferenceSelection.mockImplementation(async (input) => {
      (input as { applyOptimisticUpdate: () => void }).applyOptimisticUpdate();
      return operationSuccess(undefined, { policy: 'best_effort' });
    });

    const { result } = renderHook(() => useStyleReferenceUploadHandler({
      selectedProjectId,
      effectiveShotId,
      hydratedReferences: [],
      isLoadingProjectSettings: false,
      updateProjectImageSettings,
      markAsInteracted,
      privacyDefaults: { resourcesPublic: false },
      queryClient,
      createStyleReference,
    }));

    await act(async () => {
      await result.current.handleStyleReferenceUpload([
        new File(['x'], 'reference.png', { type: 'image/png' }),
      ]);
    });

    const resources = queryClient.getQueryData(['resources', 'style-reference']) as Array<{ id: string }>;
    const cachedSettings = queryClient.getQueryData(settingsKey) as {
      settings: {
        references: Array<{ id: string; resourceId: string }>;
        selectedReferenceIdByShot: Record<string, string>;
      };
    };
    const optimisticReference = cachedSettings.settings.references[1];

    expect(resources).toEqual([existingResource, createdResource]);
    expect(cachedSettings.settings.references).toHaveLength(2);
    expect(optimisticReference.resourceId).toBe(createdResource.id);
    expect(cachedSettings.settings.selectedReferenceIdByShot).toMatchObject({
      'shot-0': existingReference.id,
      [effectiveShotId]: optimisticReference.id,
    });
    expect(markAsInteracted).toHaveBeenCalledTimes(1);
    expect(result.current.styleReferenceOverride).toBe(
      'https://cdn.example.com/reference-original.png',
    );
    expect(createStyleReference.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.persistOptimisticReferenceSelection).toHaveBeenCalledTimes(1);
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });
});
