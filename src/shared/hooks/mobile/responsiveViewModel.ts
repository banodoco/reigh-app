import * as React from 'react';
import {
  MOBILE_BREAKPOINT,
  computeOrientation,
  computeIsPortraitMode,
} from '@/shared/hooks/mobile/deviceDetection';
import { reportNonFatalMobileError } from '@/shared/hooks/mobile/mobileErrorReporter';
import { useIsMobile, useIsTablet, useIsTouchDevice } from '@/shared/hooks/mobile/deviceSignals';

interface DeviceInfo {
  /** Tablet device (iPad-like) */
  isTablet: boolean;
  /** Phone only (isMobile && !isTablet) */
  isPhone: boolean;
  /** Width >= 768px */
  isTabletOrLarger: boolean;
  /** Any touch-capable device */
  isTouchDevice: boolean;
  /** Media-query based orientation */
  orientation: 'portrait' | 'landscape';
  /** height > width (simpler, more reliable) */
  isPortraitMode: boolean;
  /** Responsive column count for mobile grids */
  mobileColumns: 2 | 3 | 4 | 6;
}

/**
 * Composite responsive policy hook built on top of primitive device signals.
 */
export function useDeviceInfo(): DeviceInfo {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const [isTabletOrLarger, setIsTabletOrLarger] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= MOBILE_BREAKPOINT;
  });

  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>(() => computeOrientation(reportNonFatalMobileError));
  const [isPortraitMode, setIsPortraitMode] = React.useState<boolean>(() => computeIsPortraitMode());

  const isTouchDevice = useIsTouchDevice();

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(orientation: portrait)');
    const handleOrientation = () => setOrientation(mq.matches ? 'portrait' : 'landscape');

    const handleResize = () => {
      setIsTabletOrLarger(window.innerWidth >= MOBILE_BREAKPOINT);
      setIsPortraitMode(window.innerHeight > window.innerWidth);
    };

    try {
      mq.addEventListener('change', handleOrientation);
    } catch (error) {
      reportNonFatalMobileError('orientation.addEventListener', error);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      try {
        mq.removeEventListener('change', handleOrientation);
      } catch (error) {
        reportNonFatalMobileError('orientation.removeEventListener', error);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isPhone = isMobile && !isTablet;

  const mobileColumns = React.useMemo(() => {
    if (!isMobile) return 6 as const;
    if (isTablet) return (orientation === 'portrait' ? 3 : 4) as 3 | 4;
    return 2 as const;
  }, [isMobile, isTablet, orientation]);

  return {
    isTablet,
    isPhone,
    isTabletOrLarger,
    isTouchDevice,
    orientation,
    isPortraitMode,
    mobileColumns,
  };
}
