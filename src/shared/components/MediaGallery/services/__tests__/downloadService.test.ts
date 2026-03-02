import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import { downloadBlobAsFile } from '@/shared/runtime/browserDownloadRuntime';
import {
  DownloadServiceError,
  downloadStarredMediaArchive,
} from '../downloadService';

vi.mock('@/shared/lib/mediaUrl', () => ({
  getDisplayUrl: (url: string) => url,
}));

vi.mock('@/shared/runtime/browserDownloadRuntime', () => ({
  downloadBlobAsFile: vi.fn(),
}));

const mockZipFile = vi.fn();
const mockZipGenerateAsync = vi.fn().mockResolvedValue(new Blob(['zip-data'], { type: 'application/zip' }));

vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(function MockZip() {
    return {
      file: mockZipFile,
      generateAsync: mockZipGenerateAsync,
    };
  }),
}));

function buildImage(overrides: Partial<GeneratedImageWithMetadata> = {}): GeneratedImageWithMetadata {
  return {
    id: 'gen-1',
    url: 'https://example.com/image.png',
    isVideo: false,
    metadata: {},
    ...overrides,
  } as GeneratedImageWithMetadata;
}

describe('downloadStarredMediaArchive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wraps fetch network failures as DownloadServiceError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(
      downloadStarredMediaArchive({ images: [buildImage()] }),
    ).rejects.toMatchObject<Partial<DownloadServiceError>>({
      name: 'DownloadServiceError',
      code: 'network_error',
      context: 'MediaGallery.downloadStarredMediaArchive',
    });
  });

  it('wraps abort failures as DownloadServiceError with aborted code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    );

    await expect(
      downloadStarredMediaArchive({ images: [buildImage()] }),
    ).rejects.toMatchObject<Partial<DownloadServiceError>>({
      name: 'DownloadServiceError',
      code: 'aborted',
      context: 'MediaGallery.downloadStarredMediaArchive',
    });
  });

  it('preserves http failures as DownloadServiceError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } satisfies Partial<Response>),
    );

    await expect(
      downloadStarredMediaArchive({ images: [buildImage()] }),
    ).rejects.toMatchObject<Partial<DownloadServiceError>>({
      name: 'DownloadServiceError',
      code: 'http_error',
      status: 503,
    });
  });

  it('downloads a zip archive on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        blob: vi.fn().mockResolvedValue(new Blob(['image-data'], { type: 'image/png' })),
      } satisfies Partial<Response>),
    );

    const result = await downloadStarredMediaArchive({
      images: [buildImage()],
    });

    expect(result.count).toBe(1);
    expect(result.archiveFilename.endsWith('.zip')).toBe(true);
    expect(mockZipFile).toHaveBeenCalledTimes(1);
    expect(downloadBlobAsFile).toHaveBeenCalledTimes(1);
  });
});
