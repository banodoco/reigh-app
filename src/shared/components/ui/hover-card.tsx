import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/shared/components/ui/contracts/cn"

const HoverCard = PreviewCardPrimitive.Root

const HoverCardTrigger = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<typeof PreviewCardPrimitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => {
  if (asChild) {
    return <PreviewCardPrimitive.Trigger ref={ref} render={React.Children.only(children) as React.ReactElement} {...props} />
  }
  return <PreviewCardPrimitive.Trigger ref={ref} {...props}>{children}</PreviewCardPrimitive.Trigger>
})
HoverCardTrigger.displayName = "HoverCardTrigger"

const HoverCardContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof PreviewCardPrimitive.Popup> & {
    align?: "start" | "center" | "end"
    side?: "top" | "bottom" | "left" | "right"
    sideOffset?: number
    usePortal?: boolean
  }
>(({ className, align = "center", sideOffset = 4, usePortal: _usePortal, side, ...props }, ref) => (
  <PreviewCardPrimitive.Portal>
    <PreviewCardPrimitive.Positioner
      side={side}
      align={align}
      sideOffset={sideOffset}
      className="z-[100001]"
    >
      <PreviewCardPrimitive.Popup
        ref={ref}
        className={cn(
          "w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[open]:animate-in data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[open]:fade-in-0 data-[ending-style]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PreviewCardPrimitive.Positioner>
  </PreviewCardPrimitive.Portal>
))
HoverCardContent.displayName = "HoverCardContent"

export { HoverCard, HoverCardTrigger, HoverCardContent }
