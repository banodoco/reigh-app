// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentThumbnail } from './SegmentThumbnail';

const useVideoPortionFrameExtraction = vi.fn();

vi.mock('../hooks/useVideoFrameExtraction', () => ({
  useVideoPortionFrameExtraction: (...args: unknown[]) =>
    useVideoPortionFrameExtraction(...args),
}));

describe('SegmentThumbnail', () => {
  it('renders the loading canvas state for small thumbnails', () => {
    useVideoPortionFrameExtraction.mockReturnValue({
      canvasRef: { current: null },
      loaded: false,
      error: false,
      canvasWidth: 48,
      canvasHeight: 27,
    });

    const { container } = render(
      <SegmentThumbnail videoUrl="video.mp4" time={1.5} />,
    );
    const canvas = container.querySelector('canvas');

    expect(useVideoPortionFrameExtraction).toHaveBeenCalledWith({
      videoUrl: 'video.mp4',
      time: 1.5,
      size: 'small',
    });
    expect(canvas?.getAttribute('width')).toBe('48');
    expect(canvas?.className).toContain('w-8 h-auto');
    expect(canvas?.className).toContain('animate-pulse');
  });

  it('renders large thumbnails with aspect ratio and error styling', () => {
    useVideoPortionFrameExtraction.mockReturnValue({
      canvasRef: { current: null },
      loaded: false,
      error: true,
      canvasWidth: 160,
      canvasHeight: 90,
    });

    const { container } = render(
      <SegmentThumbnail videoUrl="video.mp4" time={3} size="large" />,
    );
    const canvas = container.querySelector('canvas');

    expect(canvas?.getAttribute('height')).toBe('90');
    expect(canvas?.className).toContain('w-full h-auto');
    expect(canvas?.className).toContain('bg-destructive/20');
    expect(canvas?.getAttribute('style')).toContain('aspect-ratio: 160 / 90');
  });
});
