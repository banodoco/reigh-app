import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentPlaceholder } from './SegmentPlaceholder';

const layoutProps = {
  layout: 'flow' as const,
  compact: false,
  isMobile: false,
  roundedClass: 'rounded-md',
  flowContainerClasses: 'w-full h-16',
  adjustedPositionStyle: undefined,
};

describe('SegmentPlaceholder', () => {
  it('renders pending state and forwards click callback', () => {
    const onOpenPairSettings = vi.fn();

    render(
      <SegmentPlaceholder
        layoutProps={layoutProps}
        isPending
        readOnly={false}
        pairIndex={3}
        onOpenPairSettings={onOpenPairSettings}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /pending/i }));
    expect(onOpenPairSettings).toHaveBeenCalledWith(3);
  });

  it('renders non-interactive read-only placeholder', () => {
    render(
      <SegmentPlaceholder
        layoutProps={layoutProps}
        isPending={false}
        readOnly
        pairIndex={0}
      />,
    );

    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });
});
