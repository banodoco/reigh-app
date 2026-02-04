/**
 * Safe area utilities for handling mobile device notches and system UI.
 */

/**
 * Calculate safe area insets for positioning UI elements.
 * Returns CSS calc() values that account for device safe areas.
 */
export function safeAreaCalc(base: string, inset: 'top' | 'bottom' | 'left' | 'right'): string {
  const envVar = `safe-area-inset-${inset}`;
  return `calc(${base} + env(${envVar}, 0px))`;
}

// Object form with helper methods for common calculations
safeAreaCalc.maxHeight = (offset: string, fallback: string): string => {
  return `calc(${fallback} - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${offset})`;
};

safeAreaCalc.verticalCenter = (): string => {
  return `calc(50% + env(safe-area-inset-top, 0px) / 2 - env(safe-area-inset-bottom, 0px) / 2)`;
};

safeAreaCalc.marginBottom = (remOffset: number): string => {
  return `calc(${remOffset}rem + env(safe-area-inset-bottom, 0px))`;
};
