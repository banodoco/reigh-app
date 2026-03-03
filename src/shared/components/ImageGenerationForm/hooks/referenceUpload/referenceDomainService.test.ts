import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistReferenceSelection,
  resolveReferenceThumbnailUrl,
  uploadAndProcessReference,
} from './referenceDomainService';

const fileToDataURLMock = vi.fn();
const dataURLtoFileMock = vi.fn();
const uploadImageToStorageMock = vi.fn();
const resolveProjectResolutionMock = vi.fn();
const processStyleReferenceForAspectRatioStringMock = vi.fn();
const generateClientThumbnailMock = vi.fn();
const getSessionMock = vi.fn();
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const extractSettingsFromCacheMock = vi.fn();

vi.mock('@/shared/lib/fileConversion', () => ({
  fileToDataURL: (...args: unknown[]) => fileToDataURLMock(...args),
  dataURLtoFile: (...args: unknown[]) => dataURLtoFileMock(...args),
}));

vi.mock('@/shared/lib/media/imageUploader', () => ({
  uploadImageToStorage: (...args: unknown[]) => uploadImageToStorageMock(...args),
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  resolveProjectResolution: (...args: unknown[]) => resolveProjectResolutionMock(...args),
}));

vi.mock('@/shared/lib/media/styleReferenceProcessor', () => ({
  processStyleReferenceForAspectRatioString: (...args: unknown[]) =>
    processStyleReferenceForAspectRatioStringMock(...args),
}));

vi.mock('@/shared/media/clientThumbnailGenerator', () => ({
  generateClientThumbnail: (...args: unknown[]) => generateClientThumbnailMock(...args),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        getPublicUrl: (...args: unknown[]) => getPublicUrlMock(...args),
      }),
    },
  }),
}));

vi.mock('@/shared/hooks/useToolSettings', () => ({
  extractSettingsFromCache: (...args: unknown[]) => extractSettingsFromCacheMock(...args),
}));

describe('referenceDomainService', () => {
  beforeEach(() => {
    fileToDataURLMock.mockReset();
    dataURLtoFileMock.mockReset();
    uploadImageToStorageMock.mockReset();
    resolveProjectResolutionMock.mockReset();
    processStyleReferenceForAspectRatioStringMock.mockReset();
    generateClientThumbnailMock.mockReset();
    getSessionMock.mockReset();
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
    extractSettingsFromCacheMock.mockReset();
  });

  it('returns failure when aspect-ratio processing fails', async () => {
    fileToDataURLMock.mockResolvedValue('data:image/png;base64,abc');
    uploadImageToStorageMock.mockResolvedValue('https://example.com/original.png');
    resolveProjectResolutionMock.mockResolvedValue({ aspectRatio: '16:9' });
    processStyleReferenceForAspectRatioStringMock.mockResolvedValue(null);

    const result = await uploadAndProcessReference({
      file: new File(['x'], 'a.png', { type: 'image/png' }),
      selectedProjectId: 'project-1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure');
    }
    expect(result.errorCode).toBe('reference_aspect_processing_failed');
    expect(uploadImageToStorageMock).toHaveBeenCalledTimes(1);
    expect(resolveProjectResolutionMock).toHaveBeenCalledWith('project-1');
    expect(processStyleReferenceForAspectRatioStringMock).toHaveBeenCalledTimes(1);
  });

  it('returns failure when thumbnail auth/session is missing', async () => {
    generateClientThumbnailMock.mockResolvedValue({
      thumbnailBlob: new Blob(['x'], { type: 'image/jpeg' }),
    });
    getSessionMock.mockResolvedValue({ data: { session: null } });

    const result = await resolveReferenceThumbnailUrl({
      file: new File(['x'], 'a.png', { type: 'image/png' }),
      fallbackUrl: 'https://fallback.example/img.png',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure');
    }
    expect(result.errorCode).toBe('reference_thumbnail_auth_required');
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('returns failure when selection persistence throws', async () => {
    extractSettingsFromCacheMock.mockReturnValue({
      references: [],
      selectedReferenceIdByShot: {},
    });
    const updateProjectImageSettings = vi.fn().mockRejectedValue(new Error('write failed'));

    const result = await persistReferenceSelection({
      queryClient: {
        getQueryData: () => ({}),
      } as unknown as import('@tanstack/react-query').QueryClient,
      selectedProjectId: 'project-1',
      updateProjectImageSettings,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure');
    }
    expect(result.errorCode).toBe('reference_selection_persist_failed');
    expect(extractSettingsFromCacheMock).toHaveBeenCalledTimes(1);
    expect(updateProjectImageSettings).toHaveBeenCalledTimes(1);
  });
});
