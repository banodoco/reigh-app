import * as React from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui-components/react/toggle-group"
import { Toggle as TogglePrimitive } from "@base-ui-components/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/utils"
import { toggleVariants } from "@/shared/components/ui/toggle"

const toggleGroupVariants = cva(
  "flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "gap-1",
        // Retro style - connected items with shared border
        retro: "gap-0 rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-[#e8e4db] dark:bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)] overflow-hidden",
        "retro-dark": "gap-0 rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)] overflow-hidden",
        zinc: "gap-0 rounded-sm border border-zinc-600 bg-zinc-800 overflow-hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Item variants for when inside a group - no individual borders/shadows
const toggleGroupItemVariants = cva(
  "inline-flex items-center justify-center text-sm font-light transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent hover:bg-muted hover:text-muted-foreground data-[pressed]:bg-accent data-[pressed]:text-accent-foreground",
        retro: "bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb] font-heading tracking-wide hover:bg-[#d8d4cb] dark:hover:bg-[#4a5a5a] data-[pressed]:bg-[#5a7a7a] data-[pressed]:dark:bg-[#6a8a8a] data-[pressed]:text-[#f5f3ed] data-[pressed]:dark:text-[#2d3d3d] data-[pressed]:shadow-sm",
        "retro-dark": "bg-transparent text-[#c8c4bb] font-heading tracking-wide hover:bg-[#4a5a5a] data-[pressed]:bg-[#6a8a8a] data-[pressed]:text-[#2d3d3d] data-[pressed]:shadow-sm",
        zinc: "bg-transparent text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 data-[pressed]:bg-zinc-600 data-[pressed]:text-zinc-100",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5 text-sm",
        lg: "h-11 px-5",
        "retro-sm": "h-9 px-3 text-sm",
        "retro-default": "h-10 px-4 text-base",
        "retro-lg": "h-11 px-5 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ToggleGroupContextValue extends VariantProps<typeof toggleVariants> {
  groupVariant?: VariantProps<typeof toggleGroupVariants>["variant"]
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
  groupVariant: "default",
})

interface ToggleGroupProps
  extends Omit<React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive>, 'value' | 'defaultValue' | 'onValueChange'>,
    VariantProps<typeof toggleGroupVariants> {
  size?: VariantProps<typeof toggleVariants>["size"]
  type?: "single" | "multiple"
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[]) => void
}

const ToggleGroup = React.forwardRef<
  HTMLDivElement,
  ToggleGroupProps
>(({ className, variant, size, children, type = "single", value, defaultValue, onValueChange, ...props }, ref) => {
  // Adapt single/multiple API to Base UI's array-based API
  const multiple = type === "multiple"
  const baseValue = value !== undefined
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : undefined
  const baseDefaultValue = defaultValue !== undefined
    ? (Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : [])
    : undefined

  const handleValueChange = React.useCallback((newValue: string[]) => {
    if (!onValueChange) return
    if (multiple) {
      onValueChange(newValue)
    } else {
      onValueChange(newValue[0] ?? "")
    }
  }, [onValueChange, multiple])

  return (
    <ToggleGroupPrimitive
      ref={ref}
      className={cn(toggleGroupVariants({ variant }), className)}
      multiple={multiple}
      value={baseValue}
      defaultValue={baseDefaultValue}
      onValueChange={handleValueChange}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant: variant as VariantProps<typeof toggleVariants>["variant"], size, groupVariant: variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
})

ToggleGroup.displayName = "ToggleGroup"

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive> &
    VariantProps<typeof toggleVariants>
>(({ className, children, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)
  const groupVariant = context.groupVariant

  // Use group item variants when inside a styled group, otherwise use regular toggle variants
  const isStyledGroup = groupVariant === "retro" || groupVariant === "retro-dark" || groupVariant === "zinc"

  if (isStyledGroup) {
    return (
      <TogglePrimitive
        ref={ref}
        className={cn(
          toggleGroupItemVariants({
            variant: groupVariant as VariantProps<typeof toggleGroupItemVariants>["variant"],
            size: context.size || size,
          }),
          className
        )}
        {...props}
      >
        {children}
      </TogglePrimitive>
    )
  }

  return (
    <TogglePrimitive
      ref={ref}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
})

ToggleGroupItem.displayName = "ToggleGroupItem"

export { ToggleGroup, ToggleGroupItem, toggleGroupVariants, toggleGroupItemVariants }
