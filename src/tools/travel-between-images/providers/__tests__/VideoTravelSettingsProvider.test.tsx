import { describe, it, expect } from 'vitest';
import { VideoTravelSettingsContext, VideoTravelSettingsProvider, useVideoTravelSettings, usePromptSettings, useMotionSettings } from '../VideoTravelSettingsProvider';

describe('VideoTravelSettingsProvider', () => {
  it('exports expected members', () => {
    expect(VideoTravelSettingsContext).toBeDefined();
    expect(VideoTravelSettingsProvider).toBeDefined();
    expect(useVideoTravelSettings).toBeDefined();
    expect(usePromptSettings).toBeDefined();
    expect(useMotionSettings).toBeDefined();
  });
});
