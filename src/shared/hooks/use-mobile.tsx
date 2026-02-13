import * as React from "react"

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024 // iPads and similar tablets

// --- Pure compute helpers (no hooks, safe for non-React contexts) ---

const hasCoarsePointer = (): boolean => {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
};

// Detect if device is a tablet (iPad-like) specifically
// This allows tablets to have different behavior than phones (e.g., pane locking)
const computeIsTablet = (): boolean => {
  if (typeof window === 'undefined') return false;

  const width = window.innerWidth;

  // Tablet: wider than phone but not desktop-sized, with touch capability
  const isTabletSize = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
  const isLargeTabletSize = width >= TABLET_BREAKPOINT && width < 1200;

  // iPadOS 13+ detection (reports as Mac with touch)
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIpadOsLike = navigator.platform === 'MacIntel' && maxTouchPoints > 1;

  // Generic tablet UA hints
  const ua = navigator.userAgent || '';
  const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);

  // Tablet if: iPad-like OR (tablet size + touch capability)
  return Boolean(isIpadOsLike || tabletUA || ((isTabletSize || isLargeTabletSize) && hasCoarsePointer()));
};

const computeIsMobile = (): boolean => {
  if (typeof window === 'undefined') return false; // SSR / safety fallback

  const widthMobile = window.innerWidth < MOBILE_BREAKPOINT;

  // iPadOS 13+ may report as Mac with touch; detect via maxTouchPoints
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIpadOsLike = navigator.platform === 'MacIntel' && maxTouchPoints > 1;

  // Generic tablet UA hints (best-effort, not relied upon exclusively)
  const ua = navigator.userAgent || '';
  const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);

  return Boolean(widthMobile || hasCoarsePointer() || isIpadOsLike || tabletUA);
};

const computeIsTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const ua = navigator.userAgent || '';
    const tabletUA = /iPad|Tablet|Android(?!.*Mobile)|Silk|Kindle|PlayBook/i.test(ua);
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    const isIpadOsLike = navigator.platform === 'MacIntel' && maxTouchPoints > 1;
    return Boolean(hasCoarsePointer() || tabletUA || isIpadOsLike || maxTouchPoints > 0);
  } catch {
    return false;
  }
};

const computeOrientation = (): 'portrait' | 'landscape' => {
  if (typeof window === 'undefined') return 'portrait';
  try {
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  } catch {
    return 'portrait';
  }
};

const computeIsPortraitMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
};

// --- Non-hook utility ---

/**
 * Non-hook UA check for contexts that need mobile detection during init
 * (before React hooks are available, e.g. in context default values).
 * Prefer the hooks below for component code.
 */
export function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// --- Individual hooks (existing API, preserved for backward compat) ---

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => computeIsMobile());

  React.useEffect(() => {
    const mqWidth = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqPointer = window.matchMedia('(pointer: coarse)')

    const onChange = () => setIsMobile(computeIsMobile())

    // Listen to width and pointer changes; also handle window resize as a fallback
    mqWidth.addEventListener("change", onChange)
    mqPointer.addEventListener("change", onChange)
    window.addEventListener('resize', onChange)

    return () => {
      mqWidth.removeEventListener("change", onChange)
      mqPointer.removeEventListener("change", onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  return isMobile
}

// Hook to detect tablet specifically (iPad-like devices)
// Tablets can lock one pane at a time, unlike phones
export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(() => computeIsTablet());

  React.useEffect(() => {
    const onChange = () => setIsTablet(computeIsTablet());

    window.addEventListener('resize', onChange);

    return () => {
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isTablet;
}

/** Phone only (isMobile && !isTablet) — hides advanced UI that tablets can show */
function _useIsPhone() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  return isMobile && !isTablet;
}

/** Touch-capable device (phones, tablets, touch laptops) */
export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState<boolean>(() => computeIsTouchDevice());

  React.useEffect(() => {
    const onChange = () => setIsTouchDevice(computeIsTouchDevice());

    window.addEventListener('resize', onChange);

    return () => {
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return isTouchDevice;
}

// --- Composite hook ---

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
 * Comprehensive device info hook. Returns all device detection state
 * in a single object. Prefer individual hooks (useIsMobile, useIsTablet, etc.)
 * when you only need one or two values.
 */
export function useDeviceInfo(): DeviceInfo {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const [isTabletOrLarger, setIsTabletOrLarger] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= MOBILE_BREAKPOINT;
  });

  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>(() => computeOrientation());
  const [isPortraitMode, setIsPortraitMode] = React.useState<boolean>(() => computeIsPortraitMode());

  const isTouchDevice = React.useMemo(() => {
    if (typeof window === 'undefined') return !!isMobile;
    return computeIsTouchDevice();
  }, [isMobile]);

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
    } catch {
      /* no-op */
    }
    window.addEventListener('resize', handleResize);

    return () => {
      try {
        mq.removeEventListener('change', handleOrientation);
      } catch {
        /* no-op */
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const isPhone = isMobile && !isTablet;

  const mobileColumns = React.useMemo(() => {
    if (!isMobile) return 6 as 6;
    if (isTablet) return (orientation === 'portrait' ? 3 : 4) as 3 | 4;
    return 2 as 2;
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
