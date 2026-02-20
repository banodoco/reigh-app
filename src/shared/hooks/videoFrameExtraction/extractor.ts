import type { VideoMetadata } from '@/shared/lib/videoUploader';

interface SourceRange {
  start: number;
  end: number;
}

interface ExtractFramesInput {
  video: HTMLVideoElement;
  metadata: VideoMetadata;
  treatment: 'adjust' | 'clip';
  sourceRange: SourceRange;
  outputFrameCount: number;
  maxFrames: number;
  quality: number;
  onPartialFrames: (frames: string[]) => void;
  onReady: () => void;
  isCancelled: () => boolean;
}

const FLUSH_INTERVAL = 8;

async function waitForCanPlay(
  video: HTMLVideoElement,
  timeoutMs: number,
): Promise<void> {
  if (video.readyState >= 2) {
    return;
  }

  await new Promise<void>((resolve) => {
    const handleCanPlay = () => {
      video.removeEventListener('canplay', handleCanPlay);
      resolve();
    };

    video.addEventListener('canplay', handleCanPlay);
    setTimeout(() => {
      video.removeEventListener('canplay', handleCanPlay);
      resolve();
    }, timeoutMs);
  });
}

function createCanvas(video: HTMLVideoElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    throw new Error('Video did not load with valid dimensions');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  return { canvas, ctx };
}

function resolveNumFrames(
  treatment: 'adjust' | 'clip',
  outputFrameCount: number,
  sourceFrameCount: number,
  maxFrames: number,
): number {
  const numThumbnails = treatment === 'adjust'
    ? Math.min(outputFrameCount, maxFrames)
    : Math.min(sourceFrameCount, maxFrames);
  return Math.max(1, numThumbnails);
}

function resolveFrameIndex(input: {
  framePosition: number;
  numFrames: number;
  treatment: 'adjust' | 'clip';
  sourceRange: SourceRange;
  sourceFrameCount: number;
}): number {
  const { framePosition, numFrames, treatment, sourceRange, sourceFrameCount } = input;

  let frameIndex: number;
  if (numFrames === 1) {
    frameIndex = sourceRange.start;
  } else if (treatment === 'adjust') {
    frameIndex = sourceRange.start + Math.floor((framePosition / (numFrames - 1)) * (sourceFrameCount - 1));
  } else {
    const sourcePosition = (framePosition / (numFrames - 1)) * (sourceFrameCount - 1);
    frameIndex = sourceRange.start + Math.floor(sourcePosition);
  }

  const clampedFrame = Math.max(sourceRange.start, Math.min(frameIndex, sourceRange.end - 1));
  if (!Number.isFinite(clampedFrame) || clampedFrame < 0) {
    throw new Error(`Invalid frame index: ${clampedFrame}`);
  }
  return clampedFrame;
}

async function waitForSeek(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked);
      resolve();
    };

    video.addEventListener('seeked', handleSeeked);
    setTimeout(() => {
      video.removeEventListener('seeked', handleSeeked);
      resolve();
    }, timeoutMs);
  });
}

export async function extractFramesFromVideo(input: ExtractFramesInput): Promise<void> {
  const {
    video,
    metadata,
    treatment,
    sourceRange,
    outputFrameCount,
    maxFrames,
    quality,
    onPartialFrames,
    onReady,
    isCancelled,
  } = input;

  await waitForCanPlay(video, 3000);
  if (isCancelled()) {
    return;
  }

  if (!metadata.total_frames || metadata.total_frames < 1) {
    throw new Error(`Invalid total_frames: ${metadata.total_frames}`);
  }

  if (!metadata.frame_rate || metadata.frame_rate <= 0 || !Number.isFinite(metadata.frame_rate)) {
    throw new Error(`Invalid frame_rate: ${metadata.frame_rate}`);
  }

  const { canvas, ctx } = createCanvas(video);
  const sourceFrameCount = Math.max(0, sourceRange.end - sourceRange.start);
  const numFrames = resolveNumFrames(treatment, outputFrameCount, sourceFrameCount, maxFrames);
  const extractedFrames: string[] = [];

  for (let i = 0; i < numFrames; i++) {
    if (isCancelled()) {
      return;
    }

    const frameIndex = resolveFrameIndex({
      framePosition: i,
      numFrames,
      treatment,
      sourceRange,
      sourceFrameCount,
    });

    const timeInSeconds = frameIndex / metadata.frame_rate;
    if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
      throw new Error(`Invalid time value: ${timeInSeconds}`);
    }

    video.currentTime = timeInSeconds;
    await waitForSeek(video, 1000);

    if (isCancelled()) {
      return;
    }

    ctx.drawImage(video, 0, 0);
    extractedFrames.push(canvas.toDataURL('image/jpeg', quality));

    if (i === 0 || (i + 1) % FLUSH_INTERVAL === 0) {
      onPartialFrames([...extractedFrames]);
      onReady();
    }
  }

  if (!isCancelled() && extractedFrames.length > 0) {
    onPartialFrames(extractedFrames);
    onReady();
  }
}
