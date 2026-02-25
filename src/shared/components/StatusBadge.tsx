/**
 * StatusBadge - Generic colored badge with touch-friendly tooltip
 *
 * Used for status indicators like "NEW", "Enhanced", etc.
 * Works on both desktop (hover) and touch devices (tap).
 */

import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { TouchableTooltip } from '@/shared/components/ui/touchableTooltip';
import { TextAction } from '@/shared/components/ui/text-action';

const colorVariants = {
  yellow: 'bg-yellow-500 text-black hover:bg-yellow-400',
  green: 'bg-green-500 text-white hover:bg-green-400',
  blue: 'bg-blue-500 text-white hover:bg-blue-400',
  red: 'bg-red-500 text-white hover:bg-red-400',
  purple: 'bg-purple-500 text-white hover:bg-purple-400',
  orange: 'bg-orange-500 text-white hover:bg-orange-400',
} as const;

interface StatusBadgeAction {
  label: string;
  onClick: () => void;
}

interface StatusBadgeProps {
  /** The text to display in the badge */
  label: string;
  /** Color variant */
  color: keyof typeof colorVariants;
  /** Tooltip description text */
  tooltipText: string;
  /** Optional action button in tooltip */
  action?: StatusBadgeAction;
  /** Tooltip position */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  /** Size variant */
  size?: 'sm' | 'md';
  /** Optional click handler for the badge itself */
  onClick?: () => void;
  /** Additional class names */
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  color,
  tooltipText,
  action,
  tooltipSide = 'bottom',
  size = 'sm',
  onClick,
  className,
}) => {
  const sizeClasses = {
    sm: 'text-[7px] px-1 py-0.5',
    md: 'text-[8px] px-1 py-0.5',
  }[size];

  return (
    <TouchableTooltip
      side={tooltipSide}
      contentClassName={action ? 'flex flex-col gap-1' : undefined}
      content={
        <>
          <p className="text-xs">{tooltipText}</p>
          {action && (
            <TextAction
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                action.onClick();
              }}
              className="text-left"
            >
              {action.label}
            </TextAction>
          )}
        </>
      }
    >
      <button
        onClick={onClick}
        className={cn(
          'font-bold rounded transition-colors',
          sizeClasses,
          colorVariants[color],
          onClick ? 'cursor-pointer' : 'cursor-help',
          className
        )}
      >
        {label}
      </button>
    </TouchableTooltip>
  );
};
