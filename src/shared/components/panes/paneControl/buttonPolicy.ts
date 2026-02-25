import type { PaneSide } from '@/shared/config/panes';

export type PaneControlButtonType = 'third' | 'fourth' | 'lock' | 'unlock' | 'open';

interface PaneControlButtonPolicyInput {
  side: PaneSide;
  isLocked: boolean;
  isOpen: boolean;
  allowMobileLock: boolean;
  useDesktopBehavior: boolean;
  hasThirdButton: boolean;
  hasFourthButton: boolean;
}

export function getPaneControlButtons(input: PaneControlButtonPolicyInput): PaneControlButtonType[] {
  const {
    side,
    isLocked,
    isOpen,
    allowMobileLock,
    useDesktopBehavior,
    hasThirdButton,
    hasFourthButton,
  } = input;
  const isBottom = side === 'bottom';

  if (!useDesktopBehavior) {
    if (!isBottom) {
      return hasThirdButton ? ['third'] : [];
    }

    if (allowMobileLock) {
      if (isLocked) return ['third', 'unlock', 'fourth'];
      if (isOpen) return ['third', 'lock', 'fourth'];
      return ['third', 'lock', 'open'];
    }

    if (isOpen) return [];
    return ['third', 'open', 'fourth'];
  }

  if (isLocked) {
    return isBottom ? ['third', 'unlock', 'fourth'] : ['third', 'unlock'];
  }

  if (isOpen) {
    return isBottom ? ['third', 'lock', 'fourth'] : ['third', 'lock'];
  }

  return isBottom ? ['third', 'lock', 'open'] : ['third', 'lock'];
}
