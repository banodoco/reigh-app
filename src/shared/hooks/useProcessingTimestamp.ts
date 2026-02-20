import { useMemo } from 'react';
import { isValid } from 'date-fns';
import { useTimestampUpdater } from './useTimestampUpdater';

/**
 * Hook for formatting "In Progress" task timestamps based on generation_started_at
 * Shows "Processing: <1 min" for <1 min, "Processing: For X mins/hrs" for longer durations
 */

interface UseProcessingTimestampOptions {
  /** Date when generation started */
  generationStartedAt?: string | Date | null;
  /** Disable automatic updates */
  disabled?: boolean;
}

interface UseCompletedTimestampOptions {
  /** Date when generation was processed/completed */
  generationProcessedAt?: string | Date | null;
  /** Disable automatic updates */
  disabled?: boolean;
}

/**
 * Custom formatting for processing duration
 */
const formatProcessingDuration = (startDate: Date): string => {
  const now = Date.now();
  const startTime = startDate.getTime();
  const diffMs = now - startTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'Processing for <1 min';
  }
  
  // 1-59 minutes
  if (diffMinutes < 60) {
    return `Processing for ${diffMinutes} min${diffMinutes === 1 ? '' : 's'}`;
  }
  
  // Hours and minutes
  const hours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;
  
  if (remainingMinutes === 0) {
    return `Processing for ${hours} hr${hours === 1 ? '' : 's'}`;
  } else {
    return `Processing for ${hours} hr${hours === 1 ? '' : 's'}, ${remainingMinutes} min${remainingMinutes === 1 ? '' : 's'}`;
  }
};

/**
 * Custom formatting for completed task - shows how long ago it was completed
 */
const formatCompletedTime = (completedDate: Date): string => {
  const now = Date.now();
  const completedTime = completedDate.getTime();
  const diffMs = now - completedTime;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  // Less than 1 minute
  if (diffMinutes < 1) {
    return 'Completed <1 min ago';
  }
  
  // 1-59 minutes
  if (diffMinutes < 60) {
    return `Completed ${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }
  
  // Less than 24 hours - show hours and minutes
  if (diffMinutes < 24 * 60) {
    const hours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;
    
    if (remainingMinutes === 0) {
      return `Completed ${hours} hr${hours === 1 ? '' : 's'} ago`;
    } else {
      return `Completed ${hours} hr${hours === 1 ? '' : 's'}, ${remainingMinutes} min${remainingMinutes === 1 ? '' : 's'} ago`;
    }
  }
  
  // Days and hours
  const days = Math.floor(diffMinutes / (24 * 60));
  const remainingHours = Math.floor((diffMinutes % (24 * 60)) / 60);
  
  if (remainingHours === 0) {
    return `Completed ${days} day${days === 1 ? '' : 's'} ago`;
  } else {
    return `Completed ${days} day${days === 1 ? '' : 's'}, ${remainingHours} hr${remainingHours === 1 ? '' : 's'} ago`;
  }
};

/**
 * Shared hook for live-updating timestamp formatting.
 * Parses a date, sets up live update triggers, and formats using the provided formatter.
 */
function useLiveTimestamp(
  dateInput: string | Date | null | undefined,
  disabled: boolean,
  formatter: (date: Date) => string,
): string | null {
  const parsedDate = useMemo(() => {
    if (!dateInput) return null;
    const parsed = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return isValid(parsed) ? parsed : null;
  }, [dateInput]);

  const { updateTrigger } = useTimestampUpdater({
    date: parsedDate,
    disabled,
    isVisible: true,
  });

  const formattedTime = useMemo(() => {
    if (!parsedDate) return null;
    // Keep recomputing when the updater ticks so relative durations stay fresh.
    void updateTrigger;
    return formatter(parsedDate);
  }, [parsedDate, formatter, updateTrigger]);

  return formattedTime;
}

/**
 * Hook that returns a formatted, live-updating processing timestamp string
 *
 * @example
 * const processingTime = useProcessingTimestamp({ generationStartedAt: task.generationStartedAt });
 * return <span>{processingTime}</span>;
 */
export function useProcessingTimestamp({
  generationStartedAt,
  disabled = false
}: UseProcessingTimestampOptions = {}) {
  return useLiveTimestamp(generationStartedAt, disabled, formatProcessingDuration);
}

/**
 * Hook that returns a formatted completed task timestamp string showing how long ago it was completed
 *
 * @example
 * const completedTime = useCompletedTimestamp({
 *   generationProcessedAt: task.generationProcessedAt
 * });
 * return <span>{completedTime}</span>;
 */
export function useCompletedTimestamp({
  generationProcessedAt,
  disabled = false
}: UseCompletedTimestampOptions = {}) {
  return useLiveTimestamp(generationProcessedAt, disabled, formatCompletedTime);
}
