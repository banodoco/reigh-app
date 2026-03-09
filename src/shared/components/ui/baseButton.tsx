import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ButtonPrimitive } from "./buttonPrimitive";

/** @uiContract Theme-agnostic base button primitive. */
export const BASE_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-light ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

export const BASE_BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
} as const;

export const BASE_BUTTON_SIZES = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
} as const;

const baseButtonVariants = cva(
  BASE_BUTTON_CLASSNAME,
  {
    variants: {
      variant: BASE_BUTTON_VARIANTS,
      size: BASE_BUTTON_SIZES,
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface BaseButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof baseButtonVariants> {
  asChild?: boolean;
}

export const BaseButton = React.forwardRef<HTMLButtonElement, BaseButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <ButtonPrimitive
        className={baseButtonVariants({ variant, size, className })}
        asChild={asChild}
        ref={ref}
        {...props}
      />
    );
  },
);
BaseButton.displayName = "BaseButton";
