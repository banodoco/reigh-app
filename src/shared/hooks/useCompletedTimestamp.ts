import { formatRelativeDuration } from '@/shared/lib/timeFormatting';
import { useLiveRelativeTimestamp } from './useLiveRelativeTimestamp';

interface UseCompletedTimestampOptions {
  /** Date when generation was processed/completed */
  generationProcessedAt?: string | Date | null;
  /** Disable automatic updates */
  disabled?: boolean;
}

const formatCompletedTime = (completedDate: Date): string => {
  return `Completed ${formatRelativeDuration(completedDate)} ago`;
};

/**
 * Hook that returns a formatted completed task timestamp string showing how long ago it was completed.
 */
export function useCompletedTimestamp({
  generationProcessedAt,
  disabled = false,
}: UseCompletedTimestampOptions = {}) {
  return useLiveRelativeTimestamp({
    dateInput: generationProcessedAt,
    disabled,
    formatter: formatCompletedTime,
  });
}
