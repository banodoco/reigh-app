import { useMemo } from 'react';

import { useDeviceInfo } from '@/shared/hooks/use-mobile';

export function useAspectAdjustedColumns(effectiveAspectRatio?: string): {
  isPhone: boolean;
  aspectAdjustedColumns: 2 | 3 | 4 | 6;
} {
  const { isPhone, mobileColumns } = useDeviceInfo();

  const aspectAdjustedColumns = useMemo(() => {
    if (!effectiveAspectRatio) {
      return mobileColumns as 2 | 3 | 4 | 6;
    }

    const [w, h] = effectiveAspectRatio.split(':').map(Number);
    if (!w || !h) {
      return mobileColumns as 2 | 3 | 4 | 6;
    }

    const ratio = w / h;

    if (ratio < 0.7) {
      return Math.min(mobileColumns + 2, 8) as 2 | 3 | 4 | 6;
    }

    if (ratio < 1) {
      return Math.min(mobileColumns + 1, 7) as 2 | 3 | 4 | 6;
    }

    if (ratio > 1.5) {
      return Math.max(mobileColumns - 1, 2) as 2 | 3 | 4 | 6;
    }

    return mobileColumns as 2 | 3 | 4 | 6;
  }, [mobileColumns, effectiveAspectRatio]);

  return {
    isPhone,
    aspectAdjustedColumns,
  };
}
