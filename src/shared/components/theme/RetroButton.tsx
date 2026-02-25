import * as React from 'react';
import { Button as CoreButton } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import {
  isRetroButtonSize,
  isRetroButtonVariant,
  retroButtonPolicy,
  type RetroButtonSize,
  type RetroButtonVariant,
} from '@/shared/components/theme/retroButtonPolicy';

type CoreButtonProps = React.ComponentProps<typeof CoreButton>;
type CoreVariant = CoreButtonProps['variant'];
type CoreSize = CoreButtonProps['size'];
type ThemedVariant = CoreVariant | RetroButtonVariant;
type ThemedSize = CoreSize | RetroButtonSize;

interface RetroButtonProps extends Omit<CoreButtonProps, 'variant' | 'size'> {
  variant?: ThemedVariant;
  size?: ThemedSize;
}

const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const usesRetroPolicy = isRetroButtonVariant(variant) || isRetroButtonSize(size);
    const coreVariant: CoreVariant = usesRetroPolicy
      ? 'ghost'
      : (variant as CoreVariant);
    const coreSize: CoreSize = usesRetroPolicy
      ? 'default'
      : (size as CoreSize);
    const retroClassName = usesRetroPolicy
      ? retroButtonPolicy({
          variant: isRetroButtonVariant(variant) ? variant : 'retro',
          size: isRetroButtonSize(size) ? size : 'retro-default',
        })
      : undefined;

    return (
      <CoreButton
        ref={ref}
        variant={coreVariant}
        size={coreSize}
        className={cn(retroClassName, className)}
        {...props}
      />
    );
  },
);
RetroButton.displayName = 'RetroButton';

// Backwards-compatible alias for files that import { Button }.
const Button = RetroButton;

export { RetroButton, Button };
