import React from 'react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/components/ui/contracts/cn';

interface TaskItemSkeletonProps {
  variant?: 'processing' | 'complete' | 'failed';
  showImages?: boolean;
  showPrompt?: boolean;
}

export const TaskItemSkeleton: React.FC<TaskItemSkeletonProps> = ({
  variant = 'processing',
  showImages = false,
  showPrompt = false,
}) => {
  const statusColors = {
    processing: 'bg-blue-500/60',
    complete: 'bg-green-500/60',
    failed: 'bg-red-500/60',
  };

  return (
    <div className="relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border border-zinc-600 animate-pulse">
      <div className="flex justify-between items-center mb-1 gap-2">
        <Skeleton className="h-4 w-24 bg-zinc-600" />
        <Skeleton className={cn('h-5 w-16 rounded-full', statusColors[variant])} />
      </div>

      {showImages && (
        <div className="flex items-center gap-1 mb-1 mt-2">
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
          <Skeleton className="w-12 h-12 rounded bg-zinc-700" />
        </div>
      )}

      {showPrompt && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <Skeleton className="h-3 flex-1 mr-2 bg-zinc-600" />
            <Skeleton className="w-8 h-8 rounded bg-zinc-600 flex-shrink-0" />
          </div>
        </div>
      )}

      <div className="flex items-center mt-2">
        <Skeleton className="h-3 w-20 bg-zinc-700" />
      </div>
    </div>
  );
};
