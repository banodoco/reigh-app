import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLightboxPaneLayout } from './useLightboxPaneLayout';

describe('useLightboxPaneLayout', () => {
  it('applies tasks-pane offsets when pane should be accounted for', () => {
    const { result } = renderHook(() =>
      useLightboxPaneLayout({
        overlayViewport: {
          tasksPaneOpen: true,
          tasksPaneWidth: 360,
          tasksPaneLocked: false,
          isTabletOrLarger: true,
          needsFullscreenLayout: false,
          needsTasksPaneOffset: true,
        },
      }),
    );

    expect(result.current.overlayStyle.right).toBe('360px');
    expect(result.current.overlayStyle.width).toBe('calc(100vw - 360px)');
    expect(result.current.contentStyle.width).toBe('calc(100vw - 360px)');
  });

  it('uses fullscreen width when no tasks-pane offset is required', () => {
    const { result } = renderHook(() =>
      useLightboxPaneLayout({
        overlayViewport: {
          tasksPaneOpen: false,
          tasksPaneWidth: 320,
          tasksPaneLocked: false,
          isTabletOrLarger: false,
          needsFullscreenLayout: true,
          needsTasksPaneOffset: false,
        },
      }),
    );

    expect(result.current.overlayStyle.right).toBe(0);
    expect(result.current.overlayStyle.width).toBeUndefined();
    expect(result.current.contentStyle.width).toBe('100vw');
  });
});
