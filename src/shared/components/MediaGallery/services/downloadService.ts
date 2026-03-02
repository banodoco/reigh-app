import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import { downloadBlobAsFile } from '@/shared/runtime/browserDownloadRuntime';

interface DownloadedMediaResult {
  filename: string;
}

interface DownloadSingleMediaParams {
  rawUrl: string;
  filename: string;
  isVideo?: boolean;
  originalContentType?: string;
}

type DownloadServiceErrorCode = 'http_error' | 'network_error' | 'aborted' | 'invalid_payload';

export class DownloadServiceError extends Error {
  readonly code: DownloadServiceErrorCode;
  readonly context: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly url?: string;

  constructor(params: {
    message: string;
    code: DownloadServiceErrorCode;
    context: string;
    status?: number;
    statusText?: string;
    url?: string;
  }) {
    super(params.message);
    this.name = 'DownloadServiceError';
    this.code = params.code;
    this.context = params.context;
    this.status = params.status;
    this.statusText = params.statusText;
    this.url = params.url;
  }
}

function toDownloadServiceError(params: {
  error: unknown;
  context: string;
  url?: string;
  fallbackMessage: string;
}): DownloadServiceError {
  if (params.error instanceof DownloadServiceError) {
    return params.error;
  }

  if (params.error instanceof DOMException && params.error.name === 'AbortError') {
    return new DownloadServiceError({
      code: 'aborted',
      context: params.context,
      message: 'Download request was aborted',
      url: params.url,
    });
  }

  return new DownloadServiceError({
    code: 'network_error',
    context: params.context,
    message: params.error instanceof Error && params.error.message
      ? params.error.message
      : params.fallbackMessage,
    url: params.url,
  });
}

function downloadBlobWithXHR(
  url: string,
): Promise<{ blob: Blob; responseContentType: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    xhr.onload = function onLoad() {
      if (this.status !== 200) {
        reject(new DownloadServiceError({
          code: 'http_error',
          context: 'MediaGallery.downloadBlobWithXHR',
          message: `Failed to fetch media: ${this.status} ${this.statusText}`,
          status: this.status,
          statusText: this.statusText,
          url,
        }));
        return;
      }

      const response = this.response;
      if (!(response instanceof Blob)) {
        reject(new DownloadServiceError({
          code: 'invalid_payload',
          context: 'MediaGallery.downloadBlobWithXHR',
          message: 'Invalid download response payload',
          url,
        }));
        return;
      }

      resolve({
        blob: response,
        responseContentType: this.getResponseHeader('content-type'),
      });
    };

    xhr.onerror = function onError() {
      reject(new DownloadServiceError({
        code: 'network_error',
        context: 'MediaGallery.downloadBlobWithXHR',
        message: 'Network request failed',
        url,
      }));
    };

    xhr.onabort = function onAbort() {
      reject(new DownloadServiceError({
        code: 'aborted',
        context: 'MediaGallery.downloadBlobWithXHR',
        message: 'Download request was aborted',
        url,
      }));
    };

    xhr.send();
  });
}

function inferFileExtension(
  contentType: string,
  accessibleUrl: string,
  isVideo: boolean,
): string {
  let extension = contentType.split('/')[1];
  if (extension) {
    extension = extension.split(';')[0].trim();
  }
  if (!extension || extension === 'octet-stream') {
    const urlWithoutParams = accessibleUrl.split('?')[0];
    const urlParts = urlWithoutParams.split('.');
    extension = urlParts.length > 1 ? urlParts.pop()! : (isVideo ? 'mp4' : 'png');
  }
  return extension;
}

export async function downloadSingleMedia(
  params: DownloadSingleMediaParams,
): Promise<DownloadedMediaResult> {
  const accessibleUrl = getDisplayUrl(params.rawUrl);
  const { blob: rawBlob, responseContentType } = await downloadBlobWithXHR(accessibleUrl);
  const blobContentType = params.originalContentType
    || responseContentType
    || (params.isVideo ? 'video/mp4' : 'image/png');
  const blob = rawBlob.type === blobContentType
    ? rawBlob
    : new Blob([rawBlob], { type: blobContentType });

  const extension = inferFileExtension(blobContentType, accessibleUrl, params.isVideo === true);
  const downloadFilename = params.filename.includes('.')
    ? params.filename
    : `${params.filename}.${extension}`;
  downloadBlobAsFile(blob, downloadFilename);
  return { filename: downloadFilename };
}

interface DownloadStarredArchiveOptions {
  images: GeneratedImageWithMetadata[];
  onProgress?: (processedCount: number, totalCount: number) => void;
}

function inferMediaExtension(image: GeneratedImageWithMetadata, blob: Blob): string {
  const contentType = blob.type || image.metadata?.content_type;
  if (contentType) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    if (image.isVideo) {
      if (contentType.includes('webm')) return 'webm';
      return 'mp4';
    }
  }
  return image.isVideo ? 'mp4' : 'png';
}

function buildArchiveFileName(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  return `starred-images-${dateStr}.zip`;
}

export async function downloadStarredMediaArchive(
  options: DownloadStarredArchiveOptions,
): Promise<{ count: number; archiveFilename: string }> {
  const context = 'MediaGallery.downloadStarredMediaArchive';
  const JSZipModule = await import('jszip');
  const zip = new JSZipModule.default();

  const sortedImages = [...options.images].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return a.id.localeCompare(b.id);
  });

  for (let i = 0; i < sortedImages.length; i += 1) {
    const image = sortedImages[i];
    const accessibleImageUrl = getDisplayUrl(image.url);
    let response: Response;
    try {
      response = await fetch(accessibleImageUrl);
    } catch (error) {
      throw toDownloadServiceError({
        error,
        context,
        url: accessibleImageUrl,
        fallbackMessage: 'Network request failed',
      });
    }

    if (!response.ok) {
      throw new DownloadServiceError({
        code: 'http_error',
        context,
        message: `Failed to fetch media: ${response.status} ${response.statusText}`,
        status: response.status,
        statusText: response.statusText,
        url: accessibleImageUrl,
      });
    }

    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (error) {
      throw toDownloadServiceError({
        error,
        context,
        url: accessibleImageUrl,
        fallbackMessage: 'Failed to read download payload',
      });
    }

    const extension = inferMediaExtension(image, blob);
    const filename = `${String(i + 1).padStart(3, '0')}.${extension}`;
    zip.file(filename, blob);
    options.onProgress?.(i + 1, sortedImages.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const archiveFilename = buildArchiveFileName();
  downloadBlobAsFile(zipBlob, archiveFilename);
  return { count: sortedImages.length, archiveFilename };
}
