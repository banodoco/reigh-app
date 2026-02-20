import type React from 'react';
import { cn } from '@/shared/lib/utils';
import type { LayoutProps } from './types';

export function useLayoutProps(
  layout: 'absolute' | 'flow',
  compact: boolean,
  isMobile: boolean,
  leftPercent: number | undefined,
  widthPercent: number | undefined,
): LayoutProps {
  const roundedClass = layout === 'flow' ? 'rounded-md' : 'rounded-lg';
  const flowHeightClass = isMobile ? 'h-12' : compact ? 'h-16' : 'h-18';
  const flowContainerClasses = layout === 'flow' ? cn('w-full', flowHeightClass) : '';

  const adjustedPositionStyle: React.CSSProperties | undefined =
    layout === 'absolute' && leftPercent !== undefined && widthPercent !== undefined
      ? {
          position: 'absolute',
          left: `calc(${leftPercent}% + 2px)`,
          width: `calc(${widthPercent}% - 4px)`,
          top: 0,
          bottom: 0,
        }
      : undefined;

  return { layout, compact, isMobile, roundedClass, flowContainerClasses, adjustedPositionStyle };
}
