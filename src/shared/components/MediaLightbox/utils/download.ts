import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { isAbortError } from '@/shared/lib/errorUtils';
import type { NavigatorWithDeviceInfo } from '@/types/browser-extensions';

/**
 * Detect if running as iOS/iPadOS PWA (standalone mode)
 */
const isIOSPwa = (): boolean => {
  // Check if running in standalone mode (PWA)
  const nav = window.navigator as NavigatorWithDeviceInfo;
  const isStandalone = nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  
  // Check if iOS/iPadOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  return isStandalone && isIOS;
};

/**
 * Get file extension from content type or URL
 */
const getFileExtension = (url: string, isVideo: boolean, contentType?: string): string => {
  // Priority 1: Use stored content type if available
  if (contentType) {
    const ext = contentType.split('/')[1]?.split(';')[0]?.trim();
    if (ext && ext !== 'octet-stream') {
      return ext;
    }
  }
  
  // Priority 2: Extract from URL (strip query params first)
  const urlWithoutParams = url.split('?')[0];
  const urlParts = urlWithoutParams.split('.');
  if (urlParts.length > 1) {
    const ext = urlParts.pop()!;
    if (ext && ext.length <= 5) { // Reasonable extension length
      return ext;
    }
  }
  
  // Priority 3: Default based on media type
  return isVideo ? 'mp4' : 'png';
};

/**
 * Sanitize a string for use as a filename
 * Removes/replaces characters that are invalid in most filesystems
 */
const sanitizeFilename = (str: string, maxLength: number = 50): string => {
  // Remove or replace invalid filename characters
  let sanitized = str
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Trim leading/trailing underscores
    .trim();

  // Truncate to maxLength
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).replace(/_$/, '');
  }

  return sanitized || 'media';
};

/**
 * Download media (image or video) from a URL
 * Handles timeouts, fallbacks, and error cases
 * Special handling for iOS PWA where download attribute doesn't work
 *
 * @param url - The URL to download from
 * @param mediaId - Media ID for filename (UUID)
 * @param isVideo - Whether the media is a video
 * @param contentType - Optional MIME type for proper file extension (e.g., 'video/mp4')
 * @param prompt - Optional prompt text to use in filename for better readability
 */
export const downloadMedia = async (url: string, mediaId: string, isVideo: boolean, contentType?: string, prompt?: string): Promise<void> => {
  const fileExt = getFileExtension(url, isVideo, contentType);

  // Generate a user-friendly filename:
  // - If prompt is available: use sanitized prompt + short ID suffix for uniqueness
  // - Otherwise: use media_<short_id> format
  const shortId = typeof mediaId === 'string' && mediaId.length > 8 ? mediaId.substring(0, 8) : mediaId;
  let filename: string;
  if (prompt && typeof prompt === 'string' && prompt.trim()) {
    const sanitizedPrompt = sanitizeFilename(prompt, 40);
    filename = `${sanitizedPrompt}_${shortId}.${fileExt}`;
  } else {
    filename = `media_${shortId}.${fileExt}`;
  }

  // For iOS PWA, use Web Share API or open in new tab
  // The download attribute doesn't work in standalone mode
  if (isIOSPwa()) {
    
    try {
      // Try Web Share API first (allows saving to Photos or Files)
      if (navigator.share && navigator.canShare) {
        // Fetch the file as blob
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        
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
      handleError(shareError, { context: 'downloadMedia', showToast: false });
    }
    
    // Fallback: Open URL in new window - iOS will show its native preview
    // which allows saving to Photos
    try {
      window.open(url, '_blank');
      toast.info('Long press the image/video to save it');
      return;
    } catch (openError) {
      handleError(openError, { context: 'downloadMedia', toastTitle: 'Unable to download. Try opening in Safari.' });
      return;
    }
  }

  try {
    // Add timeout to prevent hanging downloads
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000); // 15 second timeout

    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();

    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    
    // Programmatic click to trigger download
    link.click();

    // Keep link in DOM briefly to allow download to initiate
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 1500);
    
    // Delay object URL cleanup to avoid interrupting download (give browsers time)
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch { /* intentionally ignored */ }
    }, 10000);

  } catch (error: unknown) {
    if (isAbortError(error)) {
      handleError(error, { context: 'downloadMedia', toastTitle: 'Download timed out. Please try again.' });
      return; // Don't try fallback for timeout
    }

    handleError(error, { context: 'downloadMedia', showToast: false });
    
    // Fallback 1: direct link with download attribute
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
      }, 1500);
    } catch { /* intentionally ignored */ }

    // Fallback 2: window.open (some browsers block programmatic downloads)
    try {
      window.open(url, '_blank');
    } catch { /* intentionally ignored */ }
  }
};

