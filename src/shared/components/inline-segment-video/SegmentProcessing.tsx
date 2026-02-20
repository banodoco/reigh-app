import type React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SegmentProcessingProps } from './types';

export const SegmentProcessing: React.FC<SegmentProcessingProps> = ({
  layoutProps,
  isPending,
  pairIndex,
  onOpenPairSettings,
}) => {
  const { layout, compact, roundedClass, flowContainerClasses, adjustedPositionStyle } = layoutProps;

  if (isPending) {
    return (
      <div
        className={cn(
          'bg-muted/40 border border-dashed border-border/50 flex items-center justify-center',
          roundedClass,
          flowContainerClasses,
        )}
        style={adjustedPositionStyle}
      >
        <div className={cn('flex items-center text-muted-foreground', layout === 'flow' ? 'gap-1.5' : 'flex-col gap-2')}>
          <Loader2 className={cn(layout === 'flow' && compact ? 'w-3 h-3' : 'w-6 h-6', 'animate-spin')} />
          <span className={cn(layout === 'flow' && compact ? 'text-[9px]' : 'text-xs', 'font-medium')}>
            Processing...
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      className={cn(
        'border-2 border-dashed flex items-center justify-center cursor-pointer transition-all duration-150 group',
        roundedClass,
        layout === 'flow'
          ? 'bg-amber-500/10 border-amber-500/50 shadow-sm hover:bg-amber-500/20 hover:border-amber-500 hover:scale-[1.02]'
          : 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50',
        flowContainerClasses,
      )}
      style={adjustedPositionStyle}
      onClick={() => onOpenPairSettings?.(pairIndex)}
      title="Source images changed - click to regenerate"
    >
      <div
        className={cn(
          'flex flex-col items-center transition-colors',
          layout === 'flow'
            ? 'gap-0.5 text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300'
            : 'gap-1 text-amber-600/70 dark:text-amber-400/70 group-hover:text-amber-600 dark:group-hover:text-amber-400',
        )}
      >
        <Sparkles
          className={cn(
            layout === 'flow' && compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
            layout === 'flow' ? 'group-hover:scale-110 transition-transform' : 'opacity-80 group-hover:opacity-100',
          )}
        />
        <span className="text-[10px] font-medium">Regenerate</span>
      </div>
    </button>
  );
};
