import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui-components/react/tooltip"
import { cn } from "@/shared/lib/utils"

const TooltipProvider: React.FC<{ delayDuration?: number; children: React.ReactNode }> = ({ delayDuration = 0, children }) => (
  <TooltipPrimitive.Provider delay={delayDuration}>
    {children}
  </TooltipPrimitive.Provider>
)

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => {
  if (asChild) {
    return <TooltipPrimitive.Trigger ref={ref} render={React.Children.only(children) as React.ReactElement} {...props} />
  }
  return <TooltipPrimitive.Trigger ref={ref} {...props}>{children}</TooltipPrimitive.Trigger>
})
TooltipTrigger.displayName = "TooltipTrigger"

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> & {
    sideOffset?: number
    side?: "top" | "bottom" | "left" | "right"
    onPointerDownOutside?: () => void
  }
>(({ className, sideOffset = 4, side, onPointerDownOutside, ...props }, ref) => {
  // Handle outside pointer down for touch tooltip behavior
  React.useEffect(() => {
    if (!onPointerDownOutside) return
    const handler = (e: PointerEvent) => {
      onPointerDownOutside()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onPointerDownOutside])

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="z-[100010]">
        <TooltipPrimitive.Popup
          ref={ref}
          className={cn(
            "overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
            "animate-in fade-in-0 zoom-in-95 duration-200 ease-out",
            "data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[ending-style]:zoom-out-95 data-[ending-style]:duration-150 data-[ending-style]:ease-in",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = "TooltipContent"

/**
 * Touch-aware tooltip that works on both desktop (hover) and touch devices (tap).
 */
interface TouchableTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  contentClassName?: string;
}

const TouchableTooltip: React.FC<TouchableTooltipProps> = ({
  children,
  content,
  side = 'bottom',
  className,
  contentClassName,
}) => {
  const [open, setOpen] = React.useState(false);

  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(prev => !prev);
  }, []);

  const child = React.Children.only(children) as React.ReactElement;
  const triggerElement = React.cloneElement(child, {
    onTouchEnd: (e: React.TouchEvent) => {
      handleTouchEnd(e);
      child.props.onTouchEnd?.(e);
    },
    className: cn(child.props.className, className),
  });

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={triggerElement}
        />
        <TooltipContent
          side={side}
          className={contentClassName}
          onPointerDownOutside={() => setOpen(false)}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TouchableTooltip }
