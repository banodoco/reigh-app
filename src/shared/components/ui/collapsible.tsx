import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui-components/react/collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Trigger> & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => {
  if (asChild) {
    return <CollapsiblePrimitive.Trigger ref={ref} render={React.Children.only(children) as React.ReactElement} {...props} />
  }
  return <CollapsiblePrimitive.Trigger ref={ref} {...props}>{children}</CollapsiblePrimitive.Trigger>
})
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = CollapsiblePrimitive.Panel

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
