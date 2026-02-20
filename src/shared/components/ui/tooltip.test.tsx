import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TouchableTooltip } from './tooltip';

describe('Tooltip', () => {
  it('renders tooltip content when open', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button type="button">Info</button>
          </TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('supports TouchableTooltip wrapper', () => {
    render(
      <TouchableTooltip content="More info">
        <button type="button">Tap me</button>
      </TouchableTooltip>,
    );

    fireEvent.touchEnd(screen.getByRole('button', { name: 'Tap me' }));
    expect(screen.getByText('More info')).toBeInTheDocument();
  });
});
