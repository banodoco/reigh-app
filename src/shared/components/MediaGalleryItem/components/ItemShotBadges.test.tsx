import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemShotBadges } from './ItemShotBadges';

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: () => <div data-testid="variant-badge" />,
}));

describe('ItemShotBadges', () => {
  it('returns null when video badge criteria are not met', () => {
    const { container } = render(
      <ItemShotBadges
        {...({
          image: {
            name: '',
            shot_id: null,
            derivedCount: 0,
            unviewedVariantCount: 0,
            hasUnviewedVariants: false,
          },
          isVideoContent: false,
          simplifiedShotOptions: [],
          onMarkAllVariantsViewed: vi.fn(),
          onNavigateToShot: vi.fn(),
        } as never)}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders name, variant badge, and shot navigation button for video content', () => {
    const onNavigateToShot = vi.fn();

    render(
      <ItemShotBadges
        {...({
          image: {
            name: 'Bridge Clip',
            shot_id: 'shot-2',
            derivedCount: 3,
            unviewedVariantCount: 1,
            hasUnviewedVariants: true,
          },
          isVideoContent: true,
          simplifiedShotOptions: [{ id: 'shot-2', name: 'Second Shot' }],
          onMarkAllVariantsViewed: vi.fn(),
          onNavigateToShot,
        } as never)}
      />,
    );

    expect(screen.getByText('Bridge Clip')).toBeInTheDocument();
    expect(screen.getByTestId('variant-badge')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Second Shot/ }));
    expect(onNavigateToShot).toHaveBeenCalledWith('shot-2');
  });

  it('falls back to unknown shot label when shot id is missing from options', () => {
    render(
      <ItemShotBadges
        {...({
          image: {
            name: '',
            shot_id: 'shot-missing',
            derivedCount: 1,
            unviewedVariantCount: 0,
            hasUnviewedVariants: false,
          },
          isVideoContent: true,
          simplifiedShotOptions: [{ id: 'shot-1', name: 'First Shot' }],
          onMarkAllVariantsViewed: vi.fn(),
          onNavigateToShot: vi.fn(),
        } as never)}
      />,
    );

    expect(screen.getByRole('button', { name: /Unknown Shot/ })).toBeInTheDocument();
  });
});
