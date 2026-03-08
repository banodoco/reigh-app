import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomTooltip } from './CustomTooltip';

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    continuous: true,
    index: 0,
    size: 3,
    step: {
      title: 'Welcome Tour',
      content: 'This is the first step.',
      target: 'body',
      placement: 'bottom',
    },
    backProps: { onClick: vi.fn() },
    primaryProps: { onClick: vi.fn() },
    skipProps: { onClick: vi.fn() },
    tooltipProps: { 'data-testid': 'tour-tooltip' },
    isLastStep: false,
    ...overrides,
  };
}

describe('CustomTooltip', () => {
  it('renders first-step content with Skip and Next actions', () => {
    const props = buildProps();
    const { container } = render(<CustomTooltip {...(props as never)} />);

    expect(screen.getByTestId('tour-tooltip')).toBeInTheDocument();
    expect(screen.getByText('Welcome Tour')).toBeInTheDocument();
    expect(screen.getByText('This is the first step.')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    const activeDots = container.querySelectorAll('.bg-primary');
    expect(activeDots).toHaveLength(1);
  });

  it('renders Back for non-first steps and calls navigation handlers', () => {
    const backClick = vi.fn();
    const nextClick = vi.fn();

    render(
      <CustomTooltip
        {...(buildProps({ index: 1, backProps: { onClick: backClick }, primaryProps: { onClick: nextClick } }) as never)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(backClick).toHaveBeenCalledTimes(1);
    expect(nextClick).toHaveBeenCalledTimes(1);
  });

  it('shows Done on the last step and hides primary action when not continuous', () => {
    const { rerender } = render(
      <CustomTooltip
        {...(buildProps({ index: 2, isLastStep: true, size: 4 }) as never)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    rerender(<CustomTooltip {...(buildProps({ continuous: false }) as never)} />);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });

  it('supports high index values by falling back to a default icon without crashing', () => {
    render(
      <CustomTooltip
        {...(buildProps({ index: 99, size: 100, step: { title: 'Final', content: 'Fallback icon path', target: 'body', placement: 'bottom' } }) as never)}
      />,
    );

    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(screen.getByText('Fallback icon path')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
