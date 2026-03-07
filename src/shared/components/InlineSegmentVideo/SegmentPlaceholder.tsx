import type React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { SegmentPlaceholderProps } from './types';

export const SegmentPlaceholder: React.FC<SegmentPlaceholderProps> = ({
  layoutProps,
  isPending,
  readOnly,
  pairIndex,
  onOpenPairSettings,
}) => {
  const { layout, compact, roundedClass, flowContainerClasses, adjustedPositionStyle } = layoutProps;

  if (isPending) {
    return (
      <button
        className={cn(
          'bg-muted/40 border-2 border-dashed border-primary/40 flex items-center justify-center cursor-pointer transition-all duration-150',
          roundedClass,
          layout === 'flow' && 'shadow-sm',
          'hover:bg-muted/60 hover:border-primary/60',
          flowContainerClasses,
        )}
        style={adjustedPositionStyle}
        onClick={() => onOpenPairSettings?.(pairIndex)}
      >
        <div className="flex flex-col items-center gap-0.5 text-primary">
          <Loader2 className={cn(layout === 'flow' && compact ? 'w-3.5 h-3.5' : 'w-4 h-4', 'animate-spin')} />
          <span className="text-[10px] font-medium">Pending</span>
        </div>
      </button>
    );
  }

  if (readOnly) {
    return (
      <div
        className={cn(
          'border-2 border-dashed',
          roundedClass,
          layout === 'flow' ? 'bg-muted/30 border-muted-foreground/20' : 'bg-muted/20 border-border/30',
          flowContainerClasses,
        )}
        style={adjustedPositionStyle}
      />
    );
  }

  return (
    <button
      className={cn(
        'border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-150 group',
        roundedClass,
        layout === 'flow'
          ? 'bg-muted/70 border-primary/50 shadow-sm hover:bg-muted hover:border-primary hover:scale-[1.02]'
          : 'bg-muted/30 border-border/40 hover:bg-muted/50 hover:border-primary/40',
        flowContainerClasses,
      )}
      style={adjustedPositionStyle}
      onClick={() => onOpenPairSettings?.(pairIndex)}
    >
      <div
        className={cn(
          'flex flex-col items-center transition-colors',
          layout === 'flow'
            ? 'gap-0.5 text-foreground group-hover:text-primary'
            : 'gap-1 text-muted-foreground group-hover:text-foreground',
        )}
      >
        <Sparkles
          className={cn(
            layout === 'flow' && compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
            layout === 'flow' ? 'group-hover:scale-110 transition-transform' : 'opacity-60 group-hover:opacity-100',
          )}
        />
        <span className="text-[10px] font-medium">Generate</span>
      </div>
    </button>
  );
};
