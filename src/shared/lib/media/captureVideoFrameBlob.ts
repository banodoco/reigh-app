import {
  configureVideoForFrameCapture,
  createVideoFrameCaptureElements,
} from './videoFrameCapturePrimitives';

interface CaptureVideoFrameBlobOptions {
  source: File | string;
  crossOrigin?: string;
  resolveSeekTime: (video: HTMLVideoElement) => number;
  configureCanvas?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  onVideoError?: (video: HTMLVideoElement) => Error;
  type?: string;
  quality?: number;
}

function resolveVideoSource(source: File | string): { url: string; release: () => void } {
  if (typeof source === 'string') {
    return {
      url: source,
      release: () => {},
    };
  }

  const objectUrl = URL.createObjectURL(source);
  return {
    url: objectUrl,
    release: () => URL.revokeObjectURL(objectUrl),
  };
}

export function captureVideoFrameBlob(options: CaptureVideoFrameBlobOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const captureElements = createVideoFrameCaptureElements();
    if (!captureElements) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    const { video, canvas, ctx } = captureElements;
    const { url, release } = resolveVideoSource(options.source);
    let settled = false;

    configureVideoForFrameCapture(video, options.crossOrigin);

    const cleanup = () => {
      if (typeof video.removeEventListener === 'function') {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
      }
      video.src = '';
      if (typeof video.remove === 'function') {
        video.remove();
      }
      release();
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleLoadedMetadata = () => {
      try {
        if (options.configureCanvas) {
          options.configureCanvas(video, canvas);
        } else {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        video.currentTime = Math.max(0, options.resolveSeekTime(video));
      } catch (error) {
        fail(error);
      }
    };

    const handleSeeked = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fail(new Error('Failed to create blob from canvas'));
              return;
            }

            if (settled) {
              cleanup();
              return;
            }

            settled = true;
            cleanup();
            resolve(blob);
          },
          options.type ?? 'image/jpeg',
          options.quality ?? 0.85,
        );
      } catch (error) {
        fail(error);
      }
    };

    const handleError = () => {
      fail(options.onVideoError?.(video) ?? new Error('Failed to load video'));
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);
    video.src = url;
  });
}
