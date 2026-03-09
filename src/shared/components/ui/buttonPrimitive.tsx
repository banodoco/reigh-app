import * as React from 'react';
import { Slot } from './Slot';
import { cn } from './contracts/cn';

interface ButtonPrimitiveProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const ButtonPrimitive = React.forwardRef<HTMLButtonElement, ButtonPrimitiveProps>(
  ({ asChild = false, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(className)} ref={ref} {...props} />;
  }
);

ButtonPrimitive.displayName = 'ButtonPrimitive';
