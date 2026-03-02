import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewTogetherThumbnails } from './PreviewTogetherThumbnails';
import type { PreviewSegment } from './PreviewTogetherTypes';

function buildSegments(): PreviewSegment[] {
  return [
    {
      index: 0,
      hasVideo: true,
      videoUrl: 'https://cdn.example.com/video-1.mp4',
      thumbUrl: 'https://cdn.example.com/thumb-1.jpg',
      startImageUrl: 'https://cdn.example.com/start-1.jpg',
      endImageUrl: null,
      durationFromFrames: 2,
    },
    {
      index: 1,
      hasVideo: false,
      videoUrl: null,
      thumbUrl: null,
      startImageUrl: 'https://cdn.example.com/start-2.jpg',
      endImageUrl: 'https://cdn.example.com/end-2.jpg',
      durationFromFrames: 3,
    },
  ];
}

describe('PreviewTogetherThumbnails', () => {
  it('renders active state, image fallback, and image-only badge', () => {
    const previewThumbnailsRef = { current: null } as React.MutableRefObject<HTMLDivElement | null>;

    const { container } = render(
      <PreviewTogetherThumbnails
        previewableSegments={buildSegments()}
        safeIndex={1}
        previewThumbnailsRef={previewThumbnailsRef}
        onSelectSegment={vi.fn()}
      />,
    );

    expect(previewThumbnailsRef.current).toBeTruthy();

    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).toContain('opacity-60');
    expect(buttons[1].className).toContain('ring-2');

    const images = container.querySelectorAll('img');
    expect(images[0].getAttribute('src')).toContain('thumb-1.jpg');
    expect(images[1].getAttribute('src')).toContain('start-2.jpg');
    expect(screen.getByText('IMG')).toBeInTheDocument();
  });

  it('calls onSelectSegment with thumbnail index on click', () => {
    const onSelectSegment = vi.fn();

    render(
      <PreviewTogetherThumbnails
        previewableSegments={buildSegments()}
        safeIndex={0}
        previewThumbnailsRef={{ current: null }}
        onSelectSegment={onSelectSegment}
      />,
    );

    fireEvent.click(screen.getByLabelText('Go to segment 2'));
    expect(onSelectSegment).toHaveBeenCalledWith(1);
  });
});
