import { cn } from '@/shared/components/ui/contracts/cn';

interface TaskDetailsCardClassParams {
  variant: 'hover' | 'modal' | 'panel';
  isMobile: boolean;
  widthClassName: string;
  baseClassName?: string;
}

export function getTaskDetailsCardClassName({
  variant,
  isMobile,
  widthClassName,
  baseClassName = 'p-3 bg-muted/30 rounded-lg border space-y-3',
}: TaskDetailsCardClassParams) {
  return cn(
    baseClassName,
    variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : widthClassName
  );
}
