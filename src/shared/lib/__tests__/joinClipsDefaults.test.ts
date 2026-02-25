import { describe, it, expect } from 'vitest';
import { joinClipsSettings, type JoinClipsSettings } from '../joinClipsDefaults';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';

describe('joinClipsDefaults', () => {
  describe('joinClipsSettings', () => {
    it('has the correct tool ID', () => {
      expect(joinClipsSettings.id).toBe(TOOL_IDS.JOIN_CLIPS);
      expect(joinClipsSettings.id).toBe('join-clips');
    });

    it('has project and shot scope', () => {
      expect(joinClipsSettings.scope).toEqual(['project', 'shot']);
    });

    it('inherits all VACE generation defaults', () => {
      const defaults = joinClipsSettings.defaults;

      expect(defaults.model).toBe(VACE_GENERATION_DEFAULTS.model);
      expect(defaults.numInferenceSteps).toBe(VACE_GENERATION_DEFAULTS.numInferenceSteps);
      expect(defaults.guidanceScale).toBe(VACE_GENERATION_DEFAULTS.guidanceScale);
      expect(defaults.seed).toBe(VACE_GENERATION_DEFAULTS.seed);
      expect(defaults.randomSeed).toBe(VACE_GENERATION_DEFAULTS.randomSeed);
      expect(defaults.replaceMode).toBe(VACE_GENERATION_DEFAULTS.replaceMode);
      expect(defaults.negativePrompt).toBe(VACE_GENERATION_DEFAULTS.negativePrompt);
      expect(defaults.prompt).toBe(VACE_GENERATION_DEFAULTS.prompt);
    });

    it('has join-clips-specific frame counts', () => {
      expect(joinClipsSettings.defaults.contextFrameCount).toBe(15);
      expect(joinClipsSettings.defaults.gapFrameCount).toBe(23);
    });

    it('has useIndividualPrompts defaulting to false', () => {
      expect(joinClipsSettings.defaults.useIndividualPrompts).toBe(false);
    });

    it('has useInputVideoResolution defaulting to false', () => {
      expect(joinClipsSettings.defaults.useInputVideoResolution).toBe(false);
    });

    it('has useInputVideoFps defaulting to false', () => {
      expect(joinClipsSettings.defaults.useInputVideoFps).toBe(false);
    });

    it('has noisedInputVideo defaulting to 0', () => {
      expect(joinClipsSettings.defaults.noisedInputVideo).toBe(0);
    });

    it('has loopFirstClip defaulting to false', () => {
      expect(joinClipsSettings.defaults.loopFirstClip).toBe(false);
    });

    it('has undefined legacy video URL fields', () => {
      expect(joinClipsSettings.defaults.startingVideoUrl).toBeUndefined();
      expect(joinClipsSettings.defaults.startingVideoPosterUrl).toBeUndefined();
      expect(joinClipsSettings.defaults.endingVideoUrl).toBeUndefined();
      expect(joinClipsSettings.defaults.endingVideoPosterUrl).toBeUndefined();
    });

    it('has empty clips array by default', () => {
      expect(joinClipsSettings.defaults.clips).toEqual([]);
    });

    it('has empty transitionPrompts array by default', () => {
      expect(joinClipsSettings.defaults.transitionPrompts).toEqual([]);
    });

    it('has empty loras array by default', () => {
      expect(joinClipsSettings.defaults.loras).toEqual([]);
    });

    it('has hasEverSetLoras defaulting to false', () => {
      expect(joinClipsSettings.defaults.hasEverSetLoras).toBe(false);
    });
  });

  describe('JoinClipsSettings type', () => {
    it('is compatible with the defaults shape', () => {
      const settings: JoinClipsSettings = { ...joinClipsSettings.defaults };
      expect(settings).toBeDefined();
    });
  });
});
