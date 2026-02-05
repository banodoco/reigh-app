import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui-components/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui-components/react/radio"
import { Circle } from "lucide-react"

import { cn } from "@/shared/lib/utils"

const RadioGroup = React.forwardRef<
  HTMLDivElement,
  Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive>, 'onValueChange'> & {
    onValueChange?: (value: string) => void
  }
>(({ className, onValueChange, ...props }, ref) => {
  return (
    <RadioGroupPrimitive
      className={cn("grid gap-2", className)}
      onValueChange={onValueChange ? (value: any) => onValueChange(value as string) : undefined}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = "RadioGroup"

const RadioGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioPrimitive.Root
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 flex items-center justify-center rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
})
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
