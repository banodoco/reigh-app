import { uploadBlobToStorage } from '@/shared/lib/imageUploader';
import { extractVideoFinalFrame, extractVideoPosterFrame } from '@/shared/lib/videoPosterExtractor';
import { uploadVideoToStorage } from '@/shared/lib/videoUploader';

interface UploadVideoResult {
  videoUrl: string;
  posterUrl: string;
  finalFrameUrl: string;
  durationSeconds: number;
}

/** Create a throwaway <video> to read duration from a File (revokes the object URL). */
function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise<number>(resolve => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.onloadedmetadata = () => {
      resolve(videoElement.duration);
      URL.revokeObjectURL(videoElement.src);
    };
    videoElement.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(videoElement.src);
    };
    videoElement.src = URL.createObjectURL(file);
  });
}

export async function uploadClipVideo(
  file: File,
): Promise<UploadVideoResult> {
  const [posterBlob, finalFrameBlob, durationSeconds] = await Promise.all([
    extractVideoPosterFrame(file),
    extractVideoFinalFrame(file),
    getVideoDurationFromFile(file),
  ]);

  const [videoUrl, posterUrl, finalFrameUrl] = await Promise.all([
    uploadVideoToStorage(file, {
      maxRetries: 3,
      timeoutMs: 300000,
    }),
    uploadBlobToStorage(posterBlob, 'poster.jpg', 'image/jpeg', {
      maxRetries: 2,
      timeoutMs: 30000,
    }),
    uploadBlobToStorage(finalFrameBlob, 'final-frame.jpg', 'image/jpeg', {
      maxRetries: 2,
      timeoutMs: 30000,
    }),
  ]);

  return { videoUrl, posterUrl, finalFrameUrl, durationSeconds };
}
