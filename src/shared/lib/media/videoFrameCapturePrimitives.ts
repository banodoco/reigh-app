interface VideoFrameCaptureElements {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function createVideoFrameCaptureElements(): VideoFrameCaptureElements | null {
  const video = document.createElement('video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  return { video, canvas, ctx };
}

export function configureVideoForFrameCapture(video: HTMLVideoElement, crossOrigin?: string): void {
  if (crossOrigin) {
    video.crossOrigin = crossOrigin;
  }

  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
}
