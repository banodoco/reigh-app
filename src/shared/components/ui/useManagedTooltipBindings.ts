import { useMemo } from 'react';
import {
  useTooltipInteractionPolicy,
  type UseTooltipInteractionPolicyOptions,
} from '@/shared/components/ui/useTooltipInteractionPolicy';

interface ManagedTooltipBindings {
  open: boolean;
  isTriggerDisabled: boolean;
  tooltipProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  triggerProps: {
    onMouseLeave: () => void;
    onClick: () => void;
  };
  contentProps: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
}

export function useManagedTooltipBindings(
  options: UseTooltipInteractionPolicyOptions,
): ManagedTooltipBindings {
  const {
    open,
    isTriggerDisabled,
    handleTooltipOpenChange,
    handleTriggerMouseLeave,
    handleTriggerClick,
    handleTooltipPointerEnter,
    handleTooltipPointerLeave,
  } = useTooltipInteractionPolicy(options);

  return useMemo(() => ({
    open,
    isTriggerDisabled,
    tooltipProps: {
      open,
      onOpenChange: handleTooltipOpenChange,
    },
    triggerProps: {
      onMouseLeave: handleTriggerMouseLeave,
      onClick: handleTriggerClick,
    },
    contentProps: {
      onPointerEnter: handleTooltipPointerEnter,
      onPointerLeave: handleTooltipPointerLeave,
    },
  }), [
    open,
    isTriggerDisabled,
    handleTooltipOpenChange,
    handleTriggerMouseLeave,
    handleTriggerClick,
    handleTooltipPointerEnter,
    handleTooltipPointerLeave,
  ]);
}
