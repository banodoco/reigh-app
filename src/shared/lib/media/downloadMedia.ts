import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isAbortError } from '@/shared/lib/errorHandling/errorUtils';
import { downloadBlobAsFile, triggerBrowserDownload } from '@/shared/runtime/browserDownloadRuntime';
import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';

const isIOSPwa = (): boolean => {
  const nav = window.navigator as NavigatorWithDeviceInfo;
  const isStandalone = nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return isStandalone && isIOS;
};

const getFileExtension = (url: string, isVideo: boolean, contentType?: string): string => {
  if (contentType) {
    const ext = contentType.split('/')[1]?.split(';')[0]?.trim();
    if (ext && ext !== 'octet-stream') {
      return ext;
    }
  }

  const urlWithoutParams = url.split('?')[0];
  const urlParts = urlWithoutParams.split('.');
  if (urlParts.length > 1) {
    const ext = urlParts.pop();
    if (ext && ext.length <= 5) {
      return ext;
    }
  }

  return isVideo ? 'mp4' : 'png';
};

const sanitizeFilename = (value: string, maxLength: number = 50): string => {
  let sanitized = value
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim();

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).replace(/_$/, '');
  }

  return sanitized || 'media';
};

export const downloadMedia = async (
  url: string,
  mediaId: string,
  isVideo: boolean,
  contentType?: string,
  prompt?: string,
): Promise<void> => {
  const fileExt = getFileExtension(url, isVideo, contentType);

  const shortId = typeof mediaId === 'string' && mediaId.length > 8 ? mediaId.substring(0, 8) : mediaId;
  const filename = prompt && typeof prompt === 'string' && prompt.trim()
    ? `${sanitizeFilename(prompt, 40)}_${shortId}.${fileExt}`
    : `media_${shortId}.${fileExt}`;

  if (isIOSPwa()) {
    try {
      if (navigator.share && navigator.canShare) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch');
        }

        const blob = await response.blob();
        const file = new File([blob], filename, { type: contentType || blob.type });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Save Media',
          });
          return;
        }
      }
    } catch (shareError) {
      normalizeAndPresentError(shareError, { context: 'downloadMedia', showToast: false });
    }

    try {
      window.open(url, '_blank');
      toast.info('Long press the image/video to save it');
      return;
    } catch (openError) {
      normalizeAndPresentError(openError, { context: 'downloadMedia', toastTitle: 'Unable to download. Try opening in Safari.' });
      return;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    downloadBlobAsFile(blob, filename);
  } catch (error) {
    if (isAbortError(error)) {
      normalizeAndPresentError(error, { context: 'downloadMedia', toastTitle: 'Download timed out. Please try again.' });
      return;
    }

    normalizeAndPresentError(error, { context: 'downloadMedia', showToast: false });

    try {
      triggerBrowserDownload(url, filename, { target: '_blank' });
    } catch {
      // intentionally ignored
    }

    try {
      window.open(url, '_blank');
    } catch {
      // intentionally ignored
    }
  }
};
