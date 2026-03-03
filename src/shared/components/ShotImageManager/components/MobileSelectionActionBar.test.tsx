import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileSelectionActionBar } from './MobileSelectionActionBar';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

describe('MobileSelectionActionBar', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof MobileSelectionActionBar>> = {}) {
    return {
      visible: true,
      selectedCount: 2,
      isShotsPaneLocked: true,
      isTasksPaneLocked: true,
      shotsPaneWidth: 240,
      tasksPaneWidth: 180,
      onDeselect: vi.fn(),
      onDelete: vi.fn(),
      canCreateShot: true,
      newShotState: 'idle' as const,
      createdShotId: null,
      onCreateShot: vi.fn(),
      onJumpToShot: vi.fn(),
      ...overrides,
    };
  }

  it('does not render when hidden or no selections exist', () => {
    const { container, rerender } = render(
      <MobileSelectionActionBar {...buildProps({ visible: false })} />,
    );
    expect(container.firstChild).toBeNull();

    rerender(<MobileSelectionActionBar {...buildProps({ selectedCount: 0 })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders labels and pane offsets for multi-select mode', () => {
    const { container } = render(<MobileSelectionActionBar {...buildProps()} />);

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deselect All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete All' })).toBeInTheDocument();

    const fixedContainer = container.querySelector('.fixed') as HTMLDivElement;
    expect(fixedContainer.style.left).toBe('240px');
    expect(fixedContainer.style.right).toBe('180px');
  });

  it('calls action handlers and disables create button while loading', () => {
    const onDeselect = vi.fn();
    const onDelete = vi.fn();
    const onCreateShot = vi.fn();
    render(
      <MobileSelectionActionBar
        {...buildProps({
          onDeselect,
          onDelete,
          onCreateShot,
          newShotState: 'loading',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete All' }));
    expect(onDeselect).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);

    const createButton = screen.getAllByRole('button')[2];
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(onCreateShot).not.toHaveBeenCalled();
  });

  it('shows jump-to-shot action after successful shot creation', () => {
    const onJumpToShot = vi.fn();
    const onCreateShot = vi.fn();
    render(
      <MobileSelectionActionBar
        {...buildProps({
          selectedCount: 1,
          newShotState: 'success',
          createdShotId: 'shot-2',
          onJumpToShot,
          onCreateShot,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Deselect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    const jumpButton = screen.getAllByRole('button')[2];
    fireEvent.click(jumpButton);
    expect(onJumpToShot).toHaveBeenCalledTimes(1);
    expect(onCreateShot).not.toHaveBeenCalled();
  });
});
