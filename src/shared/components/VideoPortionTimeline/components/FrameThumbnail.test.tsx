import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { FrameThumbnail } from './FrameThumbnail';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

function createVideoElementMock({ duration = 10, readyState = 2 }: { duration?: number; readyState?: number } = {}) {
  const video = document.createElement('video');
  Object.defineProperty(video, 'duration', { value: duration, writable: true, configurable: true });
  Object.defineProperty(video, 'readyState', { value: readyState, writable: true, configurable: true });
  Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true });
  const load = vi.fn();
  Object.defineProperty(video, 'load', { value: load, configurable: true });
  return { video, load };
}

describe('FrameThumbnail', () => {
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captures a frame on seeked and clears loading style', () => {
    const { video, load } = createVideoElementMock({ duration: 12, readyState: 3 });
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'video') return video;
      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);

    const { container } = render(<FrameThumbnail videoUrl="https://cdn.example.com/video.mp4" time={3} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    act(() => {
      video.dispatchEvent(new Event('loadeddata'));
    });
    expect(video.currentTime).toBe(3);

    act(() => {
      video.dispatchEvent(new Event('seeked'));
    });

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 48, 27);
    expect(canvas.className).not.toContain('bg-white/10');
    expect(load).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith('video');
  });

  it('clamps seek time when requested time exceeds duration', () => {
    const { video } = createVideoElementMock({ duration: 5, readyState: 3 });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'video') return video;
      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    });

    render(<FrameThumbnail videoUrl="https://cdn.example.com/video.mp4" time={20} />);
    video.dispatchEvent(new Event('loadeddata'));

    expect(video.currentTime).toBe(4.9);
  });

  it('reports capture and load errors through runtime error presenter', () => {
    const { video } = createVideoElementMock({ duration: 8, readyState: 3 });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'video') return video;
      return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
    });
    const drawError = new Error('draw failed');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(() => {
        throw drawError;
      }),
    } as unknown as CanvasRenderingContext2D);

    render(<FrameThumbnail videoUrl="https://cdn.example.com/video.mp4" time={2} />);

    act(() => {
      video.dispatchEvent(new Event('loadeddata'));
      video.dispatchEvent(new Event('seeked'));
      video.dispatchEvent(new Event('error'));
    });

    expect(normalizeAndPresentError).toHaveBeenCalledWith(drawError, { context: 'FrameThumbnail.captureFrame' });
    expect(normalizeAndPresentError).toHaveBeenCalledWith(expect.any(Error), { context: 'FrameThumbnail' });
  });
});
