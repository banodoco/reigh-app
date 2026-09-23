import React from 'react';
import { beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createGenerationForUploadedImageMock = vi.fn();
const createGenerationForUploadedVideoMock = vi.fn();
const createGenerationForLocalFileMock = vi.fn();
const runtimePrepareMediaImportMock = vi.fn();
const useResolvedGalleryProjectMock = vi.fn();
const locationMock = { search: '', pathname: '/' };
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();
const normalizeAndPresentErrorMock = vi.fn();

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => locationMock,
  };
});

vi.mock('@/app/runtime/useResolvedGalleryProject', () => ({
  useResolvedGalleryProject: (...args: unknown[]) => useResolvedGalleryProjectMock(...args),
}));

vi.mock('@/integrations/runtime/dataProvider', () => ({
  RuntimeDataProvider: class {
    prepareMediaImport(...args: unknown[]) {
      return runtimePrepareMediaImportMock(...args);
    }
  },
}));

vi.mock('@/shared/lib/media/createGenerationFromFile', () => ({
  createGenerationForLocalFile: (...args: unknown[]) => createGenerationForLocalFileMock(...args),
  createGenerationForUploadedImage: (...args: unknown[]) => createGenerationForUploadedImageMock(...args),
  createGenerationForUploadedVideo: (...args: unknown[]) => createGenerationForUploadedVideoMock(...args),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

let useDropToGeneration: typeof import('./useDropToGeneration').useDropToGeneration;

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useDropToGeneration', () => {
  beforeAll(async () => {
    ({ useDropToGeneration } = await import('./useDropToGeneration'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    locationMock.search = '';
    locationMock.pathname = '/';
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: null,
      runtimeAuthority: false,
      status: 'not-applicable',
      isResolving: false,
      error: null,
      selector: null,
    });
    createGenerationForUploadedImageMock.mockResolvedValue({ id: 'gen-image' });
    createGenerationForUploadedVideoMock.mockResolvedValue({ id: 'gen-video' });
  });

  it('uploads supported files and invalidates only the selected project generation scope', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });

    const imageFile = new File(['image'], 'frame.png', { type: 'image/png' });
    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    await act(async () => {
      await result.current([imageFile, videoFile]);
    });

    expect(createGenerationForUploadedImageMock).toHaveBeenCalledWith({
      imageFile,
      projectId: 'project-1',
    });
    expect(createGenerationForUploadedVideoMock).toHaveBeenCalledWith({
      videoFile,
      projectId: 'project-1',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['unified-generations', 'project', 'project-1'],
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('imports Runtime image/video drops with the canonical project and refreshes the Runtime gallery scope', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: 'runtime-project-id',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: 'local-project-slug',
    });
    runtimePrepareMediaImportMock
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-image',
        generationId: 'generation-image',
        variantId: 'variant-image',
        assetId: 'sha256:image',
        entry: { file: 'https://runtime.test/image', type: 'image/png' },
      })
      .mockResolvedValueOnce({
        provider: 'runtime',
        project: 'runtime-project-id',
        importOperationId: 'operation-video',
        generationId: 'generation-video',
        variantId: 'variant-video',
        assetId: 'sha256:video',
        entry: { file: 'https://runtime.test/video', type: 'video/mp4' },
      });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });
    const imageFile = new File(['image'], 'frame.png', { type: 'image/png' });
    const videoFile = new File(['video'], 'clip.mp4', { type: 'video/mp4' });

    await act(async () => {
      await result.current([imageFile, videoFile]);
    });

    expect(runtimePrepareMediaImportMock).toHaveBeenNthCalledWith(1, imageFile, {
      filename: 'frame.png',
      mediaType: 'image/png',
    });
    expect(runtimePrepareMediaImportMock).toHaveBeenNthCalledWith(2, videoFile, {
      filename: 'clip.mp4',
      mediaType: 'video/mp4',
    });
    expect(createGenerationForUploadedImageMock).not.toHaveBeenCalled();
    expect(createGenerationForUploadedVideoMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['runtime', 'unified-generations', 'project', 'runtime-project-id'],
    });
  });

  it('rejects Runtime files above 64 MiB before media import or gallery refresh', async () => {
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: 'runtime-project-id',
      runtimeAuthority: true,
      status: 'resolved',
      isResolving: false,
      error: null,
      selector: null,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });
    const oversizedVideo = new File(['x'], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedVideo, 'size', { value: 64 * 1024 * 1024 + 1 });

    await act(async () => {
      await result.current([oversizedVideo]);
    });

    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      toastTitle: 'Failed to add huge.mp4',
    }));
  });

  it('fails closed for the legacy Bridge local route without invoking generation or local-file writers', async () => {
    locationMock.search = '?localProject=bridge-slug&localTimeline=timeline-1';
    useResolvedGalleryProjectMock.mockReturnValue({
      projectId: null,
      runtimeAuthority: false,
      status: 'not-applicable',
      isResolving: false,
      error: null,
      selector: 'bridge-slug',
    });
    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(new QueryClient()),
    });

    await act(async () => {
      await result.current([new File(['image'], 'frame.png', { type: 'image/png' })]);
    });

    expect(runtimePrepareMediaImportMock).not.toHaveBeenCalled();
    expect(createGenerationForLocalFileMock).not.toHaveBeenCalled();
    expect(createGenerationForUploadedImageMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Runtime media import is unavailable for the legacy Astrid Bridge host.');
  });

  it('shows an informational toast and skips oversized files', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });

    const oversizedImage = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(oversizedImage, 'size', { value: 25 * 1024 * 1024 });

    await act(async () => {
      await result.current([oversizedImage]);
    });

    expect(createGenerationForUploadedImageMock).not.toHaveBeenCalled();
    expect(createGenerationForUploadedVideoMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it('shows an error toast for unsupported files', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useDropToGeneration(), {
      wrapper: createWrapper(queryClient),
    });

    const unsupportedFile = new File(['text'], 'notes.txt', { type: 'text/plain' });

    await act(async () => {
      await result.current([unsupportedFile]);
    });

    expect(toastErrorMock).toHaveBeenCalledWith('Unsupported file type: notes.txt');
    expect(createGenerationForUploadedImageMock).not.toHaveBeenCalled();
    expect(createGenerationForUploadedVideoMock).not.toHaveBeenCalled();
  });
});
