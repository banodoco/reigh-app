import { formatDistanceToNow } from 'date-fns';
import { abbreviateRelativeTime, formatRelativeDuration } from '@/shared/lib/timeFormatting';
import { useLiveRelativeTimestamp } from './useLiveRelativeTimestamp';

type RelativeTimestampPreset = 'default' | 'task' | 'processing' | 'completed';

interface UseUpdatingTimestampOptions {
  date?: string | Date | null;
  abbreviate?: (str: string) => string;
  disabled?: boolean;
  preset?: RelativeTimestampPreset;
}

const relativeTimestampFormatters: Record<
  RelativeTimestampPreset,
  (date: Date, abbreviate: (str: string) => string) => string
> = {
  default: (date, abbreviate) => abbreviate(formatDistanceToNow(date, { addSuffix: true })),
  task: (date) => {
    const abbreviated = abbreviateRelativeTime(formatDistanceToNow(date, { addSuffix: true }));
    return abbreviated || '<1 min ago';
  },
  processing: (date) => `Processing for ${formatRelativeDuration(date, { includeDays: false })}`,
  completed: (date) => `Completed ${formatRelativeDuration(date)} ago`,
};

export function useRelativeTimestamp({
  date,
  abbreviate = abbreviateRelativeTime,
  disabled = false,
  preset = 'default',
}: UseUpdatingTimestampOptions = {}): string | null {
  const formatter = relativeTimestampFormatters[preset];

  return useLiveRelativeTimestamp({
    dateInput: date,
    disabled,
    formatter: (parsedDate) => formatter(parsedDate, abbreviate),
  });
}

export function useTaskTimestamp(date?: string | Date | null) {
  return useRelativeTimestamp({
    date,
    preset: 'task',
  });
}
