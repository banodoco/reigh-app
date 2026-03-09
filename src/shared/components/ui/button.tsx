import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  BASE_BUTTON_CLASSNAME,
  BASE_BUTTON_SIZES,
  BASE_BUTTON_VARIANTS,
} from "./baseButton";
import { APP_BUTTON_SIZES, APP_BUTTON_VARIANTS } from "./buttonThemeVariants";
import { ButtonPrimitive } from "./buttonPrimitive";

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

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <ButtonPrimitive
        className={buttonVariants({ variant, size, className })}
        asChild={asChild}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
