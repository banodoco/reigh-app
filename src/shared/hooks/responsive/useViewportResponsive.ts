import { useEffect, useState } from 'react';

const BREAKPOINT_SM = 640;
const BREAKPOINT_MD = 768;
const BREAKPOINT_LG = 1024;
const BREAKPOINT_XL = 1280;
const BREAKPOINT_2XL = 1536;

interface ViewportBreakpoints {
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2Xl: boolean;
  contentWidth: number;
  contentHeight: number;
}

export function useViewportResponsive(): ViewportBreakpoints {
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { width, height } = viewport;

  return {
    isSm: width >= BREAKPOINT_SM,
    isMd: width >= BREAKPOINT_MD,
    isLg: width >= BREAKPOINT_LG,
    isXl: width >= BREAKPOINT_XL,
    is2Xl: width >= BREAKPOINT_2XL,
    contentWidth: width,
    contentHeight: height,
  };
}
