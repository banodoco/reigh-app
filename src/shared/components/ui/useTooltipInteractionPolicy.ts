import { useCallback, useState } from 'react';

export interface UseTooltipInteractionPolicyOptions {
  isMobile: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  onDisabledChange?: (disabled: boolean) => void;
  defaultOpen?: boolean;
  defaultDisabled?: boolean;
}

interface TooltipInteractionPolicy {
  open: boolean;
  disabled: boolean;
  isTriggerDisabled: boolean;
  handleTooltipOpenChange: (open: boolean) => void;
  handleTriggerMouseLeave: () => void;
  handleTriggerClick: () => void;
  handleTooltipPointerEnter: () => void;
  handleTooltipPointerLeave: () => void;
}

function useControllableBoolean(
  controlled: boolean | undefined,
  onChange: ((next: boolean) => void) | undefined,
  initialValue: boolean,
): [boolean, (next: boolean) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const value = controlled ?? uncontrolledValue;

  const setValue = useCallback(
    (next: boolean) => {
      if (controlled === undefined) {
        setUncontrolledValue(next);
      }
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [value, setValue];
}

export function useTooltipInteractionPolicy(
  options: UseTooltipInteractionPolicyOptions,
): TooltipInteractionPolicy {
  const {
    isMobile,
    open,
    onOpenChange,
    disabled,
    onDisabledChange,
    defaultOpen = false,
    defaultDisabled = false,
  } = options;

  const [effectiveOpen, setEffectiveOpen] = useControllableBoolean(
    open,
    onOpenChange,
    defaultOpen,
  );
  const [effectiveDisabled, setEffectiveDisabled] = useControllableBoolean(
    disabled,
    onDisabledChange,
    defaultDisabled,
  );

  const handleTooltipOpenChange = useCallback((nextOpen: boolean) => {
    if (effectiveDisabled) {
      return;
    }
    setEffectiveOpen(nextOpen);
  }, [effectiveDisabled, setEffectiveOpen]);

  const handleTriggerMouseLeave = useCallback(() => {
    if (!effectiveDisabled) {
      return;
    }
    setEffectiveDisabled(false);
  }, [effectiveDisabled, setEffectiveDisabled]);

  const handleTriggerClick = useCallback(() => {
    if (!isMobile) {
      return;
    }

    if (effectiveOpen) {
      setEffectiveOpen(false);
      setEffectiveDisabled(false);
      return;
    }

    setEffectiveOpen(true);
    setEffectiveDisabled(true);
  }, [effectiveOpen, isMobile, setEffectiveDisabled, setEffectiveOpen]);

  const handleTooltipPointerEnter = useCallback(() => {
    if (isMobile) {
      return;
    }
    setEffectiveDisabled(true);
    setEffectiveOpen(true);
  }, [isMobile, setEffectiveDisabled, setEffectiveOpen]);

  const handleTooltipPointerLeave = useCallback(() => {
    if (isMobile) {
      return;
    }
    setEffectiveDisabled(false);
    setEffectiveOpen(false);
  }, [isMobile, setEffectiveDisabled, setEffectiveOpen]);

  return {
    open: effectiveOpen,
    disabled: effectiveDisabled,
    isTriggerDisabled: isMobile && effectiveDisabled,
    handleTooltipOpenChange,
    handleTriggerMouseLeave,
    handleTriggerClick,
    handleTooltipPointerEnter,
    handleTooltipPointerLeave,
  };
}
