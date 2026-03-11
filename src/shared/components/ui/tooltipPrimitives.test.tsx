import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './tooltipPrimitives';

const providerSpy = vi.fn();
const positionerSpy = vi.fn();

vi.mock('@base-ui/react/tooltip', () => {
  const Provider = ({ delay, children }: { delay?: number; children: React.ReactNode }) => {
    providerSpy(delay);
    return <div data-testid="tooltip-provider">{children}</div>;
  };

  const Root = ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-root">{children}</div>;

  const Trigger = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'> & { render?: React.ReactElement }>(
    ({ render, children, ...props }, ref) => {
      if (render) {
        return React.cloneElement(render, { ...props, ref, 'data-testid': 'tooltip-trigger-as-child' });
      }
      return (
        <button ref={ref} data-testid="tooltip-trigger" {...props}>
          {children}
        </button>
      );
    },
  );
  Trigger.displayName = 'MockTooltipTrigger';

  const Portal = ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-portal">{children}</div>;
  const Positioner = ({
    children,
    sideOffset,
    side,
    align,
    collisionPadding,
  }: {
    children: React.ReactNode;
    sideOffset?: number;
    side?: string;
    align?: string;
    collisionPadding?: number;
  }) => {
    positionerSpy({ sideOffset, side, align, collisionPadding });
    return <div data-testid="tooltip-positioner">{children}</div>;
  };
  const Popup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(({ children, ...props }, ref) => (
    <div ref={ref} data-testid="tooltip-popup" {...props}>
      {children}
    </div>
  ));
  Popup.displayName = 'MockTooltipPopup';

  return {
    Tooltip: {
      Provider,
      Root,
      Trigger,
      Portal,
      Positioner,
      Popup,
    },
  };
});

describe('tooltipPrimitives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires provider delay and renders trigger/content primitives', () => {
    render(
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip body</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
    expect(providerSpy).toHaveBeenCalledWith(250);
    expect(screen.getByTestId('tooltip-root')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-popup')).toBeInTheDocument();
    expect(positionerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sideOffset: 4 }),
    );
  });

  it('supports asChild trigger rendering', () => {
    render(
      <Tooltip>
        <TooltipTrigger asChild>
          <a href="/docs">Docs</a>
        </TooltipTrigger>
      </Tooltip>,
    );

    expect(screen.getByTestId('tooltip-trigger-as-child')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
  });
});
