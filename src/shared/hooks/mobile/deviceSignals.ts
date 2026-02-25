import * as React from 'react';
import {
  MOBILE_BREAKPOINT,
  computeIsMobile,
  computeIsTablet,
  computeIsTouchDevice,
  isMobileUA,
} from '@/shared/hooks/mobile/deviceDetection';
import { reportNonFatalMobileError } from '@/shared/hooks/mobile/mobileErrorReporter';

export { isMobileUA };

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => computeIsMobile(reportNonFatalMobileError));

  React.useEffect(() => {
    const mqWidth = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const mqPointer = window.matchMedia('(pointer: coarse)');

    const onChange = () => setIsMobile(computeIsMobile(reportNonFatalMobileError));

    mqWidth.addEventListener('change', onChange);
    mqPointer.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);

    return () => {
      mqWidth.removeEventListener('change', onChange);
      mqPointer.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isMobile;
}

// Hook to detect tablet specifically (iPad-like devices)
// Tablets can lock one pane at a time, unlike phones.
export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(() => computeIsTablet(reportNonFatalMobileError));

  React.useEffect(() => {
    const onChange = () => setIsTablet(computeIsTablet(reportNonFatalMobileError));

    window.addEventListener('resize', onChange);

    return () => {
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isTablet;
}

/** Touch-capable device (phones, tablets, touch laptops). */
export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState<boolean>(() => computeIsTouchDevice(reportNonFatalMobileError));

  React.useEffect(() => {
    const onChange = () => setIsTouchDevice(computeIsTouchDevice(reportNonFatalMobileError));

    window.addEventListener('resize', onChange);

    return () => {
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isTouchDevice;
}
