import { formatDistanceToNow } from 'date-fns';
import { abbreviateRelativeTime } from '@/shared/lib/timeFormatting';
import { useLiveRelativeTimestamp } from './useLiveRelativeTimestamp';

/**
 * Simple hook that returns a live-updating formatted timestamp string
 * Perfect for inline timestamps in task lists, galleries, etc.
 */

interface UseUpdatingTimestampOptions {
  /** Date to format */
  date?: string | Date | null;
  /** Custom abbreviation function */
  abbreviate?: (str: string) => string;
  /** Disable automatic updates */
  disabled?: boolean;
}

/**
 * Hook that returns a formatted, live-updating timestamp string
 * 
 * @example
 * const timeAgo = useUpdatingTimestamp({ date: task.createdAt });
 * return <span>Created: {timeAgo}</span>;
 */
export function useUpdatingTimestamp({ 
  date, 
  abbreviate = abbreviateRelativeTime,
  disabled = false 
}: UseUpdatingTimestampOptions = {}): string | null {
  return useLiveRelativeTimestamp({
    dateInput: date,
    disabled,
    formatter: (parsedDate) => {
    const formatted = formatDistanceToNow(parsedDate, { addSuffix: true });
      return abbreviate(formatted);
    },
  });
}

function abbreviateTaskRelativeTime(relativeTime: string): string {
  const abbreviated = abbreviateRelativeTime(relativeTime);
  if (!abbreviated) {
    return '<1 min ago';
  }
  return abbreviated;
}

/**
 * Task-specific wrapper keeps compact task-list formatting stable even if
 * generic timestamp defaults evolve.
 */
export function useTaskTimestamp(date?: string | Date | null) {
  return useUpdatingTimestamp({
    date,
    abbreviate: abbreviateTaskRelativeTime,
  });
}
