import { useMemo } from 'react';
import { isValid } from 'date-fns';
import { useTimestampUpdater } from './useTimestampUpdater';

interface UseLiveRelativeTimestampOptions {
  dateInput: string | Date | null | undefined;
  disabled: boolean;
  formatter: (date: Date) => string;
}

export function useLiveRelativeTimestamp({
  dateInput,
  disabled,
  formatter,
}: UseLiveRelativeTimestampOptions): string | null {
  const parsedDate = useMemo(() => {
    if (!dateInput) {
      return null;
    }

    const parsed = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return isValid(parsed) ? parsed : null;
  }, [dateInput]);

  const { updateTrigger } = useTimestampUpdater({
    date: parsedDate,
    disabled,
    isVisible: true,
  });

  return useMemo(() => {
    if (!parsedDate) {
      return null;
    }

    void updateTrigger;
    return formatter(parsedDate);
  }, [formatter, parsedDate, updateTrigger]);
}
