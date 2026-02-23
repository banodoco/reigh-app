import { formatRelativeDuration } from '@/shared/lib/timeFormatting';
import { useLiveRelativeTimestamp } from './useLiveRelativeTimestamp';

interface UseProcessingTimestampOptions {
  /** Date when generation started */
  generationStartedAt?: string | Date | null;
  /** Disable automatic updates */
  disabled?: boolean;
}

/**
 * Format processing duration: "Processing for 5 mins", "Processing for 1 hr, 30 mins"
 * Processing durations don't need day-level granularity — hours keep accumulating.
 */
const formatProcessingDuration = (startDate: Date): string =>
  `Processing for ${formatRelativeDuration(startDate, { includeDays: false })}`;

export function useProcessingTimestamp({
  generationStartedAt,
  disabled = false
}: UseProcessingTimestampOptions = {}) {
  return useLiveRelativeTimestamp({
    dateInput: generationStartedAt,
    disabled,
    formatter: formatProcessingDuration,
  });
}
