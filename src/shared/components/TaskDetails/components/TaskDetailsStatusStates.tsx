import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';

interface TaskDetailsLoadingStateProps {
  containerClassName?: string;
}

export function TaskDetailsLoadingState({
  containerClassName = 'h-64',
}: TaskDetailsLoadingStateProps) {
  return (
    <div className={cn('flex justify-center items-center', containerClassName)}>
      <div className="flex flex-col items-center gap-y-3">
        <svg
          className="animate-spin h-8 w-8 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <p className="text-sm text-muted-foreground">Loading task details...</p>
      </div>
    </div>
  );
}

interface TaskDetailsErrorStateProps {
  errorMessage?: string;
  containerClassName?: string;
  iconWrapperClassName?: string;
  iconClassName?: string;
}

export function TaskDetailsErrorState({
  errorMessage,
  containerClassName = 'h-64',
  iconWrapperClassName = 'w-12 h-12',
  iconClassName = 'w-6 h-6',
}: TaskDetailsErrorStateProps) {
  return (
    <div className={cn('flex justify-center items-center', containerClassName)}>
      <div className="text-center space-y-2 max-w-sm">
        <div
          className={cn(
            'mx-auto bg-red-500/10 rounded-full flex items-center justify-center',
            iconWrapperClassName
          )}
        >
          <AlertTriangle className={cn('text-red-500', iconClassName)} />
        </div>
        <p className="text-sm font-medium">Failed to load task details.</p>
        <p className="text-xs text-muted-foreground">{errorMessage ?? 'Please try again.'}</p>
      </div>
    </div>
  );
}

interface TaskDetailsEmptyStateProps {
  containerClassName?: string;
  iconWrapperClassName?: string;
  iconClassName?: string;
}

export function TaskDetailsEmptyState({
  containerClassName = 'h-64',
  iconWrapperClassName = 'w-12 h-12',
  iconClassName = 'w-6 h-6',
}: TaskDetailsEmptyStateProps) {
  return (
    <div className={cn('flex justify-center items-center', containerClassName)}>
      <div className="text-center space-y-2">
        <div
          className={cn(
            'mx-auto bg-muted rounded-full flex items-center justify-center',
            iconWrapperClassName
          )}
        >
          <svg
            className={cn('text-muted-foreground', iconClassName)}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          No task details available for this generation.
        </p>
      </div>
    </div>
  );
}
