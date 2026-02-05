import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui-components/react/checkbox"
import { Check } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const checkboxVariants = cva(
  "peer flex items-center justify-center shrink-0 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "h-4 w-4 rounded-sm border border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        // Retro style - blocky, offset shadow when checked
        retro: "h-4 w-4 rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-[#f5f3ed] dark:bg-[#2d3d3d] data-[checked]:bg-[#5a7a7a] data-[checked]:dark:bg-[#6a8a8a] data-[checked]:text-[#f5f3ed] data-[checked]:dark:text-[#2d3d3d] data-[checked]:shadow-[-1px_1px_0_0_rgba(106,138,138,0.3)] dark:data-[checked]:shadow-[-1px_1px_0_0_rgba(20,30,30,0.5)]",
        // Retro dark - for always-dark contexts
        "retro-dark": "h-4 w-4 rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] data-[checked]:bg-[#6a8a8a] data-[checked]:text-[#2d3d3d] data-[checked]:shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)]",
        // Zinc - for dark panes
        zinc: "h-4 w-4 rounded-sm border border-zinc-600 bg-zinc-800 data-[checked]:bg-zinc-500 data-[checked]:text-zinc-100",
      },
      size: {
        default: "",
        sm: "!h-3.5 !w-3.5",
        lg: "!h-5 !w-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'onCheckedChange'>,
    VariantProps<typeof checkboxVariants> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<
  HTMLSpanElement,
  CheckboxProps
>(({ className, variant, size, onCheckedChange, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ variant, size, className }))}
    onCheckedChange={onCheckedChange ? (checked: boolean) => onCheckedChange(checked) : undefined}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className={cn("h-4 w-4", size === "sm" && "h-3 w-3", size === "lg" && "h-4.5 w-4.5")} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = "Checkbox"

export { Checkbox, checkboxVariants }
