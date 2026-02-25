import * as React from "react";
import { Slot } from "@/shared/components/ui/Slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from '@/shared/components/ui/contracts/cn';
import {
  BASE_BUTTON_CLASSNAME,
  BASE_BUTTON_SIZES,
  BASE_BUTTON_VARIANTS,
} from "@/shared/components/ui/baseButton";
import { APP_BUTTON_SIZES, APP_BUTTON_VARIANTS } from "@/shared/components/ui/buttonThemeVariants";

/** App-facing themed button contract. */
const buttonVariants = cva(
  BASE_BUTTON_CLASSNAME,
  {
    variants: {
      variant: {
        ...BASE_BUTTON_VARIANTS,
        ...APP_BUTTON_VARIANTS,
      },
      size: {
        ...BASE_BUTTON_SIZES,
        ...APP_BUTTON_SIZES,
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
