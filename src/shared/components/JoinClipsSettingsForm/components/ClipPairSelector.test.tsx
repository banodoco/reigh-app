import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClipPairInfo } from '@/shared/components/JoinClipsSettingsForm/types';
import { ClipPairSelector } from './ClipPairSelector';

vi.mock('lucide-react', () => ({
  Film: () => <svg data-testid="film-icon" />,
}));

describe('ClipPairSelector', () => {
  it('returns null when selected pair index is out of bounds', () => {
    const { container } = render(
      <ClipPairSelector
        clipPairs={[]}
        selectedPairIndex={3}
        onPairSelect={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows pair selector buttons and calls onPairSelect when multiple pairs exist', () => {
    const onPairSelect = vi.fn();
    const clipPairs: ClipPairInfo[] = [
      {
        pairIndex: 0,
        clipA: { name: 'clip-a1', frameCount: 24, finalFrameUrl: 'https://assets/a1.png' },
        clipB: { name: 'clip-b1', frameCount: 24, posterUrl: 'https://assets/b1.png' },
      },
      {
        pairIndex: 1,
        clipA: { name: 'clip-a2', frameCount: 30, finalFrameUrl: undefined },
        clipB: { name: 'clip-b2', frameCount: 30, posterUrl: undefined },
      },
    ];

    render(
      <ClipPairSelector
        clipPairs={clipPairs}
        selectedPairIndex={1}
        onPairSelect={onPairSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pair 1' }));
    expect(onPairSelect).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: 'Pair 2' })).toBeInTheDocument();
    expect(screen.getAllByTestId('film-icon')).toHaveLength(2);
  });

  it('renders selected pair thumbnail images when urls are provided', () => {
    const clipPairs: ClipPairInfo[] = [
      {
        pairIndex: 0,
        clipA: { name: 'clip-a', frameCount: 12, finalFrameUrl: 'https://assets/final-a.png' },
        clipB: { name: 'clip-b', frameCount: 12, posterUrl: 'https://assets/poster-b.png' },
      },
    ];

    render(
      <ClipPairSelector
        clipPairs={clipPairs}
        selectedPairIndex={0}
        onPairSelect={vi.fn()}
      />,
    );

    const clipAImage = screen.getByAltText('clip-a');
    const clipBImage = screen.getByAltText('clip-b');

    expect(clipAImage).toHaveAttribute('src', 'https://assets/final-a.png');
    expect(clipBImage).toHaveAttribute('src', 'https://assets/poster-b.png');
    expect(screen.queryByTestId('film-icon')).not.toBeInTheDocument();
  });
});
