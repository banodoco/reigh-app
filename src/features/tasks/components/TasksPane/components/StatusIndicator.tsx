import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { FilterGroup } from '../constants';

interface StatusIndicatorProps {
  count: number;
  type: FilterGroup;
  onClick?: () => void;
  isSelected: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  count,
  type,
  onClick,
  isSelected
}) => {
  const borderStyle = type === 'Processing' ? 'border-solid' : 'border-dashed';
  const borderColor = 'border-border';

  // Use consistent zinc colors for all badge types
  const textColor = isSelected ? 'text-foreground' : 'text-muted-foreground';

  return (
    <div
      className={cn(
        "ml-2 px-2 py-1 border-2 rounded text-xs font-light cursor-pointer transition-all",
        borderStyle,
        borderColor,
        textColor,
        count === 0 ? "opacity-50" : "opacity-100",
        isSelected ? "bg-foreground/20" : "bg-foreground/10 md:hover:bg-foreground/15"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {count}
    </div>
  );
};
