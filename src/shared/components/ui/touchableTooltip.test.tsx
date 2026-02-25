import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchableTooltip } from './touchableTooltip';

const handleTriggerClickMock = vi.fn();
const handleTooltipOpenChangeMock = vi.fn();

vi.mock('@/shared/components/ui/useTooltipInteractionPolicy', () => ({
  useTooltipInteractionPolicy: () => ({
    open: true,
    disabled: false,
    isTriggerDisabled: false,
    handleTooltipOpenChange: (...args: unknown[]) => handleTooltipOpenChangeMock(...args),
    handleTriggerMouseLeave: vi.fn(),
    handleTriggerClick: (...args: unknown[]) => handleTriggerClickMock(...args),
    handleTooltipPointerEnter: vi.fn(),
    handleTooltipPointerLeave: vi.fn(),
  }),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ render }: { render: React.ReactElement }) => render,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

describe('TouchableTooltip', () => {
  beforeEach(() => {
    handleTriggerClickMock.mockReset();
    handleTooltipOpenChangeMock.mockReset();
  });

  it('handles touch-end on trigger and preserves child handler', () => {
    const childTouchHandler = vi.fn();
    render(
      <TouchableTooltip content="Tooltip">
        <button onTouchEnd={childTouchHandler}>Open</button>
      </TouchableTooltip>,
    );

    fireEvent.touchEnd(screen.getByRole('button', { name: 'Open' }));

    expect(handleTriggerClickMock).toHaveBeenCalledTimes(1);
    expect(childTouchHandler).toHaveBeenCalledTimes(1);
  });

  it('closes on outside pointer down when open', () => {
    render(
      <TouchableTooltip content="Tooltip">
        <button>Open</button>
      </TouchableTooltip>,
    );

    fireEvent.pointerDown(document.body);
    expect(handleTooltipOpenChangeMock).toHaveBeenCalledWith(false);
  });

  it('does not close when pointer down happens inside tooltip content', () => {
    render(
      <TouchableTooltip content="Tooltip">
        <button>Open</button>
      </TouchableTooltip>,
    );

    fireEvent.pointerDown(screen.getByText('Tooltip'));
    expect(handleTooltipOpenChangeMock).not.toHaveBeenCalledWith(false);
  });
});
