import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { TimelineItemActionButtons } from './TimelineItemActionButtons';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: ({
    derivedCount,
    unviewedVariantCount,
    hasUnviewedVariants,
    onMarkAllViewed,
  }: {
    derivedCount?: number;
    unviewedVariantCount?: number;
    hasUnviewedVariants?: boolean;
    onMarkAllViewed?: () => void;
  }) => (
    <button
      type="button"
      data-testid="variant-badge"
      data-derived-count={derivedCount ?? 0}
      data-unviewed-count={unviewedVariantCount ?? 0}
      data-has-unviewed={String(Boolean(hasUnviewedVariants))}
      onClick={onMarkAllViewed}
    >
      Variant badge
    </button>
  ),
}));

function createImage(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: 'image-1',
    derivedCount: 3,
    unviewedVariantCount: 2,
    hasUnviewedVariants: true,
    ...overrides,
  } as GenerationRow;
}

function renderSubject(overrides: Partial<React.ComponentProps<typeof TimelineItemActionButtons>> = {}) {
  const buttonClickedRef = { current: false };
  const props: React.ComponentProps<typeof TimelineItemActionButtons> = {
    image: createImage(),
    imageKey: 'image-1',
    isDragging: false,
    readOnly: false,
    isSelected: false,
    isTouchDevice: false,
    onMobileTap: vi.fn(),
    onInpaintClick: vi.fn(),
    onDuplicateClick: vi.fn(),
    onDeleteClick: vi.fn(),
    duplicatingImageId: undefined,
    duplicateSuccessImageId: undefined,
    onMarkAllVariantsViewed: vi.fn(),
    buttonClickedRef,
    scheduleButtonClickReset: vi.fn(),
    ...overrides,
  };

  render(<TimelineItemActionButtons {...props} />);

  return { props, buttonClickedRef };
}

describe('TimelineItemActionButtons', () => {
  it('renders the touch overlay and opens the lightbox on mobile tap', () => {
    const { props } = renderSubject({
      isSelected: true,
      isTouchDevice: true,
    });

    expect(screen.getByText('Tap timeline to place')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Open lightbox'));

    expect(props.onMobileTap).toHaveBeenCalledTimes(1);
  });

  it('hides action buttons while dragging', () => {
    renderSubject({
      isDragging: true,
      isSelected: true,
      isTouchDevice: true,
    });

    expect(screen.queryByTitle('Edit image')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Duplicate image')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Remove from timeline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('variant-badge')).not.toBeInTheDocument();
  });

  it('marks button interactions and forwards action callbacks', () => {
    const { props, buttonClickedRef } = renderSubject();

    fireEvent.mouseDown(screen.getByTitle('Duplicate image'));

    expect(buttonClickedRef.current).toBe(true);
    expect(props.scheduleButtonClickReset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Edit image'));
    fireEvent.click(screen.getByTitle('Duplicate image'));
    fireEvent.click(screen.getByTitle('Remove from timeline'));
    fireEvent.click(screen.getByTestId('variant-badge'));

    expect(props.onInpaintClick).toHaveBeenCalledTimes(1);
    expect(props.onDuplicateClick).toHaveBeenCalledTimes(1);
    expect(props.onDeleteClick).toHaveBeenCalledTimes(1);
    expect(props.onMarkAllVariantsViewed).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Duplicate image')).not.toBeDisabled();
  });
});
