export interface OverlayViewportConstraints {
  tasksPaneOpen: boolean;
  tasksPaneWidth: number;
  tasksPaneLocked: boolean;
  isTabletOrLarger: boolean;
  needsFullscreenLayout: boolean;
  needsTasksPaneOffset: boolean;
}

export function shouldAccountForTasksPane(
  constraints: OverlayViewportConstraints,
): boolean {
  return (constraints.tasksPaneOpen || constraints.tasksPaneLocked) && constraints.isTabletOrLarger;
}
