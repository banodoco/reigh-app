import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLightboxPaneLayout } from '../useLightboxPaneLayout';

describe('useLightboxPaneLayout', () => {
  it('applies tasks pane offset when overlay should account for pane width', () => {
    const { result } = renderHook(() =>
      useLightboxPaneLayout({
        overlayViewport: {
          tasksPaneOpen: true,
          tasksPaneWidth: 320,
          tasksPaneLocked: false,
          isTabletOrLarger: true,
          needsFullscreenLayout: false,
          needsTasksPaneOffset: true,
        },
      }),
    );

    expect(result.current.overlayStyle.right).toBe('320px');
    expect(result.current.overlayStyle.width).toBe('calc(100vw - 320px)');
    expect(result.current.contentStyle.width).toBe('calc(100vw - 320px)');
  });

  it('uses full width layout when no tasks pane offset is needed', () => {
    const { result } = renderHook(() =>
      useLightboxPaneLayout({
        overlayViewport: {
          tasksPaneOpen: false,
          tasksPaneWidth: 400,
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
