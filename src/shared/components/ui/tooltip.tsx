import * as React from 'react';
import {
  Tooltip as TooltipPrimitive,
  TooltipContent as TooltipContentPrimitive,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
} from '@/shared/components/ui/tooltipPrimitives';
import { TouchableTooltip } from '@/shared/components/ui/touchableTooltip';

/** Shared app policy for tooltips: short open delay to avoid accidental hover noise. */
const DEFAULT_TOOLTIP_DELAY_MS = 120;

const TooltipProvider: React.FC<{
  delayDuration?: number;
  children: React.ReactNode;
}> = ({ delayDuration = DEFAULT_TOOLTIP_DELAY_MS, children }) => (
  <TooltipProviderPrimitive delayDuration={delayDuration}>
    {children}
  </TooltipProviderPrimitive>
);

const Tooltip: React.FC<React.ComponentProps<typeof TooltipPrimitive>> = (props) => (
  <TooltipPrimitive {...props} />
);

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipTriggerPrimitive>,
  React.ComponentPropsWithoutRef<typeof TooltipTriggerPrimitive>
>((props, ref) => (
  <TooltipTriggerPrimitive ref={ref} {...props} />
));
TooltipTrigger.displayName = 'TooltipTrigger';

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof TooltipContentPrimitive>
>((props, ref) => (
  <TooltipContentPrimitive ref={ref} {...props} />
));
TooltipContent.displayName = 'TooltipContent';

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TouchableTooltip,
};
