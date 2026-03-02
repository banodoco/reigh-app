import { describe, expect, it, vi } from 'vitest';
import { extractFramesFromVideo } from './extractor';

function createReadyVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', {
    value: 4,
    configurable: true,
  });
  Object.defineProperty(video, 'videoWidth', {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(video, 'videoHeight', {
    value: 360,
    configurable: true,
  });
  return video;
}

describe('extractFramesFromVideo', () => {
  it('returns early when cancelled before processing frames', async () => {
    const onPartialFrames = vi.fn();
    const onReady = vi.fn();

    await extractFramesFromVideo({
      video: createReadyVideo(),
      metadata: { total_frames: 100, frame_rate: 25 } as never,
      treatment: 'adjust',
      sourceRange: { start: 0, end: 20 },
      outputFrameCount: 5,
      maxFrames: 10,
      quality: 0.8,
      onPartialFrames,
      onReady,
      isCancelled: () => true,
    });

    expect(onPartialFrames).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('throws for invalid total frame metadata', async () => {
    await expect(
      extractFramesFromVideo({
        video: createReadyVideo(),
        metadata: { total_frames: 0, frame_rate: 25 } as never,
        treatment: 'adjust',
        sourceRange: { start: 0, end: 20 },
        outputFrameCount: 5,
        maxFrames: 10,
        quality: 0.8,
        onPartialFrames: vi.fn(),
        onReady: vi.fn(),
        isCancelled: () => false,
      }),
    ).rejects.toThrow('Invalid total_frames: 0');
  });

  it('throws for invalid frame rate metadata', async () => {
    await expect(
      extractFramesFromVideo({
        video: createReadyVideo(),
        metadata: { total_frames: 100, frame_rate: 0 } as never,
        treatment: 'clip',
        sourceRange: { start: 5, end: 25 },
        outputFrameCount: 5,
        maxFrames: 10,
        quality: 0.8,
        onPartialFrames: vi.fn(),
        onReady: vi.fn(),
        isCancelled: () => false,
      }),
    ).rejects.toThrow('Invalid frame_rate: 0');
  });
});
