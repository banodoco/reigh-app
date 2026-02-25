interface BuildVideoLightboxLayoutStateInput {
  isMobile: boolean;
  isFormOnlyMode: boolean;
  isTabletOrLarger: boolean;
  isPortraitMode: boolean;
  shouldShowSidePanel: boolean;
  isAnyVideoEditMode: boolean;
  hasSegmentVideo: boolean;
  showTaskDetails: boolean;
  isSegmentSlotMode: boolean;
  effectiveTasksPaneOpen: boolean;
  isTasksPaneLocked: boolean;
}

interface VideoLightboxLayoutState {
  shouldShowSidePanelWithTrim: boolean;
  showPanel: boolean;
  needsFullscreenLayout: boolean;
  needsTasksPaneOffset: boolean;
  panelVariant: 'desktop' | 'mobile';
}

export function buildVideoLightboxLayoutState(
  input: BuildVideoLightboxLayoutStateInput,
): VideoLightboxLayoutState {
  const shouldShowSidePanelWithTrim = input.shouldShowSidePanel
    || ((!input.isPortraitMode && input.isTabletOrLarger) && input.isAnyVideoEditMode);

  const showPanel = shouldShowSidePanelWithTrim
    || ((input.showTaskDetails || input.isAnyVideoEditMode || (input.isSegmentSlotMode && input.hasSegmentVideo)) && input.isMobile);

  const needsFullscreenLayout = input.isMobile
    || input.isFormOnlyMode
    || input.shouldShowSidePanel
    || shouldShowSidePanelWithTrim;

  const needsTasksPaneOffset = needsFullscreenLayout
    && (input.effectiveTasksPaneOpen || input.isTasksPaneLocked)
    && !input.isPortraitMode
    && input.isTabletOrLarger;

  const panelVariant = (shouldShowSidePanelWithTrim && !input.isMobile)
    ? 'desktop'
    : 'mobile';

  return {
    shouldShowSidePanelWithTrim,
    showPanel,
    needsFullscreenLayout,
    needsTasksPaneOffset,
    panelVariant,
  };
}
