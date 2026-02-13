import { describe, it, expect } from 'vitest';
import { editVideoSettings, type EditVideoSettings } from '../editVideoDefaults';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';

describe('editVideoDefaults', () => {
  describe('editVideoSettings', () => {
    it('has the correct tool ID', () => {
      expect(editVideoSettings.id).toBe(TOOL_IDS.EDIT_VIDEO);
      expect(editVideoSettings.id).toBe('edit-video');
    });

    it('has project scope', () => {
      expect(editVideoSettings.scope).toEqual(['project']);
    });

    it('inherits all VACE generation defaults', () => {
      const defaults = editVideoSettings.defaults;

      expect(defaults.model).toBe(VACE_GENERATION_DEFAULTS.model);
      expect(defaults.numInferenceSteps).toBe(VACE_GENERATION_DEFAULTS.numInferenceSteps);
      expect(defaults.guidanceScale).toBe(VACE_GENERATION_DEFAULTS.guidanceScale);
      expect(defaults.seed).toBe(VACE_GENERATION_DEFAULTS.seed);
      expect(defaults.randomSeed).toBe(VACE_GENERATION_DEFAULTS.randomSeed);
      expect(defaults.replaceMode).toBe(VACE_GENERATION_DEFAULTS.replaceMode);
      expect(defaults.negativePrompt).toBe(VACE_GENERATION_DEFAULTS.negativePrompt);
      expect(defaults.priority).toBe(VACE_GENERATION_DEFAULTS.priority);
      expect(defaults.prompt).toBe(VACE_GENERATION_DEFAULTS.prompt);
      expect(defaults.enhancePrompt).toBe(VACE_GENERATION_DEFAULTS.enhancePrompt);
    });

    it('has edit-video-specific frame counts', () => {
      expect(editVideoSettings.defaults.contextFrameCount).toBe(8);
      expect(editVideoSettings.defaults.gapFrameCount).toBe(12);
    });

    it('has undefined selected video fields by default', () => {
      expect(editVideoSettings.defaults.selectedVideoUrl).toBeUndefined();
      expect(editVideoSettings.defaults.selectedVideoPosterUrl).toBeUndefined();
      expect(editVideoSettings.defaults.selectedVideoGenerationId).toBeUndefined();
    });

    it('has portion selection defaulting to 0', () => {
      expect(editVideoSettings.defaults.portionStartTime).toBe(0);
      expect(editVideoSettings.defaults.portionEndTime).toBe(0);
    });

    it('has empty loras array by default', () => {
      expect(editVideoSettings.defaults.loras).toEqual([]);
    });

    it('has hasEverSetLoras defaulting to false', () => {
      expect(editVideoSettings.defaults.hasEverSetLoras).toBe(false);
    });
  });

  describe('EditVideoSettings type', () => {
    it('is compatible with the defaults shape', () => {
      // Type assertion test - if this compiles, the type is correct
      const settings: EditVideoSettings = { ...editVideoSettings.defaults };
      expect(settings).toBeDefined();
    });
  });
});
