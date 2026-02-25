import { useMemo } from 'react';
import {
  shouldAccountForTasksPane,
  type OverlayViewportConstraints,
} from '@/features/layout/contracts/overlayViewportConstraints';

interface UseLightboxPaneLayoutArgs {
  overlayViewport: OverlayViewportConstraints;
}

interface LightboxPaneLayoutStyles {
  overlayStyle: React.CSSProperties;
  contentStyle: React.CSSProperties;
}

export function useLightboxPaneLayout({
  overlayViewport,
}: UseLightboxPaneLayoutArgs): LightboxPaneLayoutStyles {
  return useMemo(() => {
    const accountForTasksPane = shouldAccountForTasksPane(overlayViewport);

    const overlayStyle: React.CSSProperties = {
      pointerEvents: 'all',
      touchAction: 'none',
      cursor: 'pointer',
      zIndex: 10000,
      position: 'fixed',
      top: 0,
      left: 0,
      right: accountForTasksPane ? `${overlayViewport.tasksPaneWidth}px` : 0,
      bottom: 0,
      transition: 'right 300ms cubic-bezier(0.22, 1, 0.36, 1), width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      ...(accountForTasksPane
        ? { width: `calc(100vw - ${overlayViewport.tasksPaneWidth}px)` }
        : {}),
    };

    const contentStyle: React.CSSProperties = {
      transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1)',
      ...(overlayViewport.needsTasksPaneOffset
        ? { width: `calc(100vw - ${overlayViewport.tasksPaneWidth}px)` }
        : overlayViewport.needsFullscreenLayout
        ? { width: '100vw' }
        : {}),
    };

    return { overlayStyle, contentStyle };
  }, [overlayViewport]);
}
