import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { operationFailure } from '@/shared/lib/operationResult';
import { useStyleReferenceUploadHandler } from './useStyleReferenceUploadHandler';

const toastErrorMock = vi.fn();
const getUserMock = vi.fn();
const normalizeAndPresentErrorMock = vi.fn();
const uploadAndProcessReferenceMock = vi.fn();
const resolveReferenceThumbnailUrlMock = vi.fn();
const persistOptimisticReferenceSelectionMock = vi.fn();

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
  }),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  updateSettingsCache: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

vi.mock('./referenceDomainService', async () => {
  const actual = await vi.importActual<typeof import('./referenceDomainService')>('./referenceDomainService');
  return {
    ...actual,
    uploadAndProcessReference: (...args: unknown[]) => uploadAndProcessReferenceMock(...args),
    resolveReferenceThumbnailUrl: (...args: unknown[]) => resolveReferenceThumbnailUrlMock(...args),
  };
});

vi.mock('./persistOptimisticReferenceSelection', () => ({
  persistOptimisticReferenceSelection: (...args: unknown[]) =>
    persistOptimisticReferenceSelectionMock(...args),
}));

describe('useStyleReferenceUploadHandler', () => {
  beforeEach(() => {
    toastErrorMock.mockReset();
    getUserMock.mockReset();
    normalizeAndPresentErrorMock.mockReset();
    uploadAndProcessReferenceMock.mockReset();
    resolveReferenceThumbnailUrlMock.mockReset();
    persistOptimisticReferenceSelectionMock.mockReset();
  });

  it('reports the original upload error with structured failure log data', async () => {
    const uploadError = new Error('Upload timed out after 60000ms');
    uploadAndProcessReferenceMock.mockResolvedValue(operationFailure(uploadError, {
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

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(uploadError, {
      context: 'useReferenceUpload.handleStyleReferenceUpload.uploadAndProcessReference',
      toastTitle: 'Failed to upload reference image',
      logData: {
        operationMessage: 'Failed to upload and process reference image',
        operationErrorCode: 'reference_upload_failed',
        operationPolicy: 'degrade',
        operationRecoverable: true,
        operationCause: uploadError,
      },
    });
    expect(resolveReferenceThumbnailUrlMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(persistOptimisticReferenceSelectionMock).not.toHaveBeenCalled();
  });
});
