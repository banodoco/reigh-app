import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SegmentSlot } from '@/shared/hooks/segments/useSegmentOutputsForShot';
import type { GenerationRow } from '@/domains/generation/types';
import { InlineSegmentVideo } from '../InlineSegmentVideo';

vi.mock('@/shared/hooks/useVariantBadges', () => ({
  useVariantBadges: () => ({ getBadgeData: () => null }),
}));

vi.mock('@/shared/hooks/useMarkVariantViewed', () => ({
  useMarkVariantViewed: () => ({ markAllViewed: vi.fn() }),
}));

const placeholderSlot: SegmentSlot = {
  type: 'placeholder',
  index: 0,
};

const childGeneration: GenerationRow = {
  id: 'child-1',
  location: 'https://example.com/video.mp4',
  thumbUrl: 'https://example.com/thumb.jpg',
  created_at: '2026-01-01T00:00:00.000Z',
};

const childSlot: SegmentSlot = {
  type: 'child',
  child: childGeneration,
  index: 0,
};

describe('InlineSegmentVideo', () => {
  it('renders generate CTA for placeholder slot and opens pair settings', () => {
    const onOpenPairSettings = vi.fn();

    render(
      <InlineSegmentVideo
        slot={placeholderSlot}
        pairIndex={2}
        onClick={vi.fn()}
        layout="flow"
        onOpenPairSettings={onOpenPairSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    expect(onOpenPairSettings).toHaveBeenCalledWith(2);
  });

  it('renders processing state for child without output when pending', () => {
    const processingSlot: SegmentSlot = {
      type: 'child',
      child: { ...childGeneration, location: null },
      index: 1,
    };

    render(
      <InlineSegmentVideo
        slot={processingSlot}
        pairIndex={1}
        onClick={vi.fn()}
        isPending
      />,
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('renders preview for child output and dispatches callbacks', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();

    render(
      <InlineSegmentVideo
        slot={childSlot}
        pairIndex={0}
        onClick={onClick}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByAltText('Segment 1'));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /delete segment/i }));
    fireEvent.click(screen.getByRole('button', { name: /click again to confirm/i }));
    expect(onDelete).toHaveBeenCalledWith('child-1');
  });
});
