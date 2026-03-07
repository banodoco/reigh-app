import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentProcessing } from './SegmentProcessing';

const layoutProps = {
  layout: 'flow' as const,
  compact: false,
  isMobile: false,
  roundedClass: 'rounded-md',
  flowContainerClasses: 'w-full h-16',
  adjustedPositionStyle: undefined,
};

describe('SegmentProcessing', () => {
  it('renders processing state when pending', () => {
    render(
      <SegmentProcessing
        layoutProps={layoutProps}
        isPending
        pairIndex={0}
      />,
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('renders regenerate CTA when not pending and calls callback', () => {
    const onOpenPairSettings = vi.fn();

    render(
      <SegmentProcessing
        layoutProps={layoutProps}
        isPending={false}
        pairIndex={1}
        onOpenPairSettings={onOpenPairSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onOpenPairSettings).toHaveBeenCalledWith(1);
  });
});
