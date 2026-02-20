import { describe, it, expect } from 'vitest';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/shared/types/steerableMotion';
import { videoTravelSettings } from './settings';

describe('videoTravelSettings', () => {
  it('targets the travel-between-images tool and shot scope', () => {
    expect(videoTravelSettings.id).toBe(TOOL_IDS.TRAVEL_BETWEEN_IMAGES);
    expect(videoTravelSettings.scope).toEqual(['shot']);
  });

  it('provides stable defaults for timeline generation flow', () => {
    expect(videoTravelSettings.defaults.generationMode).toBe('timeline');
    expect(videoTravelSettings.defaults.batchVideoFrames).toBe(61);
    expect(videoTravelSettings.defaults.batchVideoSteps).toBe(6);
    expect(videoTravelSettings.defaults.generationTypeMode).toBe('i2v');
    expect(videoTravelSettings.defaults.steerableMotionSettings).toEqual(DEFAULT_STEERABLE_MOTION_SETTINGS);
  });

  it('starts with clean content defaults for a new shot', () => {
    expect(videoTravelSettings.defaults.prompt).toBe('');
    expect(videoTravelSettings.defaults.negativePrompt).toBe('');
    expect(videoTravelSettings.defaults.pairConfigs).toEqual([]);
    expect(videoTravelSettings.defaults.shotImageIds).toEqual([]);
    expect(videoTravelSettings.defaults.loras).toEqual([]);
  });
});
