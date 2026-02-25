import * as React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltipPrimitives';
import { useTooltipInteractionPolicy } from '@/shared/components/ui/useTooltipInteractionPolicy';

/**
 * Touch-aware tooltip that works on both desktop (hover) and touch devices (tap).
 */
interface TouchableTooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  contentClassName?: string;
}

export const TouchableTooltip: React.FC<TouchableTooltipProps> = ({
  children,
  content,
  side = 'bottom',
  className,
  contentClassName,
}) => {
  const {
    open,
    handleTooltipOpenChange,
    handleTriggerClick,
  } = useTooltipInteractionPolicy({ isMobile: true });
  const contentRef = React.useRef<HTMLDivElement>(null);

  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleTriggerClick();
  }, [handleTriggerClick]);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (!nextOpen && contentRef.current?.matches(':hover')) return;
    handleTooltipOpenChange(nextOpen);
  }, [handleTooltipOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (contentRef.current?.contains(event.target as Node)) return;
      handleTooltipOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, handleTooltipOpenChange]);

  const child = React.Children.only(children);
  const triggerElement = React.cloneElement(child, {
    onTouchEnd: (event: React.TouchEvent) => {
      handleTouchEnd(event);
      child.props.onTouchEnd?.(event);
    },
    className: cn(child.props.className, className),
  });

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger render={triggerElement} />
        <TooltipContent side={side} className="p-0">
          <div
            ref={contentRef}
            className={cn('px-3 py-1.5', contentClassName)}
            onMouseLeave={() => handleTooltipOpenChange(false)}
          >
            {content}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
