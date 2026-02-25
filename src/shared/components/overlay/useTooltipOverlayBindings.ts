import { useManagedTooltipBindings } from '@/shared/components/ui/useManagedTooltipBindings';
import type { OptionalOverlayVisibilityState } from './contracts';
import { useOverlayVisibilityState } from './useOverlayVisibilityState';

interface UseTooltipOverlayBindingsOptions extends OptionalOverlayVisibilityState {
  isMobile: boolean;
  disabled?: boolean;
  onDisabledChange?: (disabled: boolean) => void;
  defaultOpen?: boolean;
  defaultDisabled?: boolean;
}

/**
 * Standard tooltip overlay policy:
 * - shared controlled/uncontrolled open ownership
 * - shared mobile hover/click interaction handling
 */
export function useTooltipOverlayBindings(options: UseTooltipOverlayBindingsOptions) {
  const {
    open,
    onOpenChange,
    isMobile,
    disabled,
    onDisabledChange,
    defaultOpen,
    defaultDisabled,
  } = options;

  const visibility = useOverlayVisibilityState({
    open,
    onOpenChange,
    defaultOpen,
  });

  return useManagedTooltipBindings({
    isMobile,
    open: visibility.open,
    onOpenChange: visibility.onOpenChange,
    disabled,
    onDisabledChange,
    defaultOpen,
    defaultDisabled,
  });
}
