import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SegmentPreviewProps } from './types';
import { SegmentPreview } from './SegmentPreview';

const baseProps: SegmentPreviewProps = {
  layoutProps: {
    layout: 'flow',
    compact: false,
    isMobile: false,
    roundedClass: 'rounded-md',
    flowContainerClasses: 'w-full h-16',
    adjustedPositionStyle: undefined,
  },
  child: {
    id: 'child-1',
    location: '/video.mp4',
    thumbUrl: '/thumb.jpg',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  pairIndex: 0,
  onClick: vi.fn(),
  isDeleting: false,
  isPending: false,
  hasSourceChanged: false,
  scrubbing: {
    isActive: false,
  },
  badge: {
    data: null,
    showNew: false,
    isNewWithNoVariants: false,
    unviewedCount: 0,
    onMarkAllViewed: vi.fn(),
  },
};

describe('SegmentPreview', () => {
  it('renders preview image and calls click/delete handlers', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();

    render(<SegmentPreview {...baseProps} onClick={onClick} onDelete={onDelete} />);

    fireEvent.click(screen.getByAltText('Segment 1'));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete segment/i }));
    expect(onDelete).toHaveBeenCalledWith('child-1');
  });

  it('shows pending indicator when generation is pending', () => {
    render(<SegmentPreview {...baseProps} isPending />);

    expect(screen.getByTitle('A generation is pending')).toBeInTheDocument();
  });
});
