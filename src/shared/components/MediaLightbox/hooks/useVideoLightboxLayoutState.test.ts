import { describe, expect, it } from 'vitest';
import { buildVideoLightboxLayoutState } from './useVideoLightboxLayoutState';

function makeInput(overrides: Partial<Parameters<typeof buildVideoLightboxLayoutState>[0]> = {}) {
  return {
    isMobile: false,
    isFormOnlyMode: false,
    isTabletOrLarger: true,
    isPortraitMode: false,
    shouldShowSidePanel: false,
    isAnyVideoEditMode: false,
    hasSegmentVideo: false,
    showTaskDetails: false,
    isSegmentSlotMode: false,
    effectiveTasksPaneOpen: false,
    isTasksPaneLocked: false,
    ...overrides,
  };
}

describe('buildVideoLightboxLayoutState', () => {
  it('returns desktop panel layout when side panel is explicitly enabled', () => {
    const state = buildVideoLightboxLayoutState(makeInput({
      shouldShowSidePanel: true,
      effectiveTasksPaneOpen: true,
    }));

    expect(state).toEqual({
      shouldShowSidePanelWithTrim: true,
      showPanel: true,
      needsFullscreenLayout: true,
      needsTasksPaneOffset: true,
      panelVariant: 'desktop',
    });
  });

  it('returns mobile panel layout when editing on mobile', () => {
    const state = buildVideoLightboxLayoutState(makeInput({
      isMobile: true,
      isTabletOrLarger: false,
      isAnyVideoEditMode: true,
    }));

    expect(state).toEqual({
      shouldShowSidePanelWithTrim: false,
      showPanel: true,
      needsFullscreenLayout: true,
      needsTasksPaneOffset: false,
      panelVariant: 'mobile',
    });
  });

  it('keeps compact desktop layout when no panel conditions are active', () => {
    const state = buildVideoLightboxLayoutState(makeInput());

    expect(state).toEqual({
      shouldShowSidePanelWithTrim: false,
      showPanel: false,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'mobile',
    });
  });
});
