import { useMemo } from 'react';
import {
  isMobileUA as isMobileUaSignal,
  useIsMobile as useIsMobileSignal,
  useIsTablet as useIsTabletSignal,
  useIsTouchDevice as useIsTouchDeviceSignal,
} from './deviceSignals';
import { useDeviceInfo as useDeviceInfoSignal } from './responsiveViewModel';

export const isMobileUA = isMobileUaSignal;

/** App-facing mobile signal with a defensive fallback for non-browser runtimes. */
export function useIsMobile() {
  const detected = useIsMobileSignal();
  if (typeof window === 'undefined') {
    return false;
  }
  return detected ?? window.innerWidth < 768;
}

/** App-facing tablet signal with a defensive fallback for non-browser runtimes. */
export function useIsTablet() {
  const detected = useIsTabletSignal();
  if (typeof window === 'undefined') {
    return false;
  }
  return detected ?? (window.innerWidth >= 768 && window.innerWidth < 1024);
}

/** App-facing touch capability signal with runtime fallback for browser environments. */
export function useIsTouchDevice() {
  const detected = useIsTouchDeviceSignal();
  if (typeof window === 'undefined') {
    return false;
  }
  if (detected !== undefined) {
    return detected;
  }
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/** Composite device view model with normalized base signals from this public module. */
export function useDeviceInfo() {
  const viewModel = useDeviceInfoSignal();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isTouchDevice = useIsTouchDevice();

  return useMemo(() => ({
    ...viewModel,
    isTablet,
    isPhone: isMobile && !isTablet,
    isTouchDevice,
  }), [viewModel, isMobile, isTablet, isTouchDevice]);
}
