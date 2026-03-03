import { describe, it, expect } from 'vitest';
import { shouldAccountForTasksPane } from './overlayViewportConstraints';

describe('overlayViewportConstraints', () => {
  it('accounts for tasks pane only when tablet-or-larger and pane is open/locked', () => {
    expect(
      shouldAccountForTasksPane({
        tasksPaneOpen: true,
        tasksPaneWidth: 320,
        tasksPaneLocked: false,
        isTabletOrLarger: true,
        needsFullscreenLayout: false,
        needsTasksPaneOffset: true,
      }),
    ).toBe(true);

    expect(
      shouldAccountForTasksPane({
        tasksPaneOpen: false,
        tasksPaneWidth: 320,
        tasksPaneLocked: true,
        isTabletOrLarger: true,
        needsFullscreenLayout: false,
        needsTasksPaneOffset: true,
      }),
    ).toBe(true);

    expect(
      shouldAccountForTasksPane({
        tasksPaneOpen: true,
        tasksPaneWidth: 320,
        tasksPaneLocked: false,
        isTabletOrLarger: false,
        needsFullscreenLayout: true,
        needsTasksPaneOffset: false,
      }),
    ).toBe(false);
  });
});
