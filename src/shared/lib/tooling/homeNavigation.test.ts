import { describe, expect, it } from 'vitest';

import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { AppEnv } from '@/types/env';

import { isHomeToolPathActive, resolveHomeToolPath } from './homeNavigation';

describe('resolveHomeToolPath', () => {
  it('returns the preferred eligible tool path', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.IMAGE_GENERATION,
        currentEnv: AppEnv.WEB,
        isCloudGenerationEnabled: true,
        isLoadingGenerationMethods: false,
      }),
    ).toBe('/tools/video-editor');
  });

  it('builds the video editor path with the saved timeline', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.VIDEO_EDITOR,
        currentEnv: AppEnv.WEB,
        isCloudGenerationEnabled: true,
        isLoadingGenerationMethods: false,
        videoEditorTimelineId: 'timeline-123',
      }),
    ).toBe('/tools/video-editor?timeline=timeline-123');
  });

  it('resolves saved hidden or ineligible preferences to Video Editor without changing their IDs', () => {
    expect(
      resolveHomeToolPath({
        preferredToolId: TOOL_IDS.CHARACTER_ANIMATE,
        currentEnv: AppEnv.WEB,
        isCloudGenerationEnabled: false,
        isLoadingGenerationMethods: false,
      }),
    ).toBe('/tools/video-editor');
    expect(TOOL_IDS.CHARACTER_ANIMATE).toBe('character-animate');
  });

  it.each([
    TOOL_IDS.IMAGE_GENERATION,
    TOOL_IDS.CHARACTER_ANIMATE,
    TOOL_IDS.EDIT_IMAGES,
    TOOL_IDS.EDIT_VIDEO,
    TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
    TOOL_IDS.JOIN_CLIPS,
    TOOL_IDS.TRAINING_DATA_HELPER,
  ])('does not launch hidden saved preference %s', (preferredToolId) => {
    expect(resolveHomeToolPath({
      preferredToolId,
      currentEnv: AppEnv.WEB,
      isCloudGenerationEnabled: true,
      isLoadingGenerationMethods: false,
    })).toBe('/tools/video-editor');
  });
});

describe('isHomeToolPathActive', () => {
  it('treats the current tool page as active even when the target has query params', () => {
    expect(isHomeToolPathActive('/tools/video-editor', '/tools/video-editor?timeline=timeline-123')).toBe(true);
  });

  it('returns false for different tool pages', () => {
    expect(isHomeToolPathActive('/tools/edit-video', '/tools/video-editor?timeline=timeline-123')).toBe(false);
  });
});
