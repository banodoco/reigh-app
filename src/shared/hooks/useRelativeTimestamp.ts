import { formatDistanceToNow } from 'date-fns';
import { abbreviateRelativeTime, formatRelativeDuration } from '@/shared/lib/timeFormatting';
import { useLiveRelativeTimestamp } from './useLiveRelativeTimestamp';

type RelativeTimestampMode = 'updating' | 'task' | 'processing' | 'completed';

interface UseRelativeTimestampOptions {
  dateInput?: string | Date | null;
  mode: RelativeTimestampMode;
  disabled?: boolean;
  abbreviate?: (value: string) => string;
}

function abbreviateTaskRelativeTime(relativeTime: string): string {
  const abbreviated = abbreviateRelativeTime(relativeTime);
  if (!abbreviated) {
    return '<1 min ago';
  }
  return abbreviated;
}

export function useRelativeTimestamp({
  dateInput,
  mode,
  disabled = false,
  abbreviate = abbreviateRelativeTime,
}: UseRelativeTimestampOptions): string | null {
  return useLiveRelativeTimestamp({
    dateInput,
    disabled,
    formatter: (parsedDate) => {
      if (mode === 'processing') {
        return `Processing for ${formatRelativeDuration(parsedDate, { includeDays: false })}`;
      }

      if (mode === 'completed') {
        return `Completed ${formatRelativeDuration(parsedDate)} ago`;
      }

      const formatted = formatDistanceToNow(parsedDate, { addSuffix: true });
      if (mode === 'task') {
        return abbreviateTaskRelativeTime(formatted);
      }
      return abbreviate(formatted);
    },
  });
}
