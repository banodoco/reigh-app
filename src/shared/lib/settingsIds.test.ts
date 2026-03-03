import { describe, expect, it } from 'vitest';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { isKnownSettingsId, SETTINGS_IDS, TOOL_SETTINGS_IDS } from './settingsIds';

describe('settingsIds', () => {
  it('keeps tool-scoped settings ids aligned with canonical tool IDs', () => {
    expect(TOOL_SETTINGS_IDS).toEqual({
      TRAVEL_BETWEEN_IMAGES: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
      IMAGE_GENERATION: TOOL_IDS.IMAGE_GENERATION,
      JOIN_CLIPS: TOOL_IDS.JOIN_CLIPS,
      EDIT_VIDEO: TOOL_IDS.EDIT_VIDEO,
      EDIT_IMAGES: TOOL_IDS.EDIT_IMAGES,
      CHARACTER_ANIMATE: TOOL_IDS.CHARACTER_ANIMATE,
      TRAINING_DATA_HELPER: TOOL_IDS.TRAINING_DATA_HELPER,
    });
  });

  it('recognizes known settings ids and rejects unknown values', () => {
    expect(isKnownSettingsId(SETTINGS_IDS.GENERATIONS_PANE)).toBe(true);
    expect(isKnownSettingsId(SETTINGS_IDS.TRAVEL_AUDIO)).toBe(true);
    expect(isKnownSettingsId('unknown-setting-id')).toBe(false);
    expect(isKnownSettingsId(null)).toBe(false);
    expect(isKnownSettingsId(123)).toBe(false);
  });

  it('exposes every tool settings id through the full settings map', () => {
    const allSettings = Object.values(SETTINGS_IDS);
    const toolSettings = Object.values(TOOL_SETTINGS_IDS);

    for (const setting of toolSettings) {
      expect(allSettings).toContain(setting);
      expect(isKnownSettingsId(setting)).toBe(true);
    }
  });
});
